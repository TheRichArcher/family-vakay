from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter, Or
from pydantic import ValidationError
import logging
import asyncio

from ..firebase_admin import get_async_firestore_client
from .. import schemas
from datetime import datetime, date
from typing import List
from ..services.user_service import UserService

def _get_trip_status(start_date: date, end_date: date, current_status: schemas.TripStatus) -> schemas.TripStatus:
    """Helper function to determine trip status based on dates."""
    if current_status == schemas.TripStatus.CANCELLED:
        return schemas.TripStatus.CANCELLED

    today = date.today()

    if end_date < today:
        return schemas.TripStatus.COMPLETED
    elif start_date <= today <= end_date:
        return schemas.TripStatus.IN_PROGRESS
    else: # start_date > today
        return schemas.TripStatus.UPCOMING

class TripsService:
    def __init__(self):
        self.db = get_async_firestore_client()
        self.trips_collection = self.db.collection('trips')

    async def get_trip_by_id(self, trip_id: str, current_user: dict):
        user_id = current_user['uid']
        trip_doc = await self.trips_collection.document(trip_id).get()
        if not trip_doc.exists:
            raise ValueError("Trip not found")

        trip_data = trip_doc.to_dict()

        # --- Start data migration for robustness ---
        if 'start_date' in trip_data and 'startDate' not in trip_data:
            trip_data['startDate'] = trip_data.pop('start_date')
        if 'end_date' in trip_data and 'endDate' not in trip_data:
            trip_data['endDate'] = trip_data.pop('end_date')
        if 'owner_id' in trip_data and 'ownerId' not in trip_data:
            trip_data['ownerId'] = trip_data.pop('owner_id')
        if 'cover_image_url' in trip_data and 'coverImageUrl' not in trip_data:
            trip_data['coverImageUrl'] = trip_data.pop('cover_image_url')
        # --- End data migration ---

        # Check for both camelCase and snake_case owner fields for backward compatibility
        is_owner = user_id == trip_data.get('ownerId')
        is_participant = user_id in trip_data.get('participants', [])

        if not is_owner and not is_participant:
            raise PermissionError("User is not authorized to access this trip")

        trip_data['id'] = trip_id
        try:
            # Validate the data against the Pydantic model
            validated_trip = schemas.Trip.model_validate(trip_data)
            return validated_trip
        except ValidationError as e:
            logging.error(f"Data for trip {trip_id} is invalid: {e}")
            # Raise a ValueError to be handled by the router as a 404
            raise ValueError(f"Trip {trip_id} contains corrupted or outdated data.")

    async def get_trips_for_user(self, current_user: dict) -> List[schemas.Trip]:
        user_id = current_user['uid']

        # We need to query for trips where the user is a participant OR the owner.
        # To support both old and new data, we check for both ownerId and owner_id.

        # Query for trips where user is a participant
        participant_query = self.trips_collection.where(filter=FieldFilter('participants', 'array_contains', user_id))

        # Query for trips where user is the owner (new format)
        owner_query = self.trips_collection.where(filter=FieldFilter('owner_id', '==', user_id))

        # Query for trips where user is the owner (legacy format)
        legacy_owner_query = self.trips_collection.where(filter=FieldFilter('ownerId', '==', user_id))

        trips = []
        processed_trip_ids = set()

        # Helper to process a stream of documents
        async def process_stream(stream):
            async for doc in stream:
                if doc.id in processed_trip_ids:
                    continue

                trip_data = doc.to_dict()
                trip_data['id'] = doc.id

                # --- Start data migration for robustness ---
                if 'start_date' in trip_data and 'startDate' not in trip_data:
                    trip_data['startDate'] = trip_data.pop('start_date')
                if 'end_date' in trip_data and 'endDate' not in trip_data:
                    trip_data['endDate'] = trip_data.pop('end_date')
                if 'owner_id' in trip_data and 'ownerId' not in trip_data:
                    trip_data['ownerId'] = trip_data.pop('owner_id')
                if 'cover_image_url' in trip_data and 'coverImageUrl' not in trip_data:
                    trip_data['coverImageUrl'] = trip_data.pop('cover_image_url')
                # --- End data migration ---
                # Normalize/compute status based on dates so lists always reflect reality
                try:
                    current_status_str = trip_data.get('status', 'upcoming')
                    start_date_obj = datetime.fromisoformat(trip_data['startDate'].rstrip('Z')).date() if isinstance(trip_data.get('startDate'), str) else trip_data.get('startDate')
                    end_date_obj = datetime.fromisoformat(trip_data['endDate'].rstrip('Z')).date() if isinstance(trip_data.get('endDate'), str) else trip_data.get('endDate')
                    if start_date_obj and end_date_obj:
                        trip_data['status'] = _get_trip_status(start_date_obj, end_date_obj, schemas.TripStatus(current_status_str))
                    else:
                        trip_data['status'] = schemas.TripStatus(current_status_str)
                except Exception as _:
                    # If anything goes wrong, keep existing status to avoid breaking the response
                    pass

                try:
                    validated_trip = schemas.Trip.model_validate(trip_data)
                    trips.append(validated_trip)
                    processed_trip_ids.add(doc.id)
                except ValidationError as e:
                    logging.error(f"Skipping trip with ID {doc.id} due to validation error: {e}")
                    continue

        # Process the streams concurrently
        await asyncio.gather(
            process_stream(participant_query.stream()),
            process_stream(owner_query.stream()),
            process_stream(legacy_owner_query.stream())
        )

        return trips

    async def get_all_trips(self) -> List[schemas.Trip]:
        """Fetches all trips from the database, intended for admin use."""
        logging.info("Fetching all trips for admin.")

        trips_stream = self.trips_collection.stream()
        trips = []
        processed_trip_ids = set()

        async for doc in trips_stream:
            if doc.id in processed_trip_ids:
                continue

            trip_data = doc.to_dict()
            trip_data['id'] = doc.id

            # --- Start data migration for robustness ---
            if 'start_date' in trip_data and 'startDate' not in trip_data:
                trip_data['startDate'] = trip_data.pop('start_date')
            if 'end_date' in trip_data and 'endDate' not in trip_data:
                trip_data['endDate'] = trip_data.pop('end_date')
            if 'owner_id' in trip_data and 'ownerId' not in trip_data:
                trip_data['ownerId'] = trip_data.pop('owner_id')
            if 'cover_image_url' in trip_data and 'coverImageUrl' not in trip_data:
                trip_data['coverImageUrl'] = trip_data.pop('cover_image_url')
            # --- End data migration ---

            try:
                # Use .model_validate to handle potential validation errors gracefully
                validated_trip = schemas.Trip.model_validate(trip_data)
                trips.append(validated_trip)
                processed_trip_ids.add(doc.id)
            except ValidationError as e:
                logging.error(f"Skipping trip with ID {doc.id} due to validation error: {e}")
                # Optionally, you could collect these IDs for a maintenance report
                continue

        logging.info(f"Successfully fetched {len(trips)} trips for admin.")
        return trips

    async def get_trips_for_participant(self, user_id: str) -> List[schemas.Trip]:
        """Fetches all trips where the given user is a participant."""
        query = self.trips_collection.where(filter=FieldFilter('participants', 'array_contains', user_id))
        trips = []
        async for doc in query.stream():
            trip_data = doc.to_dict()
            trip_data['id'] = doc.id
            try:
                # The raw data from Firestore might not have a status, default to upcoming
                current_status_str = trip_data.get('status', 'upcoming')

                # Convert string dates from Firestore to Python date objects
                start_date_obj = datetime.fromisoformat(trip_data['startDate'].rstrip('Z')).date() if isinstance(trip_data.get('startDate'), str) else trip_data.get('startDate')
                end_date_obj = datetime.fromisoformat(trip_data['endDate'].rstrip('Z')).date() if isinstance(trip_data.get('endDate'), str) else trip_data.get('endDate')

                if start_date_obj and end_date_obj:
                    # Determine the correct status based on the dates
                    trip_data['status'] = _get_trip_status(start_date_obj, end_date_obj, schemas.TripStatus(current_status_str))
                else:
                    # Fallback if dates are missing for some reason
                    trip_data['status'] = schemas.TripStatus(current_status_str)

                validated_trip = schemas.Trip.model_validate(trip_data)
                trips.append(validated_trip)
            except (ValidationError, ValueError) as e:
                logging.error(f"Skipping trip with ID {doc.id} due to validation or data error: {e}")
                continue
        return trips

    async def get_trips_for_family(self, family_id: str) -> List[schemas.Trip]:
        queries = [
            self.trips_collection.where(filter=FieldFilter('familyId', '==', family_id)),
            self.trips_collection.where(filter=FieldFilter('family_id', '==', family_id)),
        ]
        trips = []
        processed_trip_ids = set()

        async def process_stream(stream):
            async for doc in stream:
                if doc.id in processed_trip_ids:
                    continue

                trip_data = doc.to_dict()
                trip_data['id'] = doc.id

                if 'start_date' in trip_data and 'startDate' not in trip_data:
                    trip_data['startDate'] = trip_data.pop('start_date')
                if 'end_date' in trip_data and 'endDate' not in trip_data:
                    trip_data['endDate'] = trip_data.pop('end_date')
                if 'owner_id' in trip_data and 'ownerId' not in trip_data:
                    trip_data['ownerId'] = trip_data.pop('owner_id')
                if 'cover_image_url' in trip_data and 'coverImageUrl' not in trip_data:
                    trip_data['coverImageUrl'] = trip_data.pop('cover_image_url')

                try:
                    validated_trip = schemas.Trip.model_validate(trip_data)
                    trips.append(validated_trip)
                    processed_trip_ids.add(doc.id)
                except ValidationError as e:
                    logging.error(f"Skipping trip with ID {doc.id} due to validation error: {e}")
                    continue

        await asyncio.gather(*(process_stream(query.stream()) for query in queries))

        return trips

    async def get_trip_by_code(self, code: str) -> schemas.Trip:
        """Lookup a trip by its public vacation code. Returns 404-style error if not found."""
        query = self.trips_collection.where(filter=FieldFilter('vacationCode', '==', code)).limit(1)
        async for doc in query.stream():
            trip_data = doc.to_dict()
            trip_data['id'] = doc.id

            # --- Start data migration for robustness ---
            if 'start_date' in trip_data and 'startDate' not in trip_data:
                trip_data['startDate'] = trip_data.pop('start_date')
            if 'end_date' in trip_data and 'endDate' not in trip_data:
                trip_data['endDate'] = trip_data.pop('end_date')
            if 'owner_id' in trip_data and 'ownerId' not in trip_data:
                trip_data['ownerId'] = trip_data.pop('owner_id')
            if 'cover_image_url' in trip_data and 'coverImageUrl' not in trip_data:
                trip_data['coverImageUrl'] = trip_data.pop('cover_image_url')
            # --- End data migration ---

            try:
                return schemas.Trip.model_validate(trip_data)
            except ValidationError as e:
                logging.error(f"Data for trip with code {code} is invalid: {e}")
                raise ValueError("Trip not found")

        raise ValueError("Trip not found")

    async def create_trip(self, trip_data: schemas.TripCreate, current_user: dict) -> schemas.Trip:
        if current_user.get("role") == schemas.UserRole.KID:
            raise PermissionError("Kid accounts cannot create trips.")

        user_service = UserService()
        user_id = current_user['uid']

        user_profile = await user_service.get_user_profile(user_id)
        if not user_profile:
            # This should not happen for a logged-in user with a valid token.
            raise ValueError("User profile not found for trip creation.")

        family_id = user_profile.get('family_id') or user_profile.get('familyId')
        if not family_id:
            # If a user has no family_id, they are the de facto admin of their own 'family'.
            family_id = user_id

        # Ensure the owner is in the participants list from the start
        participants = set(trip_data.participants)
        participants.add(user_id)

        new_trip_data = {
            **trip_data.model_dump(by_alias=True),
            'ownerId': user_id,
            'familyId': family_id,
            'participants': list(participants),
            'createdAt': datetime.utcnow(),
            'updatedAt': datetime.utcnow(),
        }
        new_trip_data['status'] = (
            trip_data.status.value
            if isinstance(trip_data.status, schemas.TripStatus)
            else trip_data.status or schemas.TripStatus.UPCOMING.value
        )

        # Normalize dates to ISO yyyy-mm-dd strings for Firestore compatibility
        start_value = new_trip_data.get('startDate')
        end_value = new_trip_data.get('endDate')
        if isinstance(start_value, date):
            new_trip_data['startDate'] = start_value.strftime('%Y-%m-%d')
        elif isinstance(start_value, datetime):
            new_trip_data['startDate'] = start_value.date().strftime('%Y-%m-%d')
        if isinstance(end_value, date):
            new_trip_data['endDate'] = end_value.strftime('%Y-%m-%d')
        elif isinstance(end_value, datetime):
            new_trip_data['endDate'] = end_value.date().strftime('%Y-%m-%d')

        # Firestore add() returns (update_time, DocumentReference). We need the reference.
        _update_time, trip_ref = await self.trips_collection.add(new_trip_data)
        logging.info(
            "Created trip document",
            extra={
                "trip_id": trip_ref.id,
                "owner_id": user_id,
                "family_id": family_id,
                "participant_count": len(participants),
            },
        )

        # After creating the trip, update the participants' user profiles
        for participant_id in participants:
            try:
                await user_service.update_user_profile(participant_id, {
                    'trip_ids': firestore.ArrayUnion([trip_ref.id])
                })
            except Exception:
                logging.warning(
                    "Failed to attach trip to participant profile",
                    extra={"trip_id": trip_ref.id, "participant_id": participant_id},
                    exc_info=True,
                )

        trip_doc = await trip_ref.get()
        created_trip = trip_doc.to_dict() if trip_doc.exists else dict(new_trip_data)
        created_trip['id'] = trip_ref.id
        try:
            return schemas.Trip.model_validate(created_trip)
        except ValidationError:
            logging.warning(
                "Created trip document failed read-back validation; returning normalized write payload",
                extra={"trip_id": trip_ref.id},
                exc_info=True,
            )
            fallback_trip = dict(new_trip_data)
            fallback_trip['id'] = trip_ref.id
            return schemas.Trip.model_validate(fallback_trip)

    async def update_trip(self, trip_id: str, trip_update: schemas.TripUpdate, current_user: dict) -> schemas.Trip:
        user_service = UserService()

        # Fetch trip to determine ownership and enforce authorization
        trip_ref = self.trips_collection.document(trip_id)
        trip_doc = await trip_ref.get()
        if not trip_doc.exists:
            raise ValueError("Trip not found")

        trip_data = trip_doc.to_dict()
        trip_data['id'] = trip_id
        trip_to_update = schemas.Trip.model_validate(trip_data)

        # Allow admins or the trip owner to update
        is_admin = current_user.get("role") == "admin"
        current_user_id = current_user.get("uid")
        owner_id = trip_data.get('owner_id') or trip_data.get('ownerId')
        if not is_admin and current_user_id != owner_id:
            raise PermissionError("Only the trip owner or an admin can update this trip.")

        update_data = trip_update.model_dump(by_alias=True, exclude_unset=True)
        update_data['updated_at'] = datetime.utcnow()

        if 'participants' in update_data:
            current_participants = set(trip_to_update.participants)
            new_participants = set(update_data['participants'])

            # The owner must always be a participant
            if trip_to_update.owner_id:
                new_participants.add(trip_to_update.owner_id)
            update_data['participants'] = list(new_participants)

            added_users = new_participants - current_participants
            removed_users = current_participants - new_participants

            for user_id in added_users:
                await user_service.update_user_profile(user_id, {
                    'trip_ids': firestore.ArrayUnion([trip_id])
                })

            for user_id in removed_users:
                await user_service.update_user_profile(user_id, {
                    'trip_ids': firestore.ArrayRemove([trip_id])
                })

        await self.trips_collection.document(trip_id).update(update_data)

        updated_trip_doc = await self.trips_collection.document(trip_id).get()
        updated_trip_data = updated_trip_doc.to_dict()
        updated_trip_data['id'] = updated_trip_doc.id
        return schemas.Trip.model_validate(updated_trip_data)

    async def delete_trip(self, trip_id: str, current_user: dict):
        user_id = current_user['uid']
        trip_ref = self.trips_collection.document(trip_id)
        trip_doc = await trip_ref.get()

        if not trip_doc.exists:
            return

        if current_user.get("role") != "admin":
            raise PermissionError("User not authorized to delete this trip")

        trip_data = trip_doc.to_dict()
        user_service = UserService()

        # Remove the trip_id from all participants' profiles
        participant_ids = trip_data.get('participants', [])
        for participant_id in participant_ids:
            await user_service.update_user_profile(participant_id, {
                'trip_ids': firestore.ArrayRemove([trip_id])
            })

        # Finally, delete the trip itself
        await trip_ref.delete()

    async def update_trip_participants(self, trip_id: str, participant_uids: list[str], current_user: dict) -> schemas.Trip:
        if current_user.get("role") != "admin":
            raise PermissionError("Only an admin can update trip participants.")

        trip_ref = self.trips_collection.document(trip_id)
        trip_doc = await trip_ref.get()
        if not trip_doc.exists:
            raise ValueError("Trip not found")

        trip_data = trip_doc.to_dict()
        owner_id = trip_data.get('owner_id') or trip_data.get('ownerId')

        # Ensure owner is always a participant
        new_participants = set(participant_uids)
        if owner_id:
            new_participants.add(owner_id)

        await trip_ref.update({
            'participants': list(new_participants),
            'updatedAt': datetime.utcnow()
        })

        updated_doc = await trip_ref.get()
        updated = updated_doc.to_dict()
        updated['id'] = updated_doc.id
        return schemas.Trip.model_validate(updated)
