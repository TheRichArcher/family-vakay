from google.cloud.firestore_v1.base_query import FieldFilter
from ..firebase_admin import get_async_firestore_client
from typing import List
from .. import schemas
from datetime import datetime
from fastapi import HTTPException
import logging
import math
from google.cloud import firestore

logger = logging.getLogger(__name__)

class ActivitiesService:
    def __init__(self):
        self.db = get_async_firestore_client()
        self.activities_collection = self.db.collection('activities')
        self.trips_collection = self.db.collection('trips')

    async def _user_can_access_trip(self, user_id: str, trip_id: str) -> bool:
        if not trip_id:
            return False
        trip_doc = await self.trips_collection.document(trip_id).get()
        if not trip_doc.exists:
            return False
        trip_data = trip_doc.to_dict()
        return user_id == trip_data.get('owner_id') or user_id in trip_data.get('participants', [])

    async def get_activities_for_trip(self, trip_id: str, current_user: dict) -> List[dict]:
        if not await self._user_can_access_trip(current_user['uid'], trip_id):
            raise PermissionError("User is not authorized to view activities for this trip.")
        
        return await self.get_activities_for_trip_internal(trip_id, current_user['uid'])

    async def get_activities_for_trip_internal(self, trip_id: str, user_id_for_hidden_check: str | None = None) -> List[dict]:
        activities_stream = self.activities_collection.where(filter=FieldFilter('tripId', '==', trip_id)).stream()
        activities = []
        async for activity in activities_stream:
            try:
                activity_data = activity.to_dict()
                
                if user_id_for_hidden_check and user_id_for_hidden_check in activity_data.get('hiddenFrom', []):
                    continue

                activity_data['id'] = activity.id
                
                # --- START DEFENSIVE DATA CLEANUP ---
                # For backward compatibility, ensure that fields that are now non-optional
                # have a default value if they are missing from older documents.
                activity_data.setdefault('is_idea', False)
                activity_data.setdefault('is_booked', False)
                activity_data.setdefault('is_surprise', False)
                activity_data.setdefault('challenges', [])
                activity_data.setdefault('images', [])
                activity_data.setdefault('imageUrls', [])

                # Also, loop through challenges and fix any that are corrupted.
                repaired_challenges = []
                for ch in activity_data.get('challenges', []):
                    if isinstance(ch, dict):
                        if not ch.get('text'):
                            # This is a corrupted challenge object. Fix it in memory.
                            logger.warning(f"Repairing corrupted challenge in activity {activity.id}: {ch}")
                            ch['text'] = 'Restored: Photo Challenge'
                            ch.setdefault('completed', False)
                            ch.setdefault('status', 'pending')
                        repaired_challenges.append(ch)
                    else:
                        logger.warning(f"Skipping malformed challenge in activity {activity.id}. Expected a dict, but got {type(ch)}: {ch}")
                activity_data['challenges'] = repaired_challenges
                # --- END DEFENSIVE DATA CLEANUP ---

                # Convert challenges from dict to sorted list if necessary
                if isinstance(activity_data.get('challenges'), dict):
                    challenges_dict = activity_data['challenges']
                    # Safely sort by numeric keys, ignoring non-numeric ones.
                    sorted_items = sorted(
                        ((k, v) for k, v in challenges_dict.items() if k.isdigit()),
                        key=lambda item: int(item[0])
                    )
                    activity_data['challenges'] = [v for k, v in sorted_items]

                # Validate with Pydantic model to ensure it matches the schema
                schemas.Activity.model_validate(activity_data)
                activities.append(activity_data)
            except Exception as e:
                logger.error(f"Failed to process activity {activity.id} for trip {trip_id}: {e}", exc_info=True)
                
        return activities

    async def get_all_activities(self) -> List[dict]:
        activities_stream = self.activities_collection.stream()
        activities = []
        async for activity in activities_stream:
            activity_data = activity.to_dict()
            activity_data['id'] = activity.id
            
            # Sanitize NaN float values before they cause JSON serialization errors
            for field in ['budget', 'cost', 'additionalExpenses']:
                if field in activity_data and isinstance(activity_data[field], float) and math.isnan(activity_data[field]):
                    activity_data[field] = None
            
            activities.append(activity_data)
        return activities

    async def get_activity(self, activity_id: str, current_user: dict) -> dict | None:
        activity_doc = await self.activities_collection.document(activity_id).get()
        if not activity_doc.exists:
            return None
        activity_data = activity_doc.to_dict()
        
        # Convert challenges from dict to sorted list if necessary
        if isinstance(activity_data.get('challenges'), dict):
            challenges_dict = activity_data['challenges']
            # Safely sort by numeric keys, ignoring non-numeric ones.
            sorted_items = sorted(
                ((k, v) for k, v in challenges_dict.items() if k.isdigit()),
                key=lambda item: int(item[0])
            )
            activity_data['challenges'] = [v for k, v in sorted_items]

        if not await self._user_can_access_trip(current_user['uid'], activity_data.get('tripId')):
            raise PermissionError("User is not authorized to access this activity.")
            
        activity_data['id'] = activity_doc.id
        return activity_data

    async def create_activity(self, activity_data: schemas.ActivityCreate, current_user: dict) -> dict:
        if not await self._user_can_access_trip(current_user['uid'], activity_data.trip_id):
            raise PermissionError("User is not authorized to add activities to this trip.")

        new_activity_data = activity_data.model_dump(by_alias=True, exclude_unset=True)
        new_activity_data['created_by'] = current_user['uid']
        new_activity_data['created_at'] = datetime.utcnow()

        logger.info(f"Creating activity with data: {new_activity_data}")

        doc_ref, _write_result = await self.activities_collection.add(new_activity_data)
        
        created_activity_doc = await doc_ref.get()
        created_activity = created_activity_doc.to_dict()
        created_activity['id'] = doc_ref.id
        return created_activity

    async def update_activity(self, activity_id: str, activity_update: schemas.ActivityUpdate, current_user: dict) -> dict:
        activity_doc_ref = self.activities_collection.document(activity_id)
        activity_doc = await activity_doc_ref.get()

        if not activity_doc.exists:
            raise ValueError("Activity not found")

        activity_data = activity_doc.to_dict()
        trip_id = activity_data.get('tripId')

        # Authorization Check: User must be an admin or the trip owner.
        user_is_admin = current_user.get("role") == "admin"
        user_is_owner = False
        if trip_id:
            trip_doc = await self.trips_collection.document(trip_id).get()
            if trip_doc.exists:
                user_is_owner = trip_doc.to_dict().get('owner_id') == current_user.get('uid')

        if not (user_is_admin or user_is_owner):
            raise PermissionError("User is not authorized to update this activity.")
        
        update_data = activity_update.model_dump(by_alias=True, exclude_unset=True)
        update_data['updated_at'] = datetime.utcnow()

        # Preserve activity_types if they are not in the update payload but exist in the original document
        if 'activity_types' not in update_data and 'activity_types' in activity_data:
            update_data['activity_types'] = activity_data['activity_types']

        # Definitively sanitize the challenges list before updating.
        # This prevents corrupted challenge data from causing a validation error on write.
        if 'challenges' in update_data and isinstance(update_data['challenges'], list):
            sanitized_challenges = []
            for ch_data in update_data['challenges']:
                try:
                    # Validate each challenge against the Pydantic schema.
                    # This is a robust way to ensure data integrity.
                    schemas.Challenge.model_validate(ch_data)
                    sanitized_challenges.append(ch_data)
                except Exception as e:
                    # If validation fails, log it and discard the corrupted challenge.
                    logger.warning(f"Discarding corrupted challenge during update for activity {activity_id}. Reason: {e}. Data: {ch_data}")
            update_data['challenges'] = sanitized_challenges

        # Convert date string to datetime object if it exists
        if 'date' in update_data and isinstance(update_data['date'], str):
            try:
                # Assuming the date string is in 'YYYY-MM-DD' format
                update_data['date'] = datetime.strptime(update_data['date'], '%Y-%m-%d')
            except ValueError:
                # Handle case where the date string is not in the expected format
                raise HTTPException(status_code=422, detail="Invalid date format. Please use YYYY-MM-DD.")
        
        await self.activities_collection.document(activity_id).update(update_data)
        
        updated_doc = await self.activities_collection.document(activity_id).get()
        updated_data = updated_doc.to_dict()
        updated_data['id'] = updated_doc.id
        return updated_data

    async def delete_activity(self, activity_id: str, trip_id: str | None, current_user: dict):
        activity_ref = self.activities_collection.document(activity_id)
        activity_doc = await activity_ref.get()

        if not activity_doc.exists:
            return

        if current_user.get("role") != "admin":
            raise PermissionError("You are not authorized to delete this activity.")

        activity_data = activity_doc.to_dict()
        user_is_admin = current_user.get('role') == 'admin'

        # If trip_id is not provided, we are deleting an idea
        if trip_id is None:
            if not activity_data.get('isIdea'):
                raise ValueError("Cannot delete a non-idea activity without a trip_id.")
            if not user_is_admin:
                raise PermissionError("Only admins can delete standalone activity ideas.")
            await activity_ref.delete()
            return

        # Standard deletion logic for activities within a trip
        if activity_data.get('tripId') != trip_id:
            raise ValueError("Activity does not belong to the specified trip.")

        trip_doc = await self.trips_collection.document(trip_id).get()
        if not trip_doc.exists:
            raise ValueError("Associated trip not found.")

        await activity_ref.delete()

    async def update_activity_internal(self, activity_id: str, update_data: dict):
        """
        Internal-facing update method for processes like background scoring.
        This method is now async to match the client.
        """
        # --- START PRE-WRITE VALIDATION ---
        if 'challenges' in update_data:
            challenges_to_validate = update_data['challenges']
            if isinstance(challenges_to_validate, list):
                for i, ch in enumerate(challenges_to_validate):
                    if not isinstance(ch, dict):
                        logger.error(
                            f"CRITICAL_VALIDATION_FAILURE: Attempting to write non-dict "
                            f"to challenges array in update_activity_internal. "
                            f"Activity ID: {activity_id}, Index: {i}, Data: {ch}"
                        )
                        # Abort the update to prevent corruption
                        return
        # --- END PRE-WRITE VALIDATION ---
        await self.activities_collection.document(activity_id).update(update_data)

    async def cast_vote(self, activity_id: str, user_id: str, vote: str) -> dict:
        activity = await self.get_activity(activity_id, {'uid': user_id})
        if not activity:
            raise ValueError("Activity not found")

        update_data = {f'votes.{user_id}': vote}
        await self.activities_collection.document(activity_id).update(update_data)
        
        updated_doc = await self.activities_collection.document(activity_id).get()
        return updated_doc.to_dict()

    async def add_rating(self, activity_id: str, user_id: str, rating: schemas.ActivityRating) -> dict:
        # get_activity also handles the permission check
        activity = await self.get_activity(activity_id, {'uid': user_id})
        if not activity:
            raise ValueError("Activity not found")

        rating_data = {
            "rating": rating.rating,
            "feedback": rating.feedback,
            "ratedAt": datetime.utcnow()
        }
        
        update_data = {f'ratings.{user_id}': rating_data}
        
        await self.activities_collection.document(activity_id).update(update_data)
        
        updated_doc = await self.activities_collection.document(activity_id).get()
        updated_activity = updated_doc.to_dict()
        updated_activity['id'] = updated_doc.id
        return updated_activity

    async def add_image_to_gallery(
        self,
        activity_id: str,
        user_id: str,
        image_url: str,
        resized_url: str | None = None,
        thumbnail_url: str | None = None,
    ) -> dict:
        """
        Adds a new image to the activity's image gallery.
        Supports optional derivative URLs for resized and thumbnail images.
        This operation is atomic to prevent race conditions.
        """
        activity_ref = self.activities_collection.document(activity_id)

        new_image_data = {
            "url": image_url,
            "userId": user_id,
            "uploadedAt": datetime.utcnow().isoformat()
        }
        if resized_url:
            new_image_data["resizedUrl"] = resized_url
        if thumbnail_url:
            new_image_data["thumbnailUrl"] = thumbnail_url

        await activity_ref.update({
            "images": firestore.ArrayUnion([new_image_data])
        })

        updated_doc = await activity_ref.get()
        if not updated_doc.exists:
            raise ValueError("Activity not found after update.")

        updated_data = updated_doc.to_dict()
        updated_data['id'] = updated_doc.id
        return updated_data