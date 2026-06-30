from fastapi import APIRouter, Depends, HTTPException, status, BackgroundTasks, UploadFile, File, Form
import uuid
from typing import List
from pydantic import BaseModel
import logging
import datetime
import re

from .. import schemas
from ..auth import get_current_user, get_current_user_token
from ..observability import request_id_ctx
from ..services.trips_service import TripsService
from ..services.activities_service import ActivitiesService
from ..services.ai_service import AIService
from ..services.storage_service import get_storage_service
from ..services.user_service import UserService

router = APIRouter(
    tags=["trips"],
    responses={404: {"description": "Not found"}},
)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Helper classes and functions from scavenger_hunt.py
class UploadURLRequest(BaseModel):
    file_name: str
    content_type: str

class SubmitChallengeRequest(BaseModel):
    image_url: str

async def verify_trip_participant(trip_id: str, current_user: dict = Depends(get_current_user)):
    """Dependency to verify if the current user is a participant of the trip."""
    trips_service = TripsService()
    try:
        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        return trip
    except (ValueError, PermissionError):
        raise HTTPException(status_code=403, detail="You are not authorized to access this trip's resources.")

def get_current_admin_user(current_user: dict = Depends(get_current_user)):
    if current_user.get("role") != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Requires admin privileges")
    return current_user

# --- Signed URL for Trip Cover Image Uploads (avoids client-side App Check issues) ---
@router.post("/generate-cover-upload-url", status_code=200)
async def generate_trip_cover_upload_url(
    req: UploadURLRequest,
    current_user: dict = Depends(get_current_user),
):
    """Generate a short-lived signed URL to upload a trip cover image.

    The file will be stored under trip_cover_images/{userId}/{fileName} and the response will
    include both the signed URL for upload and the storage path to persist as coverImageUrl.
    """
    try:
        user_id = current_user['uid']
        safe_file_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', req.file_name)
        storage_service = get_storage_service()
        file_path = f"trip_cover_images/{user_id}/{safe_file_name}"
        max_upload_size = 10 * 1024 * 1024  # 10MB

        signed_url = storage_service.generate_signed_upload_url(
            file_path,
            content_type=req.content_type,
            max_upload_size_bytes=max_upload_size,
        )
        return {"signed_url": signed_url, "image_url": file_path}
    except Exception as e:
        logger.error(f"Failed to generate signed URL for trip cover: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not generate upload URL.")

class FinalizeCoverRequest(BaseModel):
    image_path: str

@router.post("/finalize-cover", status_code=200)
async def finalize_cover_upload(req: FinalizeCoverRequest, current_user: dict = Depends(get_current_user)):
    """Ensure the uploaded blob has a download token and return a public URL-compatible path.
    Frontend will store the path; rendering uses StorageImage which resolves to a signed URL.
    """
    try:
        storage_service = get_storage_service()
        # Validate the uploaded file before finalizing
        # Trip cover has a stricter 10MB cap and must be an image
        storage_service.validate_uploaded_image(
            file_path=req.image_path,
            expected_content_type="image/*",  # actual CT is verified from blob
            max_size_bytes=10 * 1024 * 1024,
        )
        token = storage_service.ensure_download_token(req.image_path)

        # Optionally generate derivatives for covers, too (faster cover loading)
        thumb_path = None
        resized_path = None
        try:
            derivatives = storage_service.generate_derivatives(req.image_path)
            thumb_path = derivatives.get("thumbnail_path")
            resized_path = derivatives.get("resized_path")
        except Exception as e:
            logger.info(f"Cover derivative generation skipped/failed: {e}")

        return {
            "image_path": req.image_path,
            "download_token": token,
            "resized_path": resized_path,
            "thumbnail_path": thumb_path,
        }
    except ValueError as e:
        # Provide a clear client error when validation fails
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed to finalize cover upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Could not finalize cover upload.")

