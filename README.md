# Family VK App

A mobile and web application for family trip planning and coordination.

## Project Structure

The project is a monorepo containing the React Native frontend and the Python FastAPI backend.

```
.
├── api/                    # Backend FastAPI application
│   ├── app/                # Core application logic
│   │   ├── routers/        # API route handlers
│   │   ├── schemas.py      # Pydantic schemas for data validation
│   │   └── auth.py         # Authentication logic
│   ├── .venv/              # Python virtual environment
│   └── requirements.txt    # Python dependencies
├── src/                    # Frontend React Native application
│   ├── screens/            # Screen components
│   ├── components/         # Reusable UI components
│   ├── navigation/         # Navigation configuration
│   ├── services/           # Services for interacting with Firebase/backend
│   ├── contexts/           # React contexts (e.g., AuthContext)
│   └── App.tsx             # Main application component (entry: `index.js` → `src/App.tsx`)
├── firebase.json           # Firebase configuration
├── firestore.rules         # Firestore security rules
└── package.json            # Frontend Node.js dependencies
```

## Quick Start

### Development

1.  **Install dependencies:**

    ```bash
    # For the Frontend (from the root directory)
    npm install

    # For the Backend
    cd api
    python3 -m venv .venv
    source .venv/bin/activate  # On Windows use: .venv\Scripts\activate
    pip install -r requirements.txt
    cd .. 
    ```

2.  **Set up Environment Variables:**

    Create a `.env` file in the `api` directory. You can copy the example:

    ```bash
    cp api/.env.example api/.env
    ```

    You will need to fill in the values for your Firebase project and generate a new `SECRET_KEY`. You can generate a secret key with:
    `openssl rand -hex 32`

3.  **Start the development servers:**

    ```bash
    # Backend (from the root directory)
    cd api
    uvicorn app.main:app --reload

    # Frontend - Mobile (from the root directory, in a new terminal)
    npm start

    # Frontend - Web (from the root directory, in a new terminal)
    npm run web
    ```

### CI Status

Frontend and API tests run on PRs via GitHub Actions. A failing test blocks merge. Badge:

