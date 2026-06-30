# Family Vakay Production Audit

Date: 2026-06-29

## Verdict

`/Users/richarcher/Desktop/family-vakay` is now the clean working copy.

As of the latest validation pass, it is ready for Rich to check out locally and ready for web deployment review.

It was promoted from `family-vk-app-new copy 2`, which was the only complete Family Vakay candidate found.

The active Desktop folder at `/Users/richarcher/Desktop/family-vk-app-new copy` and the duplicate folder `family-vk-app-new copy 3` contain directory shells, dependencies, caches, and native/build folders, but no real app source files outside ignored/generated areas. They should not be treated as production candidates.

## Candidate Inventory

- `/Users/richarcher/Desktop/family-vk-app-new copy`
  - Real source/config/test files found: 0
  - Status: decoy/incomplete shell

- `/Users/richarcher/Desktop/_desktop_duplicate_quarantine_20260601_133111/folders/family-vk-app-new copy 2`
  - Real source/config/test files found: 340
  - Includes: React Native/Expo app source, FastAPI backend, Firebase rules/config, tests, CI config, deployment config, assets, iOS/Android project files
  - Status: original complete source candidate, superseded by clean workspace copy

- `/Users/richarcher/Desktop/family-vakay`
  - Real source/config/test files copied from the complete candidate
  - Excludes broken `.git`, `node_modules`, `.expo`, `dist`, `ios/Pods`, `.venv`, `__pycache__`, and pytest caches
  - Status: working source of truth

- `/Users/richarcher/Desktop/_desktop_duplicate_quarantine_20260601_133111/folders/family-vk-app-new copy 3`
  - Real source/config/test files found: 0
  - Status: decoy/incomplete shell

## Production Readiness Assessment

The source tree has the right production ingredients:

- Mobile app source under `src/`
- Expo routing entry under `app/`
- Firebase app config, Firestore rules, Storage rules, and indexes
- Backend API under `api/` with tests
- Jest frontend tests under `src/__tests__/`
- GitHub Actions workflow
- Render/Vercel/Firebase deployment files
- Native iOS and Android project folders
- Brand assets including `assets/family-vakay-logo.png`

The original Desktop/quarantine folders had filesystem materialization problems and broken Git metadata. The workspace copy avoids those generated/corrupt folders and should be used for all future work.

Backend validation is green after dependency hardening:

- Updated `pydantic[email]` from `2.5.2` to `2.13.4` so installs work on current Python.
- Added `bcrypt<5` because `passlib==1.7.4` is not compatible with bcrypt 5 behavior.
- `python3.13 -m pytest -p no:cacheprovider`: 15 passed.

Frontend validation is green under Node 20:

- `package.json` requires Node 20.x.
- Added `.nvmrc` and a validator guard so frontend checks fail early outside Node 20.
- Installed Homebrew `node@20` locally and ran validation with `/opt/homebrew/Cellar/node@20/20.20.2/bin` first in `PATH`.
- `npm test`: 4 suites passed, 10 tests passed.
- `npm run typecheck`: passed.
- `npm run validate`: passed.
- `npm run build:web`: passed and exported the web artifact to `dist/`.
- `npx expo install --check`: passed.

Dependency and security cleanup completed:

- Removed critical/high npm audit findings by upgrading direct dependencies and pruning unused packages.
- Removed unused `sentry-expo`, disabled the no-op monitoring wrapper, and removed the dead Sentry config/plugin.
- Removed unused `expo-dev-client` and `expo-notifications`.
- Removed direct dependencies that Expo Doctor says should be transitive only: `@types/react-native`, `expo-modules-autolinking`, and direct `@expo/metro-config`.
- Switched `metro.config.js` to `expo/metro-config`.
- Added targeted npm overrides for vulnerable transitive packages that validate cleanly under Expo SDK 51.
- Current `npm audit --audit-level=high`: passes.
- Current npm audit floor: 14 moderate findings, all tied to the Expo SDK 51 config/CLI dependency chain. Fully clearing them requires a major Expo SDK migration, not a safe patch.

Firebase and config cleanup completed:

- `.env` is empty.
- Native Firebase service files are present locally but are not tracked by Git.
- Tracked Firebase web config in `app.json` is public client config, not a private secret.
- Firestore rules now scope admin trip access by family, prevent trip owner/family mutation on update, and fix activity creation checks to use `request.resource`.
- Storage rules now enforce auth, image content type, 10MB max image size, and include `trip_cover_images/{userId}/{tripId}/{imageName}`.
- Render frontend build now uses `npm ci && npm run build:web`.

Known remaining risk:

- `npm audit` still reports 14 moderate Expo SDK 51 chain findings. No high or critical advisories remain.
- Jest currently emits React `act(...)` warnings from `TripForm` async state updates, but the suites pass.
- Local native mobile builds are blocked by machine setup: full Xcode is not selected/installed, CocoaPods is missing, Java is missing, and no Android SDK was found.
- Expo Doctor passes 15/17 checks. The remaining two are native tooling and the warning that native `ios/` and `android/` folders mean app config/prebuild fields will not auto-sync.

## PM Decision

Treat this directory as the production candidate. It is ready for product review, local checkout, and web deployment review. Do not claim native iOS/Android build readiness until native tooling is installed or EAS cloud builds are run.

## Required Before Shipping

1. Use `/Users/richarcher/Desktop/family-vakay` as the project root.
2. Recreate remote Git history or connect this clean copy to a new repository.
3. Deploy or emulator-validate Firebase rules with the Firebase CLI.
4. Run native iOS/Android builds on a machine with full Xcode, CocoaPods, Java, and Android SDK, or use EAS cloud builds.
5. Plan an Expo SDK migration to clear the remaining moderate Expo-chain audit findings.

## Recommended Repo Path

Use `/Users/richarcher/Desktop/family-vakay`. Do not use the empty Desktop shell as the working project.
