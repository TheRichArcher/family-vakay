import os
import logging
import uuid
import asyncio
from typing import Optional
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from app.routers import (
    users,
    auth,
    trips,
    activities,
    ai,
    family,
    rewards
)
from app.firebase_admin import initialize_firebase_admin, get_firestore_client
import firebase_admin
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration
from sentry_sdk.integrations.asyncio import AsyncioIntegration
from app.observability import install_logging_context_filter, set_request_id

# --- Robust .env file loading ---
# Construct a path to the .env file relative to this script's location
dotenv_path = os.path.join(os.path.dirname(__file__), '..', '.env')
load_dotenv(dotenv_path=dotenv_path)

# ---------------------- Logging & Sentry ----------------------
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s request_id=%(request_id)s user_id=%(user_id)s family_id=%(family_id)s",
)

SENTRY_DSN = os.getenv("SENTRY_DSN", "")
SENTRY_ENV = os.getenv("SENTRY_ENV", "development")
if SENTRY_DSN:
    sentry_sdk.init(
        dsn=SENTRY_DSN,
        environment=SENTRY_ENV,
        integrations=[FastApiIntegration(), LoggingIntegration(level=logging.INFO, event_level=logging.ERROR), AsyncioIntegration()],
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.0")),
    )

install_logging_context_filter()

class RequestContextMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
        set_request_id(request_id)
        response = await call_next(request)
        response.headers["x-request-id"] = request_id
        return response

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])

app = FastAPI(title="Family VK App API")
app.add_middleware(RequestContextMiddleware)
app.state.limiter = limiter
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    logging.warning(
        "rate_limit_exceeded",
        extra={
            "path": request.url.path,
            "client": request.client.host if request.client else None,
        },
    )
    return await _rate_limit_exceeded_handler(request, exc)

app.add_exception_handler(RateLimitExceeded, rate_limit_handler)

@app.get("/", include_in_schema=False)
async def health_check():
    return {"status": "ok"}

@app.get("/health", include_in_schema=False)
async def health_check_explicit():
    return {"status": "ok"}

@app.get("/ready", include_in_schema=False)
async def readiness_check():
    checks = {
        "firebaseAdmin": bool(firebase_admin._apps),
        "firestore": False,
    }

    if checks["firebaseAdmin"]:
        try:
            db = get_firestore_client()
            await asyncio.to_thread(lambda: next(db.collection("users").limit(1).stream(), None))
            checks["firestore"] = True
        except Exception:
            logging.exception("readiness_firestore_check_failed")

    ready = all(checks.values())
    return {
        "status": "ok" if ready else "degraded",
        "checks": checks,
    }

@app.get("/version", include_in_schema=False)
async def version_check():
    commit = (
        os.getenv("RENDER_GIT_COMMIT")
        or os.getenv("GIT_COMMIT")
        or os.getenv("COMMIT_SHA")
        or "unknown"
    )
    return {
        "status": "ok",
        "service": os.getenv("RENDER_SERVICE_NAME", "family-vakay-backend"),
        "environment": SENTRY_ENV,
        "commit": commit,
        "shortCommit": commit[:7] if commit != "unknown" else "unknown",
    }

# Configure CORS from environment variable (comma-separated)
# Keep localhost defaults for development convenience; rely on CORS_ORIGINS for staging/prod.
default_origins = [
    "http://localhost",
    "http://localhost:8081",
    "http://localhost:19006",
    # Deployed frontend (Render)
    "https://family-vakay-frontend.onrender.com",
]

cors_origins_env = os.getenv("CORS_ORIGINS", "").strip()
frontend_url_env = os.getenv("FRONTEND_URL", "").strip()
if cors_origins_env:
    configured_origins = [origin.strip() for origin in cors_origins_env.split(',') if origin.strip()]
    # Merge with dev defaults; use a set to dedupe
    origins = list({*default_origins, *configured_origins})
else:
    origins = default_origins

# Optionally add FRONTEND_URL if provided explicitly
if frontend_url_env:
    origins = list({*origins, frontend_url_env})

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)

initialize_firebase_admin()

# Context is set in the auth dependency when user is verified

# Routers
app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(trips.router, prefix="/api/v1/trips", tags=["trips"])
app.include_router(activities.router, prefix="/api/v1/activities", tags=["activities"])
app.include_router(ai.router, prefix="/api/v1/ai", tags=["ai"])
app.include_router(family.router, prefix="/api/v1/family", tags=["family"])
app.include_router(rewards.router, prefix="/api/v1/rewards", tags=["rewards"])
