import os
import logging
import json
import re
from openai import OpenAI
from typing import List

from .. import schemas
from ..services.trips_service import TripsService
from ..services.activities_service import ActivitiesService
from ..services.user_service import UserService
from ..services.storage_service import get_storage_service
from ..firebase_admin import get_async_firestore_client
from .ai_prompts import (
    construct_scavenger_hunt_prompt, 
    construct_scoring_prompt,
    construct_joke_fact_prompt,
    construct_activity_suggestion_prompt,
    construct_story_prompt
)
from firebase_admin import firestore
import datetime

def _extract_json_from_string(text: str) -> dict | None:
    """
    Finds and parses the first valid JSON object from a string.
    Handles cases where the JSON is embedded in other text using ```json ... ```.
    """
    # Pattern to find JSON within triple backticks
    pattern = r"```json\s*([\s\S]*?)\s*```"
    match = re.search(pattern, text)
    
    json_string = text
    if match:
        json_string = match.group(1)
    
    # If no backticks found, or after extracting, try to find the start of a JSON object
    first_brace = json_string.find('{')
    last_brace = json_string.rfind('}')
    
    if first_brace != -1 and last_brace != -1:
        potential_json = json_string[first_brace:last_brace+1]
        try:
            return json.loads(potential_json)
        except json.JSONDecodeError as e:
            logging.error(f"JSON decoding failed after extraction: {e}")
            logging.error(f"Content that failed: {potential_json}")
            return None
    
    return None

