from ..firebase_admin import get_async_firestore_client, get_firestore_client
from .. import schemas
from ..services.user_service import UserService
from firebase_admin import firestore
import logging
from google.cloud.firestore_v1.base_query import FieldFilter

logger = logging.getLogger(__name__)

class RewardsService:
    def __init__(self):
        self.db_async = get_async_firestore_client()
        self.db_sync = get_firestore_client()
        self.rewards_collection = self.db_async.collection('rewards')
        self.users_collection = self.db_async.collection('users')
        self.user_service = UserService()

    async def create_reward(self, reward_data: schemas.RewardCreate, family_id: str) -> schemas.Reward:
        new_reward_data = reward_data.model_dump()
        new_reward_data['familyId'] = family_id
        new_reward_data['isRedeemed'] = False
        new_reward_data['redeemedBy'] = None
        new_reward_data['redeemedAt'] = None
        new_reward_data['createdAt'] = firestore.SERVER_TIMESTAMP

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
        rewards = [doc.to_dict() async for doc in query.stream()]
        return rewards

    async def get_reward_by_id(self, reward_id: str) -> schemas.Reward | None:
        reward_doc = await self.rewards_collection.document(reward_id).get()
        if not reward_doc.exists:
            return None
        reward_data = reward_doc.to_dict()
        reward_data['id'] = reward_doc.id
        return schemas.Reward.model_validate(reward_data)

    async def delete_reward(self, reward_id: str):
        await self.rewards_collection.document(reward_id).delete()

    async def update_reward(self, reward_id: str, reward_update: schemas.RewardUpdate) -> schemas.Reward:
        update_data = reward_update.model_dump(exclude_unset=True)
        await self.rewards_collection.document(reward_id).update(update_data)
        return await self.get_reward_by_id(reward_id)

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

        from datetime import datetime
        return _redeem_transaction(transaction, reward_ref, user_ref) 