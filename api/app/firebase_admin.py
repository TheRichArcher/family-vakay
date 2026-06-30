import firebase_admin
from firebase_admin import credentials, firestore, initialize_app, get_app
from firebase_admin import storage as admin_storage
from firebase_admin import firestore_async
import os
import json
import logging
import asyncio

_app_initialized = False

def initialize_firebase_admin():
    global _app_initialized
    if _app_initialized:
        return

    # This function will now run synchronously at startup.
    # We wrap the core logic in a try/except to prevent a crash
    # and to log any initialization errors clearly.
    
    cred = None
    try:
        # First, try the environment variable (for production)
        service_account_json_str = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')

        if service_account_json_str:
            service_account_info = json.loads(service_account_json_str)
            cred = credentials.Certificate(service_account_info)
            logging.info("Attempting to initialize Firebase Admin SDK from environment variable.")
        else:
            # Fallback to local file for dev
            service_account_key_path = 'serviceAccountKey.json'
            if os.path.exists(service_account_key_path):
                cred = credentials.Certificate(service_account_key_path)
                logging.info(f"Attempting to initialize Firebase Admin SDK from local {service_account_key_path}.")

        if not cred:
            logging.critical("FATAL: Firebase credentials not found. App will not be able to connect to Firebase.")
            return # Exit the function, _app_initialized remains False

        storage_bucket_raw = os.getenv('FIREBASE_STORAGE_BUCKET', '')
        project_id = os.getenv('GOOGLE_CLOUD_PROJECT') or os.getenv('FIREBASE_PROJECT_ID')

        # New resolver: accept modern hostnames, prefer .firebasestorage.app for bare IDs
        from firebase_admin import storage as fb_storage

        def resolve_bucket_name(raw: str, project_id: str | None = None) -> str:
            """Return a usable bucket name without forcing legacy domains."""
            if not raw:
                raise ValueError("FIREBASE_STORAGE_BUCKET is not set")

            bucket = raw.strip()
            # strip scheme if present
            if bucket.startswith("gs://"):
                bucket = bucket[len("gs://"):]
            # strip any accidental path
            bucket = bucket.split("/")[0].strip()

            # Accept explicit bucket hostnames as-is
            lowered = bucket.lower()
            if lowered.endswith(".firebasestorage.app") or lowered.endswith(".appspot.com"):
                return bucket

            # If user gave bare project id, prefer modern hostname, then legacy
            proj = bucket if "." not in bucket else (project_id or bucket)
            candidates = [f"{proj}.firebasestorage.app", f"{proj}.appspot.com"]
            # Try to pick the first one that exists; if neither exists, default to modern
            for c in candidates:
                try:
                    if fb_storage.bucket(c).exists():
                        return c
                except Exception:
                    # If we lack permission to check existence, just fall through
                    pass
            return candidates[0]

        try:
            resolved_bucket = resolve_bucket_name(storage_bucket_raw, project_id)
        except Exception as e:
            logging.error(f"Failed to resolve storage bucket name from '{storage_bucket_raw}': {e}")
            resolved_bucket = storage_bucket_raw.strip()

        initialize_app(cred, {'storageBucket': resolved_bucket})

        # Proactively verify Storage bucket resolution and accessibility
        try:
            bucket = admin_storage.bucket()
            bucket_name = getattr(bucket, 'name', None)
            exists = False
            try:
                exists = bucket.exists() if bucket_name else False
            except Exception:
                # Don't crash merely on exists(); log and continue, real ops will surface at use-time
                pass
            logging.info(
                f"Firebase Storage bucket resolved to '{bucket_name}'. exists={exists}"
            )
            if not exists:
                logging.warning(
                    "Bucket may not be accessible yet (exists check returned False). "
                    "Continuing with configured name; verify IAM/billing if operations fail."
                )

            # --- Ensure CORS configuration allows our frontend origin ---
            try:
                # Frontend origin(s) to allow. Comma-separated list via env overrides.
                default_frontend = "https://family-vakay-frontend.onrender.com"
                cors_origins_env = os.getenv("STORAGE_CORS_ORIGINS", default_frontend)
                desired_origins = [o.strip() for o in cors_origins_env.split(',') if o.strip()]

                # Always include localhost for development convenience
                dev_origins = [
                    "http://localhost",
                    "http://localhost:19006",
                    "http://localhost:8081",
                ]
                for d in dev_origins:
                    if d not in desired_origins:
                        desired_origins.append(d)

                desired_methods = ["GET", "HEAD", "OPTIONS"]
                desired_headers = ["Content-Type", "Authorization"]
                desired_max_age = 3600

                # Merge with existing rules without removing unrelated entries
                existing = bucket.cors or []
                updated = list(existing)

                def _rule_matches(rule: dict, origin: str) -> bool:
                    r_origins = [o.lower() for o in (rule.get("origin") or [])]
                    return origin.lower() in r_origins

                def _ensure_rule_for_origin(origin: str):
                    nonlocal updated
                    # Find first matching rule by origin
                    for rule in updated:
                        if _rule_matches(rule, origin):
                            # Update in-place to ensure methods/headers contain required values
                            methods = set([m.upper() for m in (rule.get("method") or [])])
                            headers = set([h for h in (rule.get("responseHeader") or [])])
                            methods.update(desired_methods)
                            headers.update(desired_headers)
                            rule["method"] = sorted(list(methods))
                            rule["responseHeader"] = sorted(list(headers))
                            # Prefer the larger of existing and desired max age
                            rule["maxAgeSeconds"] = max(int(rule.get("maxAgeSeconds") or 0), desired_max_age)
                            return
                    # No matching rule; append a new one
                    updated.append({
                        "origin": [origin],
                        "method": desired_methods,
                        "responseHeader": desired_headers,
                        "maxAgeSeconds": desired_max_age,
                    })

                for origin in desired_origins:
                    _ensure_rule_for_origin(origin)

                if updated != existing:
                    bucket.cors = updated
                    bucket.patch()
                    logging.info("Updated Storage CORS rules for origins: %s", ", ".join(desired_origins))
                else:
                    logging.info("Storage CORS rules already include required origins; no update needed")
            except Exception as cors_e:
                logging.warning("Could not ensure Storage CORS config: %s", cors_e)
        except Exception as verify_e:
            logging.error(f"Failed to verify Firebase Storage bucket existence: {verify_e}")

        _app_initialized = True
        logging.info("Firebase Admin SDK initialized successfully.")

    except Exception as e:
        logging.critical(f"FATAL: An unexpected error occurred during Firebase Admin SDK initialization: {e}")
        # _app_initialized remains False, subsequent calls will fail cleanly.


def get_firestore_client():
    if not _app_initialized:
        raise ConnectionError("Firebase not initialized. Check server logs for initialization errors.")
    return firestore.client()

def get_async_firestore_client():
    if not _app_initialized:
        raise ConnectionError("Firebase not initialized. Check server logs for initialization errors.")
    return firestore_async.client() 