import os
import sys
import asyncio
import json
import google.auth
from google.cloud import firestore

# Add project root to the Python path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..')))

def initialize_firebase_admin_for_script():
    """
    Initializes the Firebase Admin SDK for a script, trying multiple
    credential strategies.
    """
    # Strategy 1: Use the environment variable for Render/production
    if 'FIREBASE_SERVICE_ACCOUNT_JSON' in os.environ:
        print("Authenticating with FIREBASE_SERVICE_ACCOUNT_JSON...")
        service_account_info = json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_JSON'])
        credentials = google.auth.credentials.Credentials.from_service_account_info(service_account_info)
        project_id = service_account_info['project_id']
        return firestore.AsyncClient(project=project_id, credentials=credentials)

    # Strategy 2: Use Google Application Default Credentials for local dev
    try:
        print("Authenticating with Google Application Default Credentials...")
        credentials, project_id = google.auth.default()
        if not project_id:
             # If project_id is not found, try to get it from the service account JSON if it exists
            if 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
                with open(os.environ['GOOGLE_APPLICATION_CREDENTIALS'], 'r') as f:
                    sa_info = json.load(f)
                    project_id = sa_info.get('project_id')
        if not project_id:
            print("ERROR: Could not determine Google Cloud project ID.")
            print("Please set the GOOGLE_CLOUD_PROJECT environment variable or run 'gcloud config set project YOUR_PROJECT_ID'")
            sys.exit(1)
            
        return firestore.AsyncClient(project=project_id, credentials=credentials)
    except google.auth.exceptions.DefaultCredentialsError:
        print("ERROR: Google Application Default Credentials are not configured.")
        print("Please run 'gcloud auth application-default login' in your terminal.")
        sys.exit(1)


async def repair_missing_challenge_text():
    """
    Scans all activities and repairs challenges that are missing the 'text' field.
    """
    print("Starting data repair script for scavenger hunt challenges...")
    db = initialize_firebase_admin_for_script()
    activities_collection = db.collection('activities')
    
    activities_stream = activities_collection.stream()
    
    updated_count = 0
    processed_count = 0
    
    async for activity_doc in activities_stream:
        processed_count += 1
        activity_data = activity_doc.to_dict()
        activity_id = activity_doc.id
        
        challenges = activity_data.get('challenges')
        
        # Skip if challenges is not a list or is empty
        if not isinstance(challenges, list) or not challenges:
            continue
            
        needs_update = False
        repaired_challenges = []

        for i, c in enumerate(challenges):
            # The bug causes the challenge to be a dict that has 'completions' but not 'text'.
            if isinstance(c, dict) and 'text' not in c and 'completions' in c:
                c['text'] = "Restored: Photo challenge"
                c['age_group'] = c.get('age_group', 'all')
                c['promptType'] = c.get('promptType', 'photo')
                needs_update = True
                print(f"  [REPAIR] Fixing challenge {i} in activity {activity_id}")
            
            repaired_challenges.append(c)

        if needs_update:
            try:
                await activities_collection.document(activity_id).update({'challenges': repaired_challenges})
                print(f"  [SUCCESS] Wrote updated challenges to activity {activity_id}")
                updated_count += 1
            except Exception as e:
                print(f"  [FAILURE] Could not update activity {activity_id}: {e}")

    print(f"\nScan complete.")
    print(f"Processed {processed_count} activities.")
    if updated_count > 0:
        print(f"Repaired {updated_count} activities.")
    else:
        print("No corrupted activities found needing repair.")

if __name__ == "__main__":
    # This script should be run with care in a production environment.
    # It's recommended to take a backup before running.
    # Example: python -m backend.scripts.repair_missing_challenge_text
    asyncio.run(repair_missing_challenge_text()) 