from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
import re
import logging

from ..auth import get_current_user, verify_trip_participant_for_activity
from .. import schemas
from ..services.activities_service import ActivitiesService
from ..services.storage_service import get_storage_service

router = APIRouter()
logger = logging.getLogger(__name__)

class UploadURLRequest(BaseModel):
    file_name: str
    content_type: str

class AddImageRequest(BaseModel):
    image_url: str

@router.post("/", response_model=schemas.Activity, status_code=status.HTTP_201_CREATED)
async def create_activity(activity: schemas.ActivityCreate, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        new_activity = await activities_service.create_activity(activity, current_user)
        return new_activity
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to create activity.")

@router.get("/all", response_model=list[schemas.Activity])
async def get_all_activities(current_user: dict = Depends(get_current_user)):
    if current_user.get('role') != 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can view all activities.")
    
    activities_service = ActivitiesService()
    try:
        activities = await activities_service.get_all_activities()
        return activities
    except Exception as e:
        logger.error(f"Failed to get all activities: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to retrieve activities.")

@router.put("/{activity_id}", response_model=schemas.Activity)
async def update_activity(activity_id: str, activity_update: schemas.ActivityUpdate, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        updated_activity = await activities_service.update_activity(activity_id, activity_update, current_user)
        return updated_activity
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to update activity.")

@router.get("/{activity_id}", response_model=schemas.Activity)
async def read_activity(activity_id: str, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    activity = await activities_service.get_activity(activity_id, current_user)
    if not activity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")
    return activity

@router.delete("/trip/{trip_id}/activity/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity(trip_id: str, activity_id: str, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        await activities_service.delete_activity(activity_id, trip_id, current_user)
    except PermissionError as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete activity.")
    
    return None

@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_activity_idea(activity_id: str, current_user: dict = Depends(get_current_user)):
    # For now, only allow admins to delete ideas that are not part of a trip
    if not current_user.get('role') == 'admin':
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only admins can delete activity ideas.")
    
    activities_service = ActivitiesService()
    try:
        # We can reuse the existing service method, but we need to ensure it can handle idea deletion
        # For now, we'll call it with a dummy trip_id and rely on the service to handle it.
        # A better approach would be to refactor the service layer.
        await activities_service.delete_activity(activity_id, trip_id=None, current_user=current_user)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error deleting activity idea {activity_id}: {e}", exc_info=True)
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to delete activity idea.")
    
    return None

@router.post("/{activity_id}/generate-upload-url", status_code=200)
async def generate_activity_image_upload_url(
    activity_id: str,
    req: UploadURLRequest,
    current_user: dict = Depends(get_current_user),
    trip: dict = Depends(verify_trip_participant_for_activity)
):
    user_id = current_user['uid']
    trip_id = trip['id']
    
    safe_file_name = re.sub(r'[^a-zA-Z0-9_.-]', '_', req.file_name)
    storage_service = get_storage_service()
    
    file_path = f"activity_gallery/{trip_id}/{activity_id}/{user_id}/{safe_file_name}"
    max_upload_size = 15 * 1024 * 1024  # 15 MB limit

    try:
        signed_url = storage_service.generate_signed_upload_url(
            file_path,
            content_type=req.content_type,
            max_upload_size_bytes=max_upload_size
        )
        return {"signed_url": signed_url, "image_url": file_path}
    except Exception as e:
        logger.error(f"Failed to generate signed URL for activity {activity_id}: {e}")
        raise HTTPException(status_code=500, detail="Could not generate upload URL.")

@router.post("/{activity_id}/add-image", status_code=status.HTTP_200_OK)
async def add_image_to_activity(
    activity_id: str,
    req: AddImageRequest,
    current_user: dict = Depends(get_current_user),
    trip: dict = Depends(verify_trip_participant_for_activity)
):
    user_id = current_user['uid']
    activities_service = ActivitiesService()
    try:
        # Validate server-side before accepting the image path
        storage_service = get_storage_service()
        storage_service.validate_uploaded_image(
            file_path=req.image_url,
            expected_content_type="image/*",
            max_size_bytes=15 * 1024 * 1024,
        )
        # Ensure a download token is present on original
        storage_service.ensure_download_token(req.image_url)

        # Generate derivatives (1024 max-edge and 256 thumb)
        try:
            derivatives = storage_service.generate_derivatives(req.image_url)
            thumb_path = derivatives.get("thumbnail_path")
            resized_path = derivatives.get("resized_path")
        except Exception as gen_e:
            logger.error(f"Failed to generate image derivatives for activity {activity_id}: {gen_e}")
            # We still proceed with original image only to not block the flow
            thumb_path = None
            resized_path = None

        # Persist the image via service method (backwards compatible, now supports derivatives)
        updated_activity = await activities_service.add_image_to_gallery(
            activity_id=activity_id,
            user_id=user_id,
            image_url=req.image_url,
            resized_url=resized_path,
            thumbnail_url=thumb_path,
        )
        return updated_activity
    except ValueError as e:
        # ValueError here usually indicates validation issues like size/type
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Could not add image to activity {activity_id}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Failed to add image.")

@router.post("/{activity_id}/vote", status_code=status.HTTP_200_OK)
async def vote_on_activity(activity_id: str, vote: schemas.ActivityVote, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        updated_activity = await activities_service.cast_vote(activity_id, current_user['uid'], vote.vote)
        return updated_activity
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e))

@router.post("/{activity_id}/rate", status_code=status.HTTP_200_OK)
async def rate_activity(activity_id: str, rating: schemas.ActivityRating, current_user: dict = Depends(get_current_user)):
    activities_service = ActivitiesService()
    try:
        updated_activity = await activities_service.add_rating(activity_id, current_user['uid'], rating)
        return updated_activity
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except PermissionError as e:
        raise HTTPException(status_code=403, detail=str(e)) 