# --- Direct upload proxy to bypass browser CORS issues ---
@router.post("/upload-cover-direct", status_code=200)
async def upload_cover_direct(
    file: UploadFile = File(...),
    trip_id: str | None = Form(default=None),
    current_user: dict = Depends(get_current_user),
):
    """Accepts a multipart/form-data image and uploads it to GCS server-side.

    Returns the `image_path` and a `download_token` so the FE can persist a stable public URL.
    """
    try:
        user_id = current_user['uid']
        storage_service = get_storage_service()
        content_type = (file.content_type or "application/octet-stream").lower()

        # Always generate a short, safe server-side name to avoid client-supplied
        # filenames that may contain data URIs or excessively long strings.
        def _ext_for_content_type(ct: str) -> str:
            if ct.startswith("image/jpeg"):
                return "jpg"
            if ct.startswith("image/png"):
                return "png"
            if ct.startswith("image/webp"):
                return "webp"
            return "bin"

        safe_file_name = f"{uuid.uuid4()}.{_ext_for_content_type(content_type)}"
        if trip_id:
            trips_service = TripsService()
            try:
                trip = await trips_service.get_trip_by_id(trip_id, current_user)
            except (ValueError, PermissionError):
                raise HTTPException(status_code=403, detail="You are not authorized to upload a cover for this trip.")
            is_owner = getattr(trip, "owner_id", None) == user_id
            is_admin = current_user.get("role") == "admin"
            if not is_owner and not is_admin:
                raise HTTPException(status_code=403, detail="Only the trip owner or an admin can update the cover image.")
            file_path = f"trip_cover_images/{user_id}/{trip_id}/{safe_file_name}"
        else:
            file_path = f"trip_cover_images/{user_id}/{safe_file_name}"

        # Upload to GCS
        if not storage_service.bucket:
            logger.error("upload_cover_direct: bucket is None")
            raise HTTPException(status_code=500, detail="Storage bucket is not available.")
        blob = storage_service.bucket.blob(file_path)
        # Reset pointer to start (UploadFile is a SpooledTemporaryFile)
        try:
            file.file.seek(0)
        except Exception as seek_e:
            logger.warning(f"upload_cover_direct: failed to seek(0) on upload file: {seek_e}")
        try:
            blob.upload_from_file(file.file, content_type=content_type)
        except Exception as upload_e:
            logger.error(f"upload_cover_direct: upload_from_file failed: {upload_e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Upload to storage failed: {upload_e}")

        # Validate and ensure token
        storage_service.validate_uploaded_image(
            file_path=file_path,
            expected_content_type="image/*",
            max_size_bytes=10 * 1024 * 1024,
        )
        try:
            token = storage_service.ensure_download_token(file_path)
        except Exception as token_e:
            logger.error(f"upload_cover_direct: ensure_download_token failed: {token_e}", exc_info=True)
            raise HTTPException(status_code=500, detail=f"Failed to ensure download token: {token_e}")
        # Generate derivatives for the cover
        thumb_path = None
        resized_path = None
        try:
            derivatives = storage_service.generate_derivatives(file_path)
            thumb_path = derivatives.get("thumbnail_path")
            resized_path = derivatives.get("resized_path")
        except Exception as e:
            logger.info(f"Cover derivative generation skipped/failed in direct upload: {e}")
        return {"image_path": file_path, "download_token": token, "resized_path": resized_path, "thumbnail_path": thumb_path}
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Failed direct cover upload: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Direct cover upload failed: {e}")

@router.post("/", response_model=schemas.Trip)
async def create_trip(trip: schemas.TripCreate, current_user: dict = Depends(get_current_user)):
    try:
        trips_service = TripsService()
        new_trip = await trips_service.create_trip(trip, current_user)
        return new_trip
    except PermissionError as e:
        # Return a clear 403 when the user lacks privileges (e.g., not an admin)
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        # Bad request / validation issues from the service layer
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        # Surface more detail in logs to aid debugging persistent 500s
        logger.error(f"Unexpected error during trip creation: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create trip.")

