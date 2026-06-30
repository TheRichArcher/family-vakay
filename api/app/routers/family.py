from fastapi import APIRouter, HTTPException, status, Depends, Request
from pydantic import BaseModel, Field
from firebase_admin import firestore, auth as admin_auth
from google.cloud.firestore_v1.base_query import FieldFilter, And
from .. import auth
from ..password import verify_password, get_password_hash
import logging
from slowapi import Limiter
from slowapi.util import get_remote_address
from .. import schemas
from ..firebase_admin import get_async_firestore_client
from ..auth import get_current_user
from ..observability import request_id_ctx
from firebase_admin import auth as firebase_auth
from typing import List
from ..services.user_service import UserService
import asyncio

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
logger = logging.getLogger(__name__)

class FamilyCode(BaseModel):
    family_id: str = Field(..., alias="familyId")

class KidLogin(BaseModel):
    uid: str
    pin: str

async def family_exists(family_id: str) -> bool:
    """
    Checks if a family exists by looking for an admin user with the given family_id.
    """
    db = get_async_firestore_client()
    users_ref = db.collection('users')
    queries = [
        users_ref.where(filter=And(filters=[FieldFilter('family_id', '==', family_id), FieldFilter('role', '==', 'admin')])).limit(1),
        users_ref.where(filter=And(filters=[FieldFilter('familyId', '==', family_id), FieldFilter('role', '==', 'admin')])).limit(1),
    ]
    for query in queries:
        docs = query.stream()
        async for doc in docs:
            if doc.exists:
                return True
    return False

@router.get("/{family_id}/public_members", response_model=list[schemas.PublicUserProfile])
async def get_public_family_members(family_id: str):
    """
    Retrieves a public, non-sensitive list of members for a given family ID.
    This is a public endpoint used for the kid login flow.
    """
    db = get_async_firestore_client()
    users_ref = db.collection('users')
    queries = [
        users_ref.where(filter=FieldFilter('family_id', '==', family_id)),
        users_ref.where(filter=FieldFilter('familyId', '==', family_id)),
    ]

    members_by_id = {}
    for query in queries:
        async for doc in query.stream():
            member_data = doc.to_dict()
            members_by_id[doc.id] = {
                "uid": doc.id,
                "name": member_data.get("name"),
                "role": member_data.get("role"),
            }
    members = list(members_by_id.values())
    return members

@router.post("/validate", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def validate_family_code(request: Request, payload: FamilyCode):
    """
    Validates if a family code exists.
    """
    exists = await family_exists(payload.family_id)
    if not exists:
        logging.info(
            "family_code_validation_failed",
            extra={"request_id": request_id_ctx.get(), "family_id": payload.family_id},
        )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Family ID not found",
        )
    return {"message": "Family ID is valid"}

@router.post("/kid/login", response_model=schemas.Token)
@limiter.limit("5/minute")
async def kid_login(request: Request, kid_login_data: schemas.KidLogin):
    """
    Authenticates a kid with their UID and PIN, and returns a custom Firebase token.
    This is a public endpoint and does not require an authenticated user.
    """
    db = get_async_firestore_client()
    user_ref = db.collection('users').document(kid_login_data.uid)
    user_doc = await user_ref.get()

    if not user_doc.exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Kid profile not found.")

    user_data = user_doc.to_dict()

    if user_data.get('role') != 'kid':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="This endpoint is for kids only.")

    if not user_data.get('pin_hash'):
        logging.error(f"Kid profile {kid_login_data.uid} has no PIN set.")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="PIN not set for this user.")

    if not verify_password(kid_login_data.pin, user_data['pin_hash']):
        logging.warning(
            "kid_login_failed_incorrect_pin",
            extra={"request_id": request_id_ctx.get(), "uid": kid_login_data.uid},
        )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect PIN.")

    try:
        # The UID for the custom token must be the user's actual Firebase UID.
        custom_token = await asyncio.to_thread(firebase_auth.create_custom_token, kid_login_data.uid)
        return {"access_token": custom_token, "token_type": "bearer"}
    except Exception as e:
        logging.error(f"Error creating custom token for {kid_login_data.uid}: {e}")
        raise HTTPException(status_code=500, detail="Could not generate login token.")

@router.get("/share-code")
async def get_share_code(current_user: dict = Depends(get_current_user)):
    """
    Generates and returns a 6-character, easy-to-read share code for the user's family.
    If a code already exists for the family, it returns the existing one.
    """
    user_service = UserService()
    code = await user_service.get_or_create_share_code(current_user['uid'])
    return {"code": code}

@router.get("/by-code/{share_code}", response_model=schemas.FamilyId)
async def get_family_by_share_code(share_code: str):
    user_service = UserService()
    family_id = await user_service.get_family_id_by_share_code(share_code)
    if not family_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invalid share code.")
    return schemas.FamilyId(familyId=family_id)

@router.get("/{family_id}/members", response_model=List[schemas.UserProfile])
async def get_family_members(family_id: str, current_user: dict = Depends(get_current_user)):
    # Security check: Ensure current user is part of the family they are requesting.
    user_family_id = current_user.get('family_id') or current_user.get('familyId')
    if user_family_id != family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You are not authorized to view this family's members.")

    user_service = UserService()
    members = await user_service.get_family_members_by_id(family_id)

    if not members:
        logger.warning(f"No family members found for family_id: {family_id} using either 'family_id' or 'familyId' fields.")

    return members
