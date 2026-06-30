from ..firebase_admin import get_async_firestore_client, get_firestore_client
from .. import schemas
from ..services.user_service import UserService
from firebase_admin import firestore
import logging
from datetime import datetime
from google.cloud.firestore_v1.base_query import FieldFilter

logger = logging.getLogger(__name__)

class RewardsService:
    def __init__(self):
        self.db_async = get_async_firestore_client()
        self.db_sync = get_firestore_client()
        self.rewards_collection = self.db_async.collection('rewards')
        self.redemptions_collection = self.db_async.collection('rewardRedemptions')
        self.users_collection = self.db_async.collection('users')
        self.user_service = UserService()

    async def create_reward(self, reward_data: schemas.RewardCreate, family_id: str) -> schemas.Reward:
        new_reward_data = reward_data.model_dump()
        new_reward_data['familyId'] = family_id
        new_reward_data['isRedeemed'] = False
        new_reward_data['redeemedBy'] = None
        new_reward_data['redeemedAt'] = None
        new_reward_data['createdAt'] = firestore.SERVER_TIMESTAMP
        new_reward_data['updatedAt'] = firestore.SERVER_TIMESTAMP

        _timestamp, reward_ref = await self.rewards_collection.add(new_reward_data)
        created_reward_doc = await reward_ref.get()
        created_reward = created_reward_doc.to_dict()
        created_reward['id'] = created_reward_doc.id

        return schemas.Reward.model_validate(created_reward)

    async def get_rewards_for_family(self, family_id: str):
        """Fetches all rewards for a given family."""
        if not family_id:
            return []
        query = self.rewards_collection.where(filter=FieldFilter('familyId', '==', family_id))
        # stream() returns an async generator in the async client; consume asynchronously
        rewards = []
        async for doc in query.stream():
            reward = doc.to_dict()
            reward['id'] = doc.id
            if 'isActive' not in reward:
                reward['isActive'] = True
            rewards.append(reward)
        return rewards

    async def get_reward_by_id(self, reward_id: str) -> schemas.Reward | None:
        reward_doc = await self.rewards_collection.document(reward_id).get()
        if not reward_doc.exists:
            return None
        reward_data = reward_doc.to_dict()
        reward_data['id'] = reward_doc.id
        if 'isActive' not in reward_data:
            reward_data['isActive'] = True
        return schemas.Reward.model_validate(reward_data)

    async def delete_reward(self, reward_id: str):
        await self.rewards_collection.document(reward_id).delete()

    async def update_reward(self, reward_id: str, reward_update: schemas.RewardUpdate) -> schemas.Reward:
        update_data = reward_update.model_dump(exclude_unset=True)
        update_data['updatedAt'] = firestore.SERVER_TIMESTAMP
        await self.rewards_collection.document(reward_id).update(update_data)
        return await self.get_reward_by_id(reward_id)

    async def request_redemption(self, reward_id: str, user_id: str) -> schemas.RewardRedemption:
        reward = await self.get_reward_by_id(reward_id)
        if not reward:
            raise LookupError("Reward not found.")
        if not reward.isActive:
            raise PermissionError("This reward is not active.")

        user_profile = await self.user_service.get_user_profile(user_id)
        if not user_profile:
            raise LookupError("User not found.")

        user_family_id = user_profile.get('family_id') or user_profile.get('familyId')
        if reward.familyId != user_family_id:
            raise PermissionError("Not authorized to redeem this reward.")

        if user_profile.get('points', 0) < reward.pointsCost:
            raise ValueError("You do not have enough points to request this reward.")

        redemption_data = {
            'familyId': reward.familyId,
            'rewardId': reward.id,
            'rewardTitle': reward.title,
            'rewardDescription': reward.description,
            'pointsCost': reward.pointsCost,
            'kidId': user_id,
            'kidName': user_profile.get('name'),
            'status': schemas.RewardRedemptionStatus.REQUESTED.value,
            'requestedAt': firestore.SERVER_TIMESTAMP,
            'updatedAt': firestore.SERVER_TIMESTAMP,
            'approvedAt': None,
            'approvedBy': None,
            'fulfilledAt': None,
            'fulfilledBy': None,
            'deniedAt': None,
            'deniedBy': None,
            'note': None,
        }
        _timestamp, redemption_ref = await self.redemptions_collection.add(redemption_data)
        created_doc = await redemption_ref.get()
        created = created_doc.to_dict()
        created['id'] = created_doc.id
        return schemas.RewardRedemption.model_validate(created)

    async def get_redemptions_for_family(self, family_id: str, user_id: str | None = None):
        if not family_id:
            return []
        query = self.redemptions_collection.where(filter=FieldFilter('familyId', '==', family_id))
        if user_id:
            query = query.where(filter=FieldFilter('kidId', '==', user_id))

        redemptions = []
        async for doc in query.stream():
            redemption = doc.to_dict()
            redemption['id'] = doc.id
            redemptions.append(redemption)

        def _sort_value(item: dict):
            value = item.get('requestedAt') or item.get('updatedAt')
            return value.timestamp() if hasattr(value, "timestamp") else str(value or "")

        return sorted(redemptions, key=_sort_value, reverse=True)

    async def get_redemption_by_id(self, redemption_id: str) -> schemas.RewardRedemption | None:
        redemption_doc = await self.redemptions_collection.document(redemption_id).get()
        if not redemption_doc.exists:
            return None
        redemption_data = redemption_doc.to_dict()
        redemption_data['id'] = redemption_doc.id
        return schemas.RewardRedemption.model_validate(redemption_data)

    def update_redemption_status(
        self,
        redemption_id: str,
        update: schemas.RewardRedemptionUpdate,
        actor_id: str,
    ) -> schemas.RewardRedemption:
        new_status = update.status.value if hasattr(update.status, "value") else str(update.status)
        if new_status == schemas.RewardRedemptionStatus.REQUESTED.value:
            raise ValueError("Redemptions cannot be moved back to requested.")

        transaction = self.db_sync.transaction()
        redemption_ref = self.db_sync.collection('rewardRedemptions').document(redemption_id)

        @firestore.transactional
        def _update_transaction(transaction, redemption_ref):
            redemption_doc = redemption_ref.get(transaction=transaction)
            if not redemption_doc.exists:
                raise LookupError("Redemption not found.")

            redemption_data = redemption_doc.to_dict()
            current_status = redemption_data.get('status')
            if current_status in {
                schemas.RewardRedemptionStatus.FULFILLED.value,
                schemas.RewardRedemptionStatus.DENIED.value,
            }:
                raise PermissionError("This redemption is already closed.")

            update_data = {
                'status': new_status,
                'updatedAt': firestore.SERVER_TIMESTAMP,
                'note': update.note,
            }

            if new_status == schemas.RewardRedemptionStatus.APPROVED.value:
                if current_status != schemas.RewardRedemptionStatus.REQUESTED.value:
                    raise PermissionError("Only requested redemptions can be approved.")

                user_ref = self.db_sync.collection('users').document(redemption_data.get('kidId'))
                user_doc = user_ref.get(transaction=transaction)
                if not user_doc.exists:
                    raise LookupError("Kid profile not found.")

                user_data = user_doc.to_dict()
                user_points = user_data.get('points', 0)
                points_cost = redemption_data.get('pointsCost', 0)
                if user_points < points_cost:
                    raise ValueError("Kid does not have enough points for this reward anymore.")

                transaction.update(user_ref, {'points': user_points - points_cost})
                update_data['approvedAt'] = firestore.SERVER_TIMESTAMP
                update_data['approvedBy'] = actor_id

            if new_status == schemas.RewardRedemptionStatus.FULFILLED.value:
                if current_status != schemas.RewardRedemptionStatus.APPROVED.value:
                    raise PermissionError("Only approved redemptions can be fulfilled.")
                update_data['fulfilledAt'] = firestore.SERVER_TIMESTAMP
                update_data['fulfilledBy'] = actor_id

            if new_status == schemas.RewardRedemptionStatus.DENIED.value:
                if current_status != schemas.RewardRedemptionStatus.REQUESTED.value:
                    raise PermissionError("Only requested redemptions can be denied.")
                update_data['deniedAt'] = firestore.SERVER_TIMESTAMP
                update_data['deniedBy'] = actor_id

            transaction.update(redemption_ref, update_data)
            response_data = dict(redemption_data)
            response_data.update(update_data)
            response_data['updatedAt'] = datetime.utcnow()
            if 'approvedAt' in response_data and response_data['approvedAt'] == firestore.SERVER_TIMESTAMP:
                response_data['approvedAt'] = datetime.utcnow()
            if 'fulfilledAt' in response_data and response_data['fulfilledAt'] == firestore.SERVER_TIMESTAMP:
                response_data['fulfilledAt'] = datetime.utcnow()
            if 'deniedAt' in response_data and response_data['deniedAt'] == firestore.SERVER_TIMESTAMP:
                response_data['deniedAt'] = datetime.utcnow()
            response_data['id'] = redemption_id
            return schemas.RewardRedemption.model_validate(response_data)

        return _update_transaction(transaction, redemption_ref)

    def redeem_reward(self, reward_id: str, user_id: str) -> schemas.Reward:
        transaction = self.db_sync.transaction()
        reward_ref = self.db_sync.collection('rewards').document(reward_id)
        user_ref = self.db_sync.collection('users').document(user_id)

        @firestore.transactional
        def _redeem_transaction(transaction, reward_ref, user_ref):
            reward_doc = reward_ref.get(transaction=transaction)
            if not reward_doc.exists:
                raise Exception("Reward not found.")
            
            reward_data = reward_doc.to_dict()

            user_doc = user_ref.get(transaction=transaction)
            if not user_doc.exists:
                raise Exception("User not found.")
            user_data = user_doc.to_dict()
            
            if reward_data.get('isRedeemed'):
                raise PermissionError("This reward has already been redeemed.")

            user_points = user_data.get('points', 0)
            reward_cost = reward_data.get('pointsCost', 0)

            if user_points < reward_cost:
                raise ValueError("You do not have enough points to redeem this reward.")

            new_points = user_points - reward_cost
            
            transaction.update(user_ref, {
                'points': new_points
            })

            transaction.update(reward_ref, {
                'isRedeemed': True,
                'redeemedBy': user_id,
                'redeemedAt': firestore.SERVER_TIMESTAMP
            })
            
            reward_data['isRedeemed'] = True
            reward_data['redeemedBy'] = user_id
            # The timestamp will be a server-side placeholder, but we can set it for the return value
            reward_data['redeemedAt'] = datetime.utcnow()
            reward_data['id'] = reward_id
            return schemas.Reward.model_validate(reward_data)

        return _redeem_transaction(transaction, reward_ref, user_ref)
