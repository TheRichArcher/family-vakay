from ..firebase_admin import get_async_firestore_client, get_firestore_client
from .. import schemas
from google.cloud import firestore
import string
import random
import secrets
from firebase_admin import auth as firebase_auth
import logging
import asyncio
from typing import List
from google.cloud.firestore_v1.base_query import FieldFilter, Or

logger = logging.getLogger(__name__)

class UserService:
    def __init__(self):
        self.db = get_async_firestore_client()
        self.users_collection = self.db.collection('users')
        self.invites_collection = self.db.collection('family_invites')

    async def get_user_profile(self, user_id: str) -> dict | None:
        user_doc = await self.users_collection.document(user_id).get()
        if user_doc.exists:
            user_data = user_doc.to_dict()
            user_data['uid'] = user_doc.id
            if 'familyId' not in user_data and user_data.get('family_id'):
                user_data['familyId'] = user_data.get('family_id')
            if 'family_id' not in user_data and user_data.get('familyId'):
                user_data['family_id'] = user_data.get('familyId')
            if 'tripIds' not in user_data and user_data.get('trip_ids') is not None:
                user_data['tripIds'] = user_data.get('trip_ids')
            if 'trip_ids' not in user_data and user_data.get('tripIds') is not None:
                user_data['trip_ids'] = user_data.get('tripIds')
            # Ensure 'is_kid' has a default value of False if not present.
            if 'is_kid' not in user_data:
                user_data['is_kid'] = False
            if 'isKid' not in user_data:
                user_data['isKid'] = user_data['is_kid']
            return user_data
        return None

    async def get_users_by_ids(self, user_ids: List[str]) -> List[dict]:
        """
        Retrieves multiple user profiles from Firestore based on a list of user IDs.
        Handles cases where some users may not be found.
        """
        if not user_ids:
            return []

        # Prefer async client, but fall back to sync client in a background thread if needed
        try:
            # Fetch each document concurrently; avoids any get_all async-generator quirks
            tasks = [self.users_collection.document(uid).get() for uid in user_ids]
            user_docs = await asyncio.gather(*tasks)
        except Exception as async_error:
            logger.warning(f"Async Firestore get_all failed, falling back to sync client. Error: {async_error}")
            sync_db = get_firestore_client()
            sync_users_collection = sync_db.collection('users')
            sync_doc_refs = [sync_users_collection.document(uid) for uid in user_ids]
            # Run synchronous get_all in a thread to avoid blocking the event loop
            user_docs = await asyncio.to_thread(sync_db.get_all, sync_doc_refs)

        profiles = []
        for doc in user_docs:
            if doc.exists:
                user_data = doc.to_dict()
                user_data['uid'] = doc.id
                if 'familyId' not in user_data and user_data.get('family_id'):
                    user_data['familyId'] = user_data.get('family_id')
                if 'family_id' not in user_data and user_data.get('familyId'):
                    user_data['family_id'] = user_data.get('familyId')
                if 'tripIds' not in user_data and user_data.get('trip_ids') is not None:
                    user_data['tripIds'] = user_data.get('trip_ids')
                if 'trip_ids' not in user_data and user_data.get('tripIds') is not None:
                    user_data['trip_ids'] = user_data.get('tripIds')
                profiles.append(user_data)

        return profiles

    async def update_user_profile(self, user_id: str, data: dict) -> None:
        await self.users_collection.document(user_id).update(data)

    async def _generate_share_code(self) -> str:
        """Generates a 6-character, easy-to-read, unique share code."""
        # Using characters that are not easily confused (e.g., no 0/O, 1/I)
        chars = string.ascii_uppercase + string.digits
        chars = chars.replace('0', '').replace('O', '').replace('1', '').replace('I', '')

        while True:
            code = ''.join(random.choice(chars) for _ in range(6))
            # Check for uniqueness. A family is defined by its share code.
            # We query the 'users' collection for this code.
            query = self.users_collection.where(filter=FieldFilter('share_code', '==', code)).limit(1)
            docs = query.stream()
            is_unique = True
            async for _ in docs:
                is_unique = False
                break
            if is_unique:
                return code

    async def _generate_invite_code(self) -> str:
        """Generates an 8-character, easy-to-read, unique invite code."""
        chars = string.ascii_uppercase + string.digits
        chars = chars.replace('0', '').replace('O', '').replace('1', '').replace('I', '')

        while True:
            code = ''.join(secrets.choice(chars) for _ in range(8))
            query = self.invites_collection.where(filter=FieldFilter('code', '==', code)).limit(1)
            docs = query.stream()
            is_unique = True
            async for _ in docs:
                is_unique = False
                break
            if is_unique:
                return code

    async def get_or_create_share_code(self, user_id: str) -> str:
        """
        Retrieves the existing share code for a user's family by finding the family admin.
        If the admin doesn't have a code, it creates one for them.
        """
        user_profile = await self.get_user_profile(user_id)
        family_id = (user_profile or {}).get('family_id') or (user_profile or {}).get('familyId')
        if not user_profile or not family_id:
            logger.error(f"User {user_id} has no profile or family_id.")
            # This case should not happen in normal operation.
            # We generate a code for the user directly as a fallback.
            existing_code = user_profile.get('share_code') if user_profile else None
            if existing_code:
                return existing_code
            new_code = await self._generate_share_code()
            await self.update_user_profile(user_id, {'share_code': new_code, 'family_id': user_id})
            logger.warning(f"User {user_id} had no family_id. A new family and share code were generated.")
            return new_code

        # The admin of the family is the user whose UID is the family_id.
        admin_profile = await self.get_user_profile(family_id)

        if not admin_profile:
            # This is a data integrity issue. A family should always have an admin.
            logger.error(f"Data integrity issue: No admin profile found for family_id {family_id} when requested by user {user_id}.")
            raise ValueError("Family admin not found.")

        # Check if the admin already has a share code.
        existing_code = admin_profile.get('share_code')
        if existing_code:
            return existing_code

        # If the admin has no code, generate, save it to the admin's profile, and return it.
        new_code = await self._generate_share_code()
        await self.update_user_profile(admin_profile['uid'], {'share_code': new_code})
        logger.info(f"Generated a new share code for family_id {family_id} (admin: {admin_profile['uid']}).")
        return new_code

    async def get_family_id_by_share_code(self, share_code: str) -> str | None:
        """Finds a family_id associated with a given share code."""
        query = self.users_collection.where(filter=FieldFilter('share_code', '==', share_code.upper())).limit(1)
        docs = [doc async for doc in query.stream()]
        if not docs:
            return None

        admin_profile = docs[0].to_dict()
        return admin_profile.get('family_id') or admin_profile.get('familyId') or docs[0].id

    async def create_family_invite(
        self,
        *,
        family_id: str,
        created_by: str,
        role: schemas.UserRole,
        recipient_name: str | None = None,
        recipient_email: str | None = None,
    ) -> dict:
        if role == schemas.UserRole.ADMIN:
            raise ValueError("Invites cannot grant admin access.")
        if role == schemas.UserRole.KID:
            raise ValueError("Kid profiles should be created by an admin with a PIN.")

        code = await self._generate_invite_code()
        invite_data = {
            "code": code,
            "family_id": family_id,
            "familyId": family_id,
            "role": role.value if hasattr(role, "value") else role,
            "recipient_name": recipient_name,
            "recipientName": recipient_name,
            "recipient_email": recipient_email,
            "recipientEmail": recipient_email,
            "status": schemas.FamilyInviteStatus.PENDING.value,
            "created_by": created_by,
            "createdBy": created_by,
            "created_at": firestore.SERVER_TIMESTAMP,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
        _, invite_ref = await self.invites_collection.add(invite_data)
        invite_doc = await invite_ref.get()
        invite = invite_doc.to_dict()
        invite["id"] = invite_doc.id
        return invite

    async def list_family_invites(self, family_id: str) -> list[dict]:
        query = self.invites_collection.where(filter=FieldFilter('family_id', '==', family_id))
        invites = []
        async for doc in query.stream():
            invite = doc.to_dict()
            invite["id"] = doc.id
            if "familyId" not in invite:
                invite["familyId"] = invite.get("family_id")
            if "createdBy" not in invite:
                invite["createdBy"] = invite.get("created_by")
            if "recipientName" not in invite:
                invite["recipientName"] = invite.get("recipient_name")
            if "recipientEmail" not in invite:
                invite["recipientEmail"] = invite.get("recipient_email")
            if "createdAt" not in invite:
                invite["createdAt"] = invite.get("created_at")
            if "acceptedAt" not in invite:
                invite["acceptedAt"] = invite.get("accepted_at")
            if "revokedAt" not in invite:
                invite["revokedAt"] = invite.get("revoked_at")
            if "acceptedBy" not in invite:
                invite["acceptedBy"] = invite.get("accepted_by")
            if "revokedBy" not in invite:
                invite["revokedBy"] = invite.get("revoked_by")
            invites.append(invite)

        return sorted(invites, key=lambda item: str(item.get("created_at") or item.get("createdAt") or ""), reverse=True)

    async def get_family_invite_by_code(self, code: str) -> dict | None:
        normalized_code = code.replace(" ", "").upper()
        query = self.invites_collection.where(filter=FieldFilter('code', '==', normalized_code)).limit(1)
        docs = [doc async for doc in query.stream()]
        if not docs:
            return None
        invite = docs[0].to_dict()
        invite["id"] = docs[0].id
        invite["familyId"] = invite.get("familyId") or invite.get("family_id")
        invite["recipientName"] = invite.get("recipientName") or invite.get("recipient_name")
        invite["recipientEmail"] = invite.get("recipientEmail") or invite.get("recipient_email")
        invite["createdBy"] = invite.get("createdBy") or invite.get("created_by")
        return invite

    async def revoke_family_invite(self, invite_id: str, family_id: str, revoked_by: str) -> dict | None:
        invite_ref = self.invites_collection.document(invite_id)
        invite_doc = await invite_ref.get()
        if not invite_doc.exists:
            return None
        invite = invite_doc.to_dict()
        invite_family_id = invite.get("family_id") or invite.get("familyId")
        if invite_family_id != family_id:
            raise PermissionError("Invite belongs to another family.")
        if invite.get("status") == schemas.FamilyInviteStatus.ACCEPTED.value:
            raise ValueError("Accepted invites cannot be revoked.")

        await invite_ref.update({
            "status": schemas.FamilyInviteStatus.REVOKED.value,
            "revoked_by": revoked_by,
            "revokedBy": revoked_by,
            "revoked_at": firestore.SERVER_TIMESTAMP,
            "revokedAt": firestore.SERVER_TIMESTAMP,
        })
        updated_doc = await invite_ref.get()
        updated = updated_doc.to_dict()
        updated["id"] = updated_doc.id
        updated["familyId"] = updated.get("familyId") or updated.get("family_id")
        updated["createdBy"] = updated.get("createdBy") or updated.get("created_by")
        return updated

    async def mark_invite_accepted(self, invite_code: str, accepted_by: str) -> dict | None:
        invite = await self.get_family_invite_by_code(invite_code)
        if not invite:
            return None
        if invite.get("status") != schemas.FamilyInviteStatus.PENDING.value:
            raise ValueError("Invite is not pending.")

        invite_ref = self.invites_collection.document(invite["id"])
        await invite_ref.update({
            "status": schemas.FamilyInviteStatus.ACCEPTED.value,
            "accepted_by": accepted_by,
            "acceptedBy": accepted_by,
            "accepted_at": firestore.SERVER_TIMESTAMP,
            "acceptedAt": firestore.SERVER_TIMESTAMP,
        })
        return invite

    async def get_user_by_email(self, email: str) -> dict | None:
        """
        Retrieves a user profile from Firestore by their email address.
        """
        query = self.users_collection.where(filter=FieldFilter('email', '==', email)).limit(1)
        docs = [doc async for doc in query.stream()]
        if not docs:
            return None

        user_data = docs[0].to_dict()
        user_data['uid'] = docs[0].id
        return user_data

    async def get_family_members_by_id(self, family_id: str) -> List[schemas.UserProfile]:
        """
        Retrieves all members of a family, checking for both 'family_id' and 'familyId' fields
        to handle data inconsistencies.
        """
        query1 = self.users_collection.where(filter=FieldFilter('family_id', '==', family_id))
        query2 = self.users_collection.where(filter=FieldFilter('familyId', '==', family_id))

        docs1_stream = query1.stream()
        docs2_stream = query2.stream()

        members = {}

        async def process_docs(stream):
            async for doc in stream:
                member_data = doc.to_dict()
                if 'uid' not in member_data:
                    member_data['uid'] = doc.id
                if 'familyId' not in member_data and member_data.get('family_id'):
                    member_data['familyId'] = member_data.get('family_id')
                if 'family_id' not in member_data and member_data.get('familyId'):
                    member_data['family_id'] = member_data.get('familyId')
                if 'tripIds' not in member_data and member_data.get('trip_ids') is not None:
                    member_data['tripIds'] = member_data.get('trip_ids')
                if 'trip_ids' not in member_data and member_data.get('tripIds') is not None:
                    member_data['trip_ids'] = member_data.get('tripIds')
                # Use a schema to validate and structure the data before adding
                try:
                    members[doc.id] = schemas.UserProfile(**member_data)
                except Exception as e:
                    logger.error(f"Data validation error for user {doc.id} in family {family_id}: {e}")

        await asyncio.gather(
            process_docs(docs1_stream),
            process_docs(docs2_stream)
        )

        return list(members.values())

    async def get_admin_stats(self, family_id: str) -> dict:
        """
        Gathers statistics for the admin dashboard.
        This version is more robust to missing familyId on trips by checking user profiles.
        """
        # 1. Get family members and count them.
        family_members = await self.get_family_members_by_id(family_id)
        family_members_count = len(family_members)

        # 2. Collect all unique trip_ids from all family members.
        all_trip_ids = set()
        for member in family_members:
            if member.trip_ids:
                all_trip_ids.update(member.trip_ids)

        # 3. Fetch all trips by their IDs and filter by status to find active ones.
        active_trips_count = 0
        if all_trip_ids:
            trips_ref = self.db.collection('trips')
            trip_ids_list = list(all_trip_ids)
            # Firestore 'in' query is limited to 30 items, so we process in chunks.
            chunk_size = 30
            trip_chunks = [trip_ids_list[i:i + chunk_size] for i in range(0, len(trip_ids_list), chunk_size)]

            active_trip_tasks = []
            for chunk in trip_chunks:
                if not chunk: continue
                query = trips_ref.where(filter=FieldFilter(firestore.FieldPath.document_id(), 'in', chunk))\
                                 .where(filter=FieldFilter('status', 'in', ['planning', 'in-progress', 'upcoming']))
                active_trip_tasks.append(query.stream())

            if active_trip_tasks:
                query_results = await asyncio.gather(*active_trip_tasks)
                for stream in query_results:
                    async for _ in stream:
                        active_trips_count += 1

        # 4. Count pending ideas.
        activities_ref = self.db.collection('activities')
        # Query for both familyId conventions due to historical data inconsistency.
        pending_requests_query1 = activities_ref.where(filter=FieldFilter('familyId', '==', family_id)).where(filter=FieldFilter('isIdea', '==', True))
        pending_requests_query2 = activities_ref.where(filter=FieldFilter('family_id', '==', family_id)).where(filter=FieldFilter('isIdea', '==', True))

        async def count_unique_docs(q1, q2):
            docs1, docs2 = await asyncio.gather(q1.get(), q2.get())
            doc_ids = {doc.id for doc in docs1}
            doc_ids.update(doc.id for doc in docs2)
            return len(doc_ids)

        pending_requests_count = await count_unique_docs(pending_requests_query1, pending_requests_query2)

        return {
            "active_trips": active_trips_count,
            "family_members": family_members_count,
            "pending_requests": pending_requests_count
        }

    async def delete_user_and_cleanup(self, user_id: str, user_profile: dict):
        """
        Deletes a user's Firebase Auth record and Firestore profile,
        and removes them from all trip participant lists.
        This operation is atomic for the deletion part. If Auth deletion fails,
        Firestore deletion will not occur.
        """
        # Always attempt to delete the auth record. It's safe due to the error handling below.
        try:
            # firebase_auth.delete_user is synchronous, run in executor
            await asyncio.to_thread(firebase_auth.delete_user, user_id)
            logger.info(f"Successfully deleted user {user_id} from Firebase Auth.")
        except firebase_auth.UserNotFoundError:
            logger.warning(f"User {user_id} not found in Firebase Auth, but proceeding with Firestore cleanup.")
        except Exception as e:
            logger.error(f"FATAL: Could not delete user {user_id} from Firebase Auth: {e}")
            # This is a critical failure. We should not proceed to delete the Firestore
            # document, as it would leave an orphaned auth account.
            raise e

        # After successful auth deletion, proceed with Firestore cleanup.
        batch = self.db.batch()

        # 1. Remove user from all trips' participant lists
        trips_collection_ref = self.db.collection('trips')
        query = trips_collection_ref.where(filter=FieldFilter('participants', 'array_contains', user_id))

        async for trip_doc in query.stream():
            trip_ref = trips_collection_ref.document(trip_doc.id)
            batch.update(trip_ref, {
                'participants': firestore.ArrayRemove([user_id])
            })

        # 2. Delete the user's profile document from Firestore
        user_doc_ref = self.users_collection.document(user_id)
        batch.delete(user_doc_ref)

        # 3. Commit the atomic batch operation
        try:
            await batch.commit()
            logger.info(f"Successfully deleted Firestore data and trip participations for user {user_id}.")
        except Exception as e:
            logger.error(f"Error during Firestore batch commit for user {user_id}: {e}")
            # This is also a critical error. The auth user might be deleted but their
            # firestore data remains. This requires manual intervention.
            raise e
