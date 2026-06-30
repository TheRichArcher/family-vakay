from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from datetime import timedelta, datetime
from .. import schemas, auth
import firebase_admin
from firebase_admin import auth as firebase_auth
from ..firebase_admin import get_firestore_client
import logging
import time

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

router = APIRouter()

@router.get("/")
async def read_root():
    return {"message": "Welcome to the Family VK App API"}

# The /token and /register endpoints are being removed.
# The client-side application handles user registration and sign-in directly 
# with Firebase Authentication. The client obtains a Firebase ID token, which is
# sent in the Authorization header of API requests and verified by the
# get_current_user dependency. 