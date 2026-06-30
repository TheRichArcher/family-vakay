from fastapi import APIRouter, HTTPException, Depends
import os
from pydantic import BaseModel
from typing import List, Optional

from ..services.ai_service import AIService
from ..auth import get_current_user

router = APIRouter()

class StoryRequest(BaseModel):
    keywords: List[str]

class BoredRequest(BaseModel):
    context: Optional[str] = "anywhere"

@router.get("/status")
async def ai_status():
    """Lightweight status endpoint to verify OpenAI connectivity and configuration."""
    ai_service = AIService()
    return {
        "openai_client_initialized": bool(ai_service.client),
        "model": ai_service.model,
        "has_api_key": bool(os.getenv("OPENAI_API_KEY")),
    }

@router.post("/trips/{trip_id}/generate-joke-fact")
async def generate_joke_or_fact(trip_id: str, current_user: dict = Depends(get_current_user)):
    ai_service = AIService()
    try:
        # If OpenAI is not configured, return a friendly fallback
        if not ai_service.client:
            return {"text": "Fun fact: The AI is resting right now. Try again later!"}
        result = await ai_service.generate_joke_or_fact(trip_id, current_user)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trips/{trip_id}/suggest-activity")
async def suggest_activity(trip_id: str, req: BoredRequest, current_user: dict = Depends(get_current_user)):
    ai_service = AIService()
    try:
        result = await ai_service.suggest_activity(trip_id, req.context, current_user)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/trips/{trip_id}/create-story")
async def create_story(trip_id: str, req: StoryRequest, current_user: dict = Depends(get_current_user)):
    ai_service = AIService()
    try:
        if not ai_service.client:
            return {"text": "Story time is offline while the AI naps. Try again soon!"}
        result = await ai_service.create_story(trip_id, req.keywords, current_user)
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
