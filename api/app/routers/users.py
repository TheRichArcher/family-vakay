from fastapi import APIRouter, Depends, HTTPException, status
from ..auth import get_current_user, get_current_user_token
from ..firebase_admin import get_firestore_client, get_async_firestore_client
from .. import schemas
from ..password import get_password_hash
from firebase_admin import firestore, auth as admin_auth
from ..services.user_service import UserService
from pydantic import BaseModel, Field
import logging
import asyncio
from typing import List

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/batch", response_model=List[schemas.UserProfile])
async def get_users_batch(user_id_list: schemas.UserIDList, current_user: dict = Depends(get_current_user)):
    """
    Retrieves a list of user profiles from a list of user IDs.
    Authorization: Any authenticated user can fetch this data, as it's assumed
    that the user IDs are obtained from shared objects like trips, which implies
    permission to view basic profile data. More stringent checks can be added if needed.
    """
    user_service = UserService()
    profiles = await user_service.get_users_by_ids(user_id_list.user_ids)

    # We must ensure that the output conforms to the UserProfile schema.
    # Pydantic will validate this automatically when we return the list.
    return [schemas.UserProfile(**p) for p in profiles]

@router.post("/kid", response_model=schemas.UserProfile, status_code=status.HTTP_201_CREATED)
async def create_kid_profile(kid_data: schemas.KidProfileCreate, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != schemas.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can create kid profiles.")

    family_id = current_user.get('family_id') or current_user.get('familyId')
    if not family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin user does not have a family ID.")

    db = get_async_firestore_client()

    pin_hash = get_password_hash(kid_data.pin)

    users_collection = db.collection('users')
    new_kid_ref = users_collection.document()
    new_kid_uid = new_kid_ref.id

    try:
        admin_auth.create_user(uid=new_kid_uid, display_name=kid_data.name)
    except admin_auth.UserAlreadyExistsError:
        logger.warning(f"A user with UID {new_kid_uid} already exists in Firebase Auth.")
        pass
    except Exception as e:
        logger.error(f"Failed to create Firebase Auth user for kid {kid_data.name}: {e}")
        raise HTTPException(status_code=500, detail="Failed to create user in authentication system.")

    new_kid_profile = {
        "uid": new_kid_uid,
        "name": kid_data.name,
        "role": schemas.UserRole.KID,
        "family_id": family_id,
        "pin_hash": pin_hash,
        "email": None,
        "age": kid_data.age,
        "is_kid": True,
        "created_at": firestore.SERVER_TIMESTAMP,
        "updated_at": firestore.SERVER_TIMESTAMP,
    }

    await new_kid_ref.set(new_kid_profile)

    created_doc = await new_kid_ref.get()
    created_profile = created_doc.to_dict()
    return schemas.UserProfile(**created_profile)

@router.post("/{user_id}/pin", status_code=status.HTTP_204_NO_CONTENT)
async def update_kid_pin(user_id: str, pin_data: schemas.KidPinUpdate, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != schemas.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can update PINs.")

    user_service = UserService()
    user_to_update = await user_service.get_user_profile(user_id)

    if not user_to_update:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user_family_id = current_user.get('family_id') or current_user.get('familyId')
    target_family_id = user_to_update.get('family_id') or user_to_update.get('familyId')
    if user_family_id != target_family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admins can only update PINs for their own family members.")

    pin_hash = get_password_hash(pin_data.pin)
    await user_service.update_user_profile(user_id, {"pin_hash": pin_hash, "updated_at": firestore.SERVER_TIMESTAMP})

@router.put("/{user_id}", response_model=schemas.UserProfile)
async def create_or_update_user_profile(user_id: str, profile: schemas.UserProfileUpdate, token_data: dict = Depends(get_current_user_token)):
    if user_id != token_data.get('uid'):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only update your own profile.")

    db = get_async_firestore_client()
    user_ref = db.collection('users').document(user_id)

    profile_data = profile.model_dump(exclude_unset=True, by_alias=False)

    existing_doc = await user_ref.get()
    is_new_user = not existing_doc.exists

    # Logic for setting family_id and role for new users
    if is_new_user:
        if 'family_id' not in profile_data or not profile_data['family_id']:
            # New user creating their own family -> they are the admin.
            profile_data['family_id'] = user_id
            profile_data['role'] = schemas.UserRole.ADMIN
        else:
            # New user joining an existing family -> role should be provided.
            if 'role' not in profile_data:
                # Default for safety, but client should be updated to send this.
                profile_data['role'] = schemas.UserRole.MEMBER

    if 'role' in profile_data and profile_data['role'] != schemas.UserRole.KID:
        profile_data['is_kid'] = False

    profile_data['updated_at'] = firestore.SERVER_TIMESTAMP

    if is_new_user:
        profile_data['created_at'] = firestore.SERVER_TIMESTAMP

    await user_ref.set(profile_data, merge=True)

    updated_doc = await user_ref.get()
    updated_profile = updated_doc.to_dict()
    updated_profile['uid'] = updated_doc.id

    return schemas.UserProfile(**updated_profile)

@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(user_id: str, current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != schemas.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can delete users.")

    user_service = UserService()
    profile_to_delete = await user_service.get_user_profile(user_id)

    if not profile_to_delete:
        return None

    user_family_id = current_user.get('family_id') or current_user.get('familyId')
    profile_to_delete_family_id = profile_to_delete.get('family_id') or profile_to_delete.get('familyId')

    if user_family_id != profile_to_delete_family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to delete this user.")

    if current_user.get('uid') == user_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own profile.")

    try:
        await user_service.delete_user_and_cleanup(user_id, profile_to_delete)
    except Exception as e:
        logger.error(f"Failed to delete user {user_id} due to a critical error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="An error occurred during user deletion.")

    return None

@router.get("/stats", response_model=schemas.AdminStats)
async def get_admin_stats(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != schemas.UserRole.ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can access stats.")

    family_id = current_user.get('family_id') or current_user.get('familyId')
    if not family_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Admin user does not have a family ID.")

    user_service = UserService()
    stats = await user_service.get_admin_stats(family_id)
    return schemas.AdminStats(**stats)

@router.get("/by-email/{email}", response_model=schemas.UserProfile)
async def get_user_by_email(email: str, current_user: dict = Depends(get_current_user)):
    # Add security check if necessary, e.g. only admins can search
    user_service = UserService()
    user = await user_service.get_user_by_email(email)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.get("/{user_id}", response_model=schemas.UserProfile)
async def get_user_profile(user_id: str, token: dict = Depends(get_current_user_token)):
    user_service = UserService()

    # Always allow a user to fetch their own profile.
    if user_id == token.get('uid'):
        user_profile = await user_service.get_user_profile(user_id)
        if not user_profile:
            raise HTTPException(status_code=404, detail="User profile not found")
        return user_profile

    # For accessing other profiles, perform authorization checks.
    # We need both the current user's profile and the target user's profile.
    current_user_profile_task = user_service.get_user_profile(token.get('uid'))
    target_user_profile_task = user_service.get_user_profile(user_id)

    current_user_profile, target_user_profile = await asyncio.gather(
        current_user_profile_task,
        target_user_profile_task
    )

    if not target_user_profile:
        raise HTTPException(status_code=404, detail="User not found")
    if not current_user_profile:
        raise HTTPException(status_code=403, detail="Could not identify current user.")

    # New Rule: Admins can see any profile.
    if current_user_profile.get('role') == 'admin':
        return target_user_profile

    # Authorization Rule 1: Users in the same family can see each other's profiles.
    current_family_id = current_user_profile.get('family_id') or current_user_profile.get('familyId')
    target_family_id = target_user_profile.get('family_id') or target_user_profile.get('familyId')
    if current_family_id and current_family_id == target_family_id:
        return target_user_profile

    # Authorization Rule 2: Users who share a trip can see each other's profiles.
    current_user_trips = set(current_user_profile.get('trip_ids') or current_user_profile.get('tripIds') or [])
    target_user_trips = set(target_user_profile.get('trip_ids') or target_user_profile.get('tripIds') or [])

    if current_user_trips.intersection(target_user_trips):
        return target_user_profile

    # If no authorization rules match, deny access.
    raise HTTPException(status_code=403, detail="Not authorized to access this user's profile")

# This endpoint is being moved to the family router
# @router.get("/share-code")
# async def get_share_code(current_user: dict = Depends(get_current_user)):
#     """
#     Generates and returns a 6-character, easy-to-read share code for the user's family.
#     If a code already exists for the family, it returns the existing one.
#     """
#     user_service = UserService()
#     # The user_id of the person requesting is passed to the service.
#     # The service will handle logic of finding the family admin and getting the code.
#     code = user_service.get_or_create_share_code(current_user['uid'])
#     return {"code": code}
