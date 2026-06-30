from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
import logging

from .. import schemas
from ..auth import get_current_user
from ..services.rewards_service import RewardsService

router = APIRouter(
    tags=["rewards"],
)
logger = logging.getLogger(__name__)

def _family_id(current_user: dict) -> str | None:
    return (
        current_user.get('family_id')
        or current_user.get('familyId')
        or current_user.get('profile', {}).get('family_id')
        or current_user.get('profile', {}).get('familyId')
    )

@router.post("", response_model=schemas.Reward, status_code=status.HTTP_201_CREATED)
async def create_reward(
    reward_data: schemas.RewardCreate,
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    if current_user.get('role') == schemas.UserRole.KID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kids cannot create rewards.")

    family_id = _family_id(current_user)
    if not family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not belong to a family.")

    return await rewards_service.create_reward(reward_data, family_id)

@router.get("", response_model=List[schemas.Reward])
async def get_rewards(
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    family_id = _family_id(current_user)
    if not family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not belong to a family.")

    return await rewards_service.get_rewards_for_family(family_id)

@router.get("/redemptions", response_model=List[schemas.RewardRedemption])
async def get_redemptions(
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    family_id = _family_id(current_user)
    if not family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User does not belong to a family.")

    user_id = current_user.get('uid')
    user_filter = user_id if current_user.get('role') == schemas.UserRole.KID else None
    return await rewards_service.get_redemptions_for_family(family_id, user_filter)

@router.post("/{reward_id}/redeem", response_model=schemas.RewardRedemption)
async def redeem_reward(
    reward_id: str,
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    user_id = current_user.get('uid')
    try:
        return await rewards_service.request_redemption(reward_id, user_id)
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error redeeming reward {reward_id} for user {user_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while redeeming the reward.")

@router.put("/redemptions/{redemption_id}", response_model=schemas.RewardRedemption)
def update_redemption(
    redemption_id: str,
    redemption_update: schemas.RewardRedemptionUpdate,
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    if current_user.get('role') == schemas.UserRole.KID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kids cannot update redemptions.")

    try:
        return rewards_service.update_redemption_status(
            redemption_id,
            redemption_update,
            current_user.get('uid'),
        )
    except LookupError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error updating reward redemption {redemption_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An internal error occurred while updating the redemption.")

@router.delete("/{reward_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_reward(
    reward_id: str,
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    if current_user.get('role') == schemas.UserRole.KID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kids cannot delete rewards.")

    reward = await rewards_service.get_reward_by_id(reward_id)
    if not reward:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reward not found.")

    family_id = _family_id(current_user)
    if reward.familyId != family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this reward.")

    await rewards_service.delete_reward(reward_id)
    return None

@router.put("/{reward_id}", response_model=schemas.Reward)
async def update_reward(
    reward_id: str,
    reward_update: schemas.RewardUpdate,
    current_user: dict = Depends(get_current_user),
    rewards_service: RewardsService = Depends(RewardsService)
):
    if current_user.get('role') == schemas.UserRole.KID:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Kids cannot update rewards.")

    reward = await rewards_service.get_reward_by_id(reward_id)
    if not reward:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Reward not found.")

    family_id = _family_id(current_user)
    if reward.familyId != family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to update this reward.")

    return await rewards_service.update_reward(reward_id, reward_update)