@router.get("/", response_model=List[schemas.Trip])
async def get_trips(current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    user_id = current_user.get("uid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials.")

    # Fetch trips where the user is a participant OR owner (more robust for legacy data)
    return await trips_service.get_trips_for_user(current_user)

@router.get("/with-budget-summary", response_model=List[schemas.TripWithBudget])
async def get_trips_with_budget_summary(current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    activities_service = ActivitiesService()
    user_id = current_user.get("uid")
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials.")

    trips = await trips_service.get_trips_for_participant(user_id)

    trips_with_budgets = []
    for trip_dict in trips:
        # The service returns dicts, so we validate and convert to a Trip model
        trip = schemas.Trip.model_validate(trip_dict)
        if trip.budget and trip.budget > 0:
            activities = await activities_service.get_activities_for_trip_internal(trip.id, user_id)
            total_spent = sum(
                (float(act.get('cost', 0) or 0) + float(act.get('additionalExpenses', 0) or 0))
                for act in activities if act.get('isBooked')
            )
            trip_with_budget = schemas.TripWithBudget(**trip.model_dump(), total_spent=total_spent)
            trips_with_budgets.append(trip_with_budget)

    return trips_with_budgets

@router.get("/family/{family_id}", response_model=List[schemas.Trip])
async def get_family_trips(family_id: str, current_user: dict = Depends(get_current_user)):
    # Allow admin to fetch any family's trips, or a user to fetch their own.
    profile = current_user.get("profile") or {}
    user_family_id = (
        current_user.get("familyId")
        or current_user.get("family_id")
        or profile.get("familyId")
        or profile.get("family_id")
    )
    is_admin = current_user.get("role") == "admin"

    if not is_admin and user_family_id != family_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="You can only access trips within your own family.")

    trips_service = TripsService()
    return await trips_service.get_trips_for_family(family_id)

@router.get("/by-code/{vacation_code}", response_model=schemas.Trip)
async def get_trip_by_code(vacation_code: str, current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    try:
        trip = await trips_service.get_trip_by_code(vacation_code)
        return trip
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

class TripParticipantsUpdate(BaseModel):
    participant_uids: list[str]

@router.put("/{trip_id}/participants", response_model=schemas.Trip)
async def update_trip_participants(
    trip_id: str,
    update: TripParticipantsUpdate,
    current_user: dict = Depends(get_current_user)
):
    trips_service = TripsService()
    try:
        updated_trip = await trips_service.update_trip_participants(trip_id, update.participant_uids, current_user)
        return updated_trip
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))

@router.get("/{trip_id}", response_model=schemas.Trip)
async def read_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    try:
        trip = await trips_service.get_trip_by_id(trip_id, current_user)
        return trip
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

