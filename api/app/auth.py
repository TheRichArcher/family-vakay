from datetime import datetime, timedelta, timezone
from typing import Optional
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
import os
from dotenv import load_dotenv
import firebase_admin
from firebase_admin import auth as firebase_auth
from .firebase_admin import get_firestore_client
from .observability import set_user_context
import sentry_sdk
from passlib.context import CryptContext
from pydantic import BaseModel
import logging

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")

def verify_firebase_token(token: str) -> dict:
    if not firebase_admin._apps:
        logging.error("CRITICAL: Firebase Admin SDK not initialized. Cannot verify token.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Server configuration error: Firebase Admin SDK not initialized."
        )
    try:
        decoded_token = firebase_auth.verify_id_token(token)
        return decoded_token
    except Exception as e:
        logging.error(f"Firebase ID token verification failed. Error: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Firebase token: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        )

async def get_current_user_token(token: str = Depends(oauth2_scheme)) -> dict:
    """
    Verifies the Firebase ID token and returns the decoded token.
    Does not fetch the user profile from Firestore.
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        decoded_token = verify_firebase_token(token)
        if not decoded_token.get("uid"):
            raise credentials_exception
        # set minimal context early (family id will be added when loading profile)
        uid = decoded_token.get("uid")
        set_user_context(uid, None)
        try:
            sentry_sdk.set_user({"id": uid})
        except Exception:
            pass
        return decoded_token
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"An unexpected error occurred during token verification: {e}")
        raise credentials_exception

async def get_current_user(token_data: dict = Depends(get_current_user_token)):
    """
    Fetches the user profile from Firestore using the UID from the verified token.
    If the user profile does not exist, it raises a 404 Not Found exception.
    This enforces that all authenticated users must have a profile document.
    """
    uid = token_data.get("uid")
    db = get_firestore_client()
    user_ref = db.collection('users').document(uid).get()

    if user_ref.exists:
        user_data = user_ref.to_dict()
        user_data['uid'] = user_ref.id
        # enrich family context for logs and Sentry
        family_id = user_data.get('family_id') or user_data.get('familyId')
        set_user_context(user_data['uid'], family_id)
        try:
            if family_id:
                sentry_sdk.set_context("user", {"family_id": family_id})
        except Exception:
            pass
        return user_data
    else:
        logging.warning(f"User with UID {uid} has a valid auth token but no Firestore profile.")
        # This user is authenticated but has not completed profile setup.
        # The client should handle this by prompting for profile creation.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User profile not found. Please complete your registration."
        )

async def verify_trip_participant_for_activity(activity_id: str, current_user: dict = Depends(get_current_user)):
    """
    Dependency that verifies if the current user is a participant of the trip
    an activity belongs to. It also returns the trip data for further use.
    """
    db = get_firestore_client()
    
    # 1. Get the activity
    activity_ref = db.collection('activities').document(activity_id)
    activity_doc = activity_ref.get()
    if not activity_doc.exists:
        raise HTTPException(status_code=404, detail="Activity not found.")
    
    activity_data = activity_doc.to_dict()
    trip_id = activity_data.get('tripId')
    if not trip_id:
        raise HTTPException(status_code=404, detail="Activity is not associated with a trip.")

    # 2. Get the trip
    trip_ref = db.collection('trips').document(trip_id)
    trip_doc = trip_ref.get()
    if not trip_doc.exists:
        raise HTTPException(status_code=404, detail="Trip not found.")
    
    trip_data = trip_doc.to_dict()
    trip_data['id'] = trip_doc.id

    # 3. Check for participation
    user_id = current_user['uid']
    if user_id not in trip_data.get('participants', []):
        raise HTTPException(status_code=403, detail="You are not authorized to access this activity.")
    
    return trip_data 