class AIService:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        self.client = OpenAI(api_key=api_key) if api_key else None
        self.model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

    def _build_fallback_activity_suggestions(
        self,
        location: str,
        context: str,
        trip_context: dict,
    ) -> list[dict]:
        """Return useful structured suggestions when OpenAI is not configured."""
        existing_names = {
            str(activity.get("name", "")).strip().lower()
            for activity in trip_context.get("existingActivities", [])
            if activity.get("name")
        }
        budget = trip_context.get("trip", {}).get("budget")
        lower_context = (context or "").lower()

        templates = [
            {
                "id": "fallback-food",
                "title": f"Family food crawl in {location}",
                "category": "Dining",
                "why": "Pick two or three low-pressure food stops so everyone gets a say without turning dinner into a debate.",
                "kidFit": "Good for mixed ages",
                "costLevel": "$$" if budget else "Flexible",
                "timeNeeded": "1.5 to 2 hours",
            },
            {
                "id": "fallback-outdoor",
                "title": f"Easy outdoor reset near {location}",
                "category": "Outdoor",
                "why": "A simple walk, viewpoint, beach, park, or scenic stop gives the trip breathing room between booked activities.",
                "kidFit": "Good for kids who need to move",
                "costLevel": "$",
                "timeNeeded": "45 to 90 minutes",
            },
            {
                "id": "fallback-tourist",
                "title": f"One classic {location} tourist stop",
                "category": "Tourist",
                "why": "Do one obvious local attraction on purpose, then keep the rest of the day flexible.",
                "kidFit": "Best when paired with snacks or a short visit",
                "costLevel": "$$",
                "timeNeeded": "1 to 3 hours",
            },
            {
                "id": "fallback-active",
                "title": f"Burn-energy activity in {location}",
                "category": "Entertainment",
                "why": "Use this when the kids are restless: arcade, mini golf, bowling, bikes, climbing, or another easy win nearby.",
                "kidFit": "Strong fit for active kids",
                "costLevel": "$$",
                "timeNeeded": "1 to 2 hours",
            },
            {
                "id": "fallback-relax",
                "title": f"Low-key recovery block in {location}",
                "category": "Relaxation",
                "why": "Protect one block with no ambitious agenda so the trip does not become a forced march.",
                "kidFit": "Good for tired kids and adults",
                "costLevel": "$",
                "timeNeeded": "60 to 90 minutes",
            },
        ]

        if "food" in lower_context or "foodie" in lower_context:
            ordered = [templates[0], templates[2], templates[1], templates[3], templates[4]]
        elif "active" in lower_context or "athletic" in lower_context:
            ordered = [templates[3], templates[1], templates[2], templates[0], templates[4]]
        elif "relax" in lower_context:
            ordered = [templates[4], templates[1], templates[0], templates[2], templates[3]]
        elif "tourist" in lower_context:
            ordered = [templates[2], templates[0], templates[1], templates[3], templates[4]]
        else:
            ordered = templates

        deduped = [
            suggestion
            for suggestion in ordered
            if suggestion["title"].strip().lower() not in existing_names
        ]
        return deduped[:5] or ordered[:3]

    def _get_age_group(self, age: int | None) -> str:
        """Determines the age group string from a numerical age."""
        if age is None:
            return 'all'
        if 5 <= age <= 7:
            return '5-7'
        if 8 <= age <= 9:
            return '8-9'
        if 10 <= age <= 13:
            return '10-13'
        if 14 <= age <= 17:
            return '14-17'
        if age >= 18:
            return '18+'
        return 'all'

    async def generate_hunt_for_trip(self, trip_id: str, current_user: dict) -> List[schemas.Activity]:
        trips_service = TripsService()
        activities_service = ActivitiesService()

        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        activities = await activities_service.get_activities_for_trip(trip_id, current_user)

        if not activities:
            raise ValueError("Trip has no activities to generate challenges for.")

        user_age = current_user.get('age')
        target_age_group = self._get_age_group(user_age)
        
        # We want to generate for the user's specific age group and the 'all' group.
        age_groups_to_generate = {'all', target_age_group}

        updated_activities_map = {act['id']: act for act in activities}
        
        for activity in activities:
            activity_id = activity.get('id')
            if not activity_id:
                logging.warning("Skipping an activity because it has no ID.")
                continue

            existing_challenges = activity.get('challenges', [])
            existing_age_groups = {ch.get('age_group') for ch in existing_challenges}
            
            newly_generated_challenges = []

            for age_group_to_check in age_groups_to_generate:
                if age_group_to_check in existing_age_groups:
                    logging.info(f"Skipping generation for age group '{age_group_to_check}' in activity {activity_id}; challenges already exist.")
                    continue

                prompt = construct_scavenger_hunt_prompt(trip, activity, user_age, age_group_to_check)

                if not prompt:
                    logging.warning(f"Could not generate prompt for activity {activity_id}, it might be missing a location.")
                    continue

                if not self.client:
                    logging.info("OPENAI_API_KEY not set; skipping AI challenge generation and leaving activities unchanged.")
                    continue
                try:
                    logging.info(f"Generating AI challenges for age group '{age_group_to_check}' for activity {activity_id} in trip {trip_id}.")
                    response = self.client.chat.completions.create(
                        model=self.model,
                        messages=[{"role": "user", "content": prompt}],
                        temperature=0.7,
                        response_format={"type": "json_object"},
                        max_tokens=4096 
                    )
                    response_content = response.choices[0].message.content
                    challenge_data = _extract_json_from_string(response_content)

                    if not challenge_data or activity_id not in challenge_data:
                        logging.error(f"Could not extract valid JSON from AI response for activity {activity_id}.")
                        logging.error(f"Full response content: {response_content}")
                        continue 

                    challenge_info = challenge_data[activity_id]
                    challenge_list = challenge_info.get("challenges", [])
                    
                    if not challenge_list:
                        logging.warning(f"AI returned no challenges for activity {activity_id}.")
                        continue
                    
                    newly_generated_challenges.extend(challenge_list)

                except Exception as e:
                    logging.error(f"Error processing age group '{age_group_to_check}' for activity {activity_id}: {e}")
                    # We continue to the next age group/activity instead of failing the whole hunt
                    continue
            
            if newly_generated_challenges:
                # Combine existing with new, then re-index everything to be safe
                final_challenges = existing_challenges + newly_generated_challenges
                for i, challenge in enumerate(final_challenges):
                    if not challenge.get("text"):
                        logging.warning(f"Skipping malformed challenge (missing text) for activity {activity_id}")
                        continue
                    challenge['challenge_index'] = i
                    challenge.setdefault('completions', {})
                
                # Update the activity in our map and in Firestore
                updated_activities_map[activity_id]['challenges'] = final_challenges
                await activities_service.update_activity_internal(activity_id, {'challenges': final_challenges})
                logging.info(f"Successfully generated and saved {len(newly_generated_challenges)} new challenges for activity {activity_id}.")

        logging.info(f"Finished scavenger hunt generation for trip {trip_id}.")
        return list(updated_activities_map.values())

    async def score_challenge_submission(self, activity_id: str, challenge_index: int, user_id: str, image_url: str, challenge_text: str, age_group: str | None):
        user_service = UserService()
        activities_service = ActivitiesService()
        storage_service = get_storage_service()
        
        final_update_data = {}
        
        try:
            user_profile = await user_service.get_user_profile(user_id)
            user_age = user_profile.get('age', 'unknown') if user_profile else 'unknown'

            if not storage_service.bucket:
                raise Exception("Storage service not configured.")
            
            signed_download_url = storage_service.generate_signed_download_url(image_url)

            prompt = construct_scoring_prompt(challenge_text, user_age)

            if not self.client:
                raise Exception("AI features are disabled (no OPENAI_API_KEY).")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "user", "content": [{"type": "text", "text": prompt}, {"type": "image_url", "image_url": {"url": signed_download_url}}]}
                ],
                response_format={"type": "json_object"},
                max_tokens=300,
            )

            response_content = response.choices[0].message.content
            ai_response = _extract_json_from_string(response_content)
            
            if not ai_response:
                logging.error(f"Could not extract valid JSON from AI scoring response for user {user_id}, activity {activity_id}.")
                logging.error(f"Full scoring response content: {response_content}")
                raise Exception("The AI judge returned a response, but it was not valid JSON.")

            points = ai_response.get('points', 0)
            comment = ai_response.get('comment', 'No comment from the judge.')

            multiplier = self._get_age_group_multiplier(age_group)
            final_points = round(points * multiplier)

            final_update_data = {
                'pointsAwarded': final_points,
                'status': 'approved' if points > 4 else 'rejected',
                'comment': comment,
                'imageUrl': image_url,
                'submittedAt': datetime.datetime.utcnow().isoformat()
            }
            
            if final_points > 0:
                await user_service.update_user_profile(user_id, {'points': firestore.Increment(final_points)})

        except Exception as e:
            logging.error(f"Error scoring challenge for user {user_id} on activity {activity_id}: {e}")
            final_update_data = {
                'status': 'error',
                'comment': "The AI judge got confused! An adult may need to review this.",
                'pointsAwarded': 0,
                'imageUrl': image_url,
                'submittedAt': datetime.datetime.utcnow().isoformat()
            }
        
        finally:
            # This is the safe read-modify-write approach for updating an array in Firestore.
            try:
                activity = await activities_service.get_activity(activity_id, {'uid': user_id})
                if not activity:
                    logging.error(f"FATAL: Activity {activity_id} not found during final update.")
                    return

                challenges = activity.get('challenges', [])
                if not (0 <= challenge_index < len(challenges)):
                    logging.error(f"FATAL: Challenge index {challenge_index} out of bounds for activity {activity_id}.")
                    return

                # Get the specific challenge being updated
                challenge_to_update = challenges[challenge_index]
                
                # Pre-update validation and logging
                if 'text' not in challenge_to_update or not challenge_to_update['text']:
                    logging.warning(
                        f"CRITICAL_DATA_ISSUE: Attempting to update challenge {challenge_index} "
                        f"for activity {activity_id}, but 'text' field is missing or empty. "
                        f"Challenge data: {challenge_to_update}"
                    )

                # Update the completions for the user
                if 'completions' not in challenge_to_update:
                    challenge_to_update['completions'] = {}
                challenge_to_update['completions'][user_id] = final_update_data
                
                # The entire challenges array is written back to Firestore
                await activities_service.update_activity_internal(activity_id, {'challenges': challenges})
                logging.info(f"Challenge scoring update complete for user {user_id} on activity {activity_id}.")

            except Exception as e:
                logging.error(f"FATAL: Failed to execute safe update for {activity_id}. Error: {e}", exc_info=True)

    def _get_age_group_multiplier(self, age_group: str | None) -> float:
        """Returns the points multiplier for a given age group."""
        if not age_group:
            return 1.0
        
        multipliers = {
            "5-7": 1.5,
            "8-9": 1.3,
            "10-13": 1.1,
        }
        
        return multipliers.get(age_group, 1.0)

    async def generate_joke_or_fact(self, trip_id: str, current_user: dict) -> dict:
        trips_service = TripsService()
        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        location = trip.location or 'our vacation'
        user_age = current_user.get('age', 7)

        history_ref = trips_service.trips_collection.document(trip_id).collection('fun_feed_history').order_by('createdAt', direction=firestore.Query.DESCENDING).limit(10)
        history_docs = history_ref.stream()
        history_list = [doc.to_dict() async for doc in history_docs]
        
        prompt = construct_joke_fact_prompt(location, user_age, history_list)

        try:
            if not self.client:
                raise Exception("AI features are disabled (no OPENAI_API_KEY).")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=1.0,
                max_tokens=150,
            )
            content = response.choices[0].message.content.strip()

            last_item_type = history_list[0]['type'] if history_list else None
            if content.startswith("Q:"):
                next_item_type = 'joke'
            elif last_item_type == 'joke':
                next_item_type = 'fact'
            else:
                next_item_type = 'joke' if last_item_type == 'fact' else 'fact'

            history_entry = {
                'text': content,
                'type': next_item_type,
                'createdAt': datetime.datetime.utcnow(),
                'userId': current_user['uid']
            }
            await trips_service.trips_collection.document(trip_id).collection('fun_feed_history').add(history_entry)

            return {"text": content}
        except Exception as e:
            logging.error(f"Error generating joke/fact from OpenAI for trip {trip_id}: {e}")
            raise Exception("Couldn't think of anything funny right now. Please try again!")

    async def suggest_activity(self, trip_id: str, context: str, current_user: dict) -> dict:
        trips_service = TripsService()
        activities_service = ActivitiesService()
        user_service = UserService()

        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        trip_payload = trip.model_dump(by_alias=True) if hasattr(trip, "model_dump") else dict(trip)
        location = trip_payload.get("location") or 'our vacation spot'

        user_profile = await user_service.get_user_profile(current_user["uid"])
        user_age = (user_profile or {}).get("age") or current_user.get('age') or 7

        participants = []
        participant_ids = trip_payload.get("participants") or []
        try:
            participant_profiles = await user_service.get_users_by_ids(participant_ids)
            participants = [
                {
                    "uid": profile.get("uid"),
                    "name": profile.get("name"),
                    "role": profile.get("role"),
                    "age": profile.get("age"),
                    "isKid": profile.get("isKid") if "isKid" in profile else profile.get("is_kid"),
                }
                for profile in participant_profiles
            ]
        except Exception:
            logging.warning(
                "Could not load participant profiles for activity suggestions",
                extra={"trip_id": trip_id},
                exc_info=True,
            )

        existing_activities = []
        try:
            activities = await activities_service.get_activities_for_trip(trip_id, current_user)
            existing_activities = [
                {
                    "name": activity.get("name"),
                    "description": activity.get("description"),
                    "date": str(activity.get("date")) if activity.get("date") else None,
                    "time": activity.get("time"),
                    "location": activity.get("location"),
                    "category": activity.get("activityTypes") or activity.get("activity_types"),
                    "budget": activity.get("budget") or activity.get("cost"),
                    "isBooked": activity.get("isBooked") if "isBooked" in activity else activity.get("is_booked"),
                }
                for activity in activities[:25]
            ]
        except Exception:
            logging.warning(
                "Could not load existing activities for activity suggestions",
                extra={"trip_id": trip_id},
                exc_info=True,
            )

        trip_context = {
            "trip": {
                "name": trip_payload.get("name"),
                "description": trip_payload.get("description"),
                "location": trip_payload.get("location"),
                "startDate": str(trip_payload.get("startDate") or trip_payload.get("start_date")),
                "endDate": str(trip_payload.get("endDate") or trip_payload.get("end_date")),
                "budget": trip_payload.get("budget"),
                "status": trip_payload.get("status"),
            },
            "participants": participants,
            "existingActivities": existing_activities,
        }

        if not self.client:
            suggestions = self._build_fallback_activity_suggestions(location, context, trip_context)
            return {"text": json.dumps(suggestions), "suggestions": suggestions}

        prompt = construct_activity_suggestion_prompt(location, context, user_age, trip_context)

        try:
            if not self.client:
                raise Exception("AI features are disabled (no OPENAI_API_KEY).")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                response_format={"type": "json_object"},
                max_tokens=1200,
            )
            content = response.choices[0].message.content.strip()
            parsed = _extract_json_from_string(content)
            suggestions = (parsed or {}).get("suggestions")
            if not isinstance(suggestions, list):
                logging.error(f"AI activity suggestion response was not a suggestions list: {content}")
                raise Exception("The AI returned malformed suggestions.")
            normalized = []
            for index, suggestion in enumerate(suggestions[:5], start=1):
                if not isinstance(suggestion, dict):
                    continue
                title = str(suggestion.get("title") or "").strip()
                if not title:
                    continue
                normalized.append({
                    "id": str(suggestion.get("id") or index),
                    "title": title,
                    "category": str(suggestion.get("category") or "Flexible"),
                    "why": str(suggestion.get("why") or ""),
                    "kidFit": str(suggestion.get("kidFit") or suggestion.get("kid_fit") or ""),
                    "costLevel": str(suggestion.get("costLevel") or suggestion.get("cost_level") or ""),
                    "timeNeeded": str(suggestion.get("timeNeeded") or suggestion.get("time_needed") or ""),
                })
            if not normalized:
                raise Exception("The AI returned empty suggestions.")
            return {"text": json.dumps(normalized), "suggestions": normalized}
        except Exception as e:
            logging.error(f"Error generating activity suggestion from OpenAI for trip {trip_id}: {e}")
            raise Exception("My creativity is running low. Please try again!")

    async def create_story(self, trip_id: str, keywords: List[str], current_user: dict) -> dict:
        if not keywords:
            raise ValueError("Please provide at least one keyword for the story.")
            
        trips_service = TripsService()
        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        location = trip.get('location', 'a magical place')
        user_age = current_user.get('age', 7)
        prompt = construct_story_prompt(location, keywords, user_age)

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[{"role": "user", "content": prompt}],
                temperature=0.7,
                max_tokens=400,
            )
            content = response.choices[0].message.content.strip()
            return {"text": content}
        except Exception as e:
            logging.error(f"Error generating story from OpenAI: {e}")
            raise Exception("My storytelling machine is snoozing. Please try again!")