@router.put("/{trip_id}", response_model=schemas.Trip)
async def update_trip(trip_id: str, trip: schemas.TripUpdate, current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    try:
        updated_trip = await trips_service.update_trip(trip_id, trip, current_user)
        return updated_trip
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trip(trip_id: str, current_user: dict = Depends(get_current_user)):
    trips_service = TripsService()
    try:
        await trips_service.delete_trip(trip_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    return None

@router.get("/{trip_id}/activities", response_model=List[schemas.Activity])
async def get_trip_activities(trip_id: str, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        activities = await activities_service.get_activities_for_trip(trip_id, current_user)
        return activities
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))

@router.post("/{trip_id}/generate-ai-hunt", response_model=List[schemas.Activity])
async def generate_ai_scavenger_hunt(trip_id: str, current_user: dict = Depends(get_current_user)):
    ai_service = AIService()
    try:
        # This service method will need to handle all the complex logic
        updated_activities = await ai_service.generate_hunt_for_trip(trip_id, current_user)
        return updated_activities
    except ValueError as e: # For "trip not found" or "no activities"
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except Exception as e:
        # Catching generic exceptions from the AI service
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

@router.post("/{trip_id}/activities/{activity_id}/challenges/{challenge_index}/generate-upload-url", status_code=200)
async def generate_upload_url(
    trip_id: str,
    activity_id: str,
    challenge_index: int,
    req: UploadURLRequest,
    current_user: dict = Depends(get_current_user),
    trip: dict = Depends(verify_trip_participant)
):
    user_id = current_user['uid']
    safe_file_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', req.file_name)
    storage_service = get_storage_service()
    file_path = f"scavenger_hunts/{trip_id}/{activity_id}/{user_id}/{safe_file_name}"
    max_upload_size = 10 * 1024 * 1024

    try:
        signed_url = storage_service.generate_signed_upload_url(
            file_path,
            content_type=req.content_type,
            max_upload_size_bytes=max_upload_size
        )
        return {"signed_url": signed_url, "image_url": file_path}
    except Exception as e:
        logger.error(f"Failed to generate signed URL: {e}")
        raise HTTPException(status_code=500, detail="Could not generate upload URL.")

@router.post("/{trip_id}/activities/{activity_id}/challenges/{challenge_index}/submit", status_code=202)
async def submit_challenge_for_scoring(
    trip_id: str,
    activity_id: str,
    challenge_index: int,
    req: SubmitChallengeRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(get_current_user),
    trip: dict = Depends(verify_trip_participant)
):
    user_id = current_user['uid']
    activities_service = ActivitiesService()
    activity = await activities_service.get_activity(activity_id, current_user)
    if not activity or activity.get('tripId') != trip_id:
        raise HTTPException(status_code=404, detail="Activity not found in this trip.")

    challenges = activity.get('challenges', [])
    if not (0 <= challenge_index < len(challenges)):
        raise HTTPException(status_code=404, detail="Challenge not found.")

    # --- Start Read-Modify-Write to prevent array corruption ---
    challenge_to_update = challenges[challenge_index]

    # Ensure 'completions' field exists and is a dictionary
    if 'completions' not in challenge_to_update or not isinstance(challenge_to_update.get('completions'), dict):
        challenge_to_update['completions'] = {}

    # Set pending status for the user's submission
    challenge_to_update['completions'][user_id] = {
        'imageUrl': req.image_url,
        'status': 'pending',
        'comment': 'Our AI Judge is thinking...',
        'pointsAwarded': 0,
        'submittedAt': datetime.datetime.utcnow().isoformat()
    }

    # Overwrite the entire challenges array
    await activities_service.update_activity_internal(activity_id, {"challenges": challenges})
    # --- End Read-Modify-Write ---

    challenge = challenges[challenge_index]

    background_tasks.add_task(
        score_challenge_submission_background,
        activity_id=activity_id,
        challenge_index=challenge_index,
        user_id=user_id,
        image_url=req.image_url,
        challenge_text=challenge['text'],
        age_group=challenge.get('age_group')
    )
    return {"message": "Your submission is being reviewed by our AI judge!"}

async def score_challenge_submission_background(activity_id: str, challenge_index: int, user_id: str, image_url: str, challenge_text: str, age_group: str | None):
    try:
        ai_service = AIService()
        await ai_service.score_challenge_submission(
            activity_id=activity_id,
            challenge_index=challenge_index,
            user_id=user_id,
            image_url=image_url,
            challenge_text=challenge_text,
            age_group=age_group
        )
    except Exception as e:
        logger.error(f"FATAL: Background scoring task failed for user {user_id} on activity {activity_id}: {e}", exc_info=True)
        # Manually update the status to 'error' as a fallback
        try:
            activities_service = ActivitiesService()
            # --- Start Read-Modify-Write for error handling ---
            activity = await activities_service.get_activity(activity_id, {'uid': user_id})
            if activity:
                challenges = activity.get('challenges', [])
                if 0 <= challenge_index < len(challenges):
                    challenge = challenges[challenge_index]
                    if 'completions' in challenge and user_id in challenge['completions']:
                        challenge['completions'][user_id]['status'] = 'error'
                        challenge['completions'][user_id]['comment'] = "A system error occurred while judging. Please try again or contact support."
                        challenge['completions'][user_id]['pointsAwarded'] = 0

                        await activities_service.update_activity_internal(activity_id, {"challenges": challenges})
            # --- End Read-Modify-Write ---
        except Exception as update_e:
            logger.error(f"FATAL: Failed to update challenge status to 'error' after scoring failure: {update_e}", exc_info=True)
