import os
import sys
import asyncio
import json
import google.auth
from google.cloud import firestore

# Add API package root to the Python path for absolute imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

def initialize_firebase_admin_for_script():
    """
    Initializes the Firebase Admin SDK for a script, trying multiple
    credential strategies.
    """
    if 'FIREBASE_SERVICE_ACCOUNT_JSON' in os.environ:
        print("Authenticating with FIREBASE_SERVICE_ACCOUNT_JSON...")
        service_account_info = json.loads(os.environ['FIREBASE_SERVICE_ACCOUNT_JSON'])
        credentials = google.auth.credentials.Credentials.from_service_account_info(service_account_info)
        project_id = service_account_info['project_id']
        return firestore.AsyncClient(project=project_id, credentials=credentials)

    try:
        print("Authenticating with Google Application Default Credentials...")
        credentials, project_id = google.auth.default()
        if not project_id and 'GOOGLE_APPLICATION_CREDENTIALS' in os.environ:
            with open(os.environ['GOOGLE_APPLICATION_CREDENTIALS'], 'r') as f:
                sa_info = json.load(f)
                project_id = sa_info.get('project_id')
        if not project_id:
            print("ERROR: Could not determine Google Cloud project ID.")
            sys.exit(1)
        return firestore.AsyncClient(project=project_id, credentials=credentials)
    except google.auth.exceptions.DefaultCredentialsError:
        print("ERROR: Please run 'gcloud auth application-default login'.")
        sys.exit(1)

async def repair_corrupted_challenges():
    """
    Scans all activities and robustly repairs challenges that are missing the 'text' field
    but have a 'completions' field, which indicates the data corruption bug.
    """
    print("Starting robust data repair for corrupted scavenger hunt challenges...")
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
        
        if not isinstance(challenges, list) or not challenges:
            continue
            
        needs_update = False
        
        for i, challenge in enumerate(challenges):
            # A challenge is corrupt if it's a dictionary but the 'text' field is missing.
            # The presence of 'completions' or 'pointsAwarded' is a strong indicator of this specific bug.
            if isinstance(challenge, dict) and not challenge.get('text'):
                print(f"  [REPAIR] Found corrupted challenge at index {i} in activity {activity_id}.")
                challenge['text'] = "Restored: Photo Challenge"
                challenge.setdefault('completed', False)
                challenge.setdefault('status', 'pending')
                needs_update = True
        
        if needs_update:
            try:
                await activities_collection.document(activity_id).update({'challenges': challenges})
                print(f"  [SUCCESS] Wrote repaired challenges to activity {activity_id}")
                updated_count += 1
            except Exception as e:
                print(f"  [FAILURE] Could not update activity {activity_id}: {e}")

    print(f"\nScan complete.")
    print(f"Processed {processed_count} activities.")
    if updated_count > 0:
        print(f"Repaired {updated_count} corrupted activities.")
    else:
        print("No corrupted activities found needing repair.")

if __name__ == "__main__":
    asyncio.run(repair_corrupted_challenges()) 