![CI](https://github.com/your-org-or-user/family-vk-app-new/actions/workflows/ci.yml/badge.svg?branch=main)

### Testing

- Frontend: `npm test -- --passWithNoTests=false`
- Backend: `cd api && pytest -q`

## Navigation

- We use **React Navigation** (`@react-navigation/native`, `@react-navigation/native-stack`).
- The app entry path is `index.js` → `src/App.tsx` → `src/navigation/AppNavigator.tsx`.
- Expo Router is not used. All Expo Router scaffolding has been removed.

### Test Credentials

-   **Email:** test@familyvk.com
-   **Password:** test1234

### Deployment

The deployment instructions for Render and Vercel are generally correct, but ensure you set the environment variables securely in their respective dashboards and do not commit them to your repository.

**IMPORTANT:** Remove any secrets stored in plaintext from your `README.md` or other committed files. The `SECRET_KEY` previously in this file has been removed. If you have used it, consider it compromised and generate a new one.

## Environment Variables

Your `api/.env` file should contain:

```
# Used by FastAPI for JWT signing. Generate a new one for production.
# Run `openssl rand -hex 32` to generate a new key.
SECRET_KEY="your-super-secret-key-here"
ALGORITHM="HS256"
ACCESS_TOKEN_EXPIRE_MINUTES=30

# The following are needed if you connect to a separate database,
# but this project currently uses Firestore.
# DATABASE_URL=postgresql://user:password@localhost:5432/family_vk_app
```

### Frontend Runtime Config (single source of truth)

Set these in `app.json` under `expo.extra` (and mirror in your hosting env vars for web builds if desired). A sample file is provided at `app.config.example.json`:

- `EXPO_PUBLIC_API_URL`: Backend base URL
- `DEEPLINK_BASE_URL`: Public base URL used for deep links (e.g., `https://family.example.com`)
- `QR_BASE_URL`: Public base URL encoded in QR codes (often same as `DEEPLINK_BASE_URL`)
- `EXPO_PUBLIC_SENTRY_DSN`: Sentry DSN for the frontend (optional to enable Sentry)
- `SENTRY_ENV`: environment label for Sentry (e.g., development, staging, production)

Recommended values per environment:

- Dev:
  - `EXPO_PUBLIC_API_URL`: `http://localhost:8000` (Android emulator uses `http://10.0.2.2:8000` automatically)
  - `DEEPLINK_BASE_URL`: `http://localhost:19006` (Expo web dev server) or your ngrok URL
  - `QR_BASE_URL`: same as `DEEPLINK_BASE_URL`
- Staging:
  - `EXPO_PUBLIC_API_URL`: your staging backend URL
  - `DEEPLINK_BASE_URL`: your staging web URL
  - `QR_BASE_URL`: staging web URL
- Production:
  - `EXPO_PUBLIC_API_URL`: production backend URL
  - `DEEPLINK_BASE_URL`: production web URL
  - `QR_BASE_URL`: production web URL

Notes:
- Mobile deep links also include the native scheme from `app.json` (`expo.scheme`).
- Web builds additionally read `process.env` values if defined at build time (`webpack.config.js` injects them).

App Check (Web)
- Disabled by default. To enable, set `EXPO_PUBLIC_ENABLE_APP_CHECK=true` and provide `EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY` in `app.json > expo > extra` or build env.

## Deployment

### Web Version
The web version is deployed on Vercel. The build configuration is located in `config/vercel.json`.

### Mobile Version
The iOS app is built using EAS Build:
```bash
eas build --platform ios --profile production
``` 

## Observability (Sentry + Structured Logs)

Frontend (Expo/React Native)
- Set `EXPO_PUBLIC_SENTRY_DSN` and optional `SENTRY_ENV` in `app.json > expo > extra` or via runtime env for web builds.
- Navigation and API breadcrumbs are captured automatically.
- User context (uid, family_id) is attached after login.

Backend (FastAPI)
- Environment variables:
  - `SENTRY_DSN`: your Sentry DSN (optional)
  - `SENTRY_ENV`: environment name (default: development)
  - `LOG_LEVEL`: DEBUG|INFO|WARNING|ERROR (default: INFO)
  - `CORS_ORIGINS`: comma-separated list of allowed origins for CORS (prod/staging). Localhost defaults are always allowed for dev.
  - `OPENAI_API_KEY` (optional): if not provided, AI endpoints degrade gracefully with friendly messages.
- Logs are structured with `request_id`, `user_id`, and `family_id` using a logging filter and contextvars.
- Rate-limit hits and auth failures are logged with correlation ids.

Verification
- FE: provoke an API 500 or throw an error. Confirm event appears in Sentry with breadcrumbs.
- BE: call a protected route without a token (401) or hit the family validate endpoint repeatedly to trigger rate limit. Confirm log lines have `request_id` and Sentry event exists when DSN is set.

## Production Smoke Tests

Run the public production smoke test after deploys:

```bash
npm run smoke:prod
```

By default this checks:
- backend `/health`, `/ready`, and `/version`
- frontend HTML export availability
- public invite-code rejection
- protected API auth guardrails

Set a smoke admin account to exercise the full product loop against production:

```bash
SMOKE_ADMIN_EMAIL="admin@example.com" \
SMOKE_ADMIN_PASSWORD="..." \
npm run smoke:prod
```

The authenticated smoke creates and cleans up temporary records for:
- family invite creation/listing/public resolution
- trip creation/listing
- AI activity suggestions
- activity creation, voting, booking, and trip activity listing
- budget summary
- reward creation/listing/update/redemptions/delete

Optional invite-acceptance check:

```bash
SMOKE_MEMBER_EMAIL="fresh-member@example.com" \
SMOKE_MEMBER_PASSWORD="..." \
SMOKE_MEMBER_IS_UNREGISTERED=true \
npm run smoke:prod
```

Use a disposable member account with no existing app profile for invite acceptance. Existing member profiles are intentionally skipped so the smoke test does not mutate a real user into another family.

## Environment Variables Reference

| Scope | Variable | Description | Required | Example |
|---|---|---|---|---|
| Backend | `LOG_LEVEL` | Logging level | No | `INFO` |
| Backend | `SENTRY_DSN` | Sentry DSN | No | `https://...` |
| Backend | `SENTRY_ENV` | Sentry environment | No | `production` |
| Backend | `CORS_ORIGINS` | Allowed CORS origins (comma-separated) | No | `https://app.example.com,https://admin.example.com` |
| Backend | `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase service account JSON string | Yes (prod) | `{...}` |
| Backend | `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Yes (when using storage) | `my-app.appspot.com` |
| Backend | `OPENAI_API_KEY` | Enables AI features | No | `sk-...` |
| Frontend | `EXPO_PUBLIC_API_URL` | Backend base URL | Yes | `https://api.example.com` |
| Frontend | `DEEPLINK_BASE_URL` | Public deeplink base | Yes (web) | `https://app.example.com` |
| Frontend | `QR_BASE_URL` | Base in QR codes | No | `https://app.example.com` |
| Frontend | `EXPO_PUBLIC_SENTRY_DSN` | Frontend Sentry DSN | No | `https://...` |
| Frontend | `SENTRY_ENV` | Frontend Sentry environment | No | `production` |
| Frontend | `EXPO_PUBLIC_FIREBASE_*` | Firebase web config keys | Yes | see app.config.example.json |

Notes:
- Changing domains only requires updating `EXPO_PUBLIC_API_URL` (frontend) and `CORS_ORIGINS` (backend). No code changes.
- Health endpoints are exposed at `/`, `/health`, and `/ready`. Use `/ready` for deeper Firebase/Firestore readiness checks.
