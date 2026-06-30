import os
import sys
import asyncio
import json
import google.auth
from google.cloud import firestore
from pydantic import ValidationError

# Add API package root to the Python path so we can import `app.schemas`
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from app.schemas import Activity as ActivitySchema

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
        return firestore.AsyncClient(project=project_id, credentials=credentials)
    except google.auth.exceptions.DefaultCredentialsError:
        print("ERROR: Google Application Default Credentials are not configured.")
        print("Please run 'gcloud auth application-default login' in your terminal.")
        sys.exit(1)


async def cleanup_invalid_challenges(trip_id, project_id):
    """
    Scans all activities for a given trip and rewrites them to fix any
    validation errors, particularly with the challenges field.
    """
    print(f"Starting cleanup for trip: {trip_id} in project: {project_id}")
    db = initialize_firebase_admin_for_script()
    activities_collection = db.collection('activities')
    
    query = activities_collection.where('tripId', '==', trip_id)
    activities_stream = query.stream()
    
    updated_count = 0
    processed_count = 0
    
    async for activity_doc in activities_stream:
        processed_count += 1
        activity_data = activity_doc.to_dict()
        activity_id = activity_doc.id
        
        # Add the document ID to the data, as this is required by the schema
        activity_data['id'] = activity_id

        try:
            # Attempt to validate the activity as is
            ActivitySchema.model_validate(activity_data)
        except ValidationError:
            # If validation fails for any reason, assume the challenges are the problem
            # and attempt a targeted, forceful fix.
            print(f"Found invalid activity {activity_id}. Forcing a fix by resetting challenges.")
            
            try:
                # The most common issue is a malformed challenges list. Reset it.
                await activities_collection.document(activity_id).update({'challenges': []})
                print(f"  - Update operation completed for activity {activity_id}.")

                # Verify the write operation
                print(f"  - Verifying the update...")
                updated_doc = await activities_collection.document(activity_id).get()
                if updated_doc.exists:
                    updated_data = updated_doc.to_dict()
                    if updated_data.get('challenges') == []:
                        print(f"  - SUCCESS: Verified that challenges field is now an empty list for {activity_id}.")
                        updated_count += 1
                    else:
                        print(f"  - FAILURE: Verification failed. Challenges field is: {updated_data.get('challenges')}")
                else:
                    print(f"  - FAILURE: Document {activity_id} no longer exists after update.")

            except Exception as e:
                print(f"Failed to reset challenges for {activity_id}: {e}")

    print(f"\nProcessed {processed_count} activities.")
    if updated_count == 0:
        print("No activities needed cleaning.")
    else:
        print(f"Cleanup complete. Updated {updated_count} activities.")

if __name__ == "__main__":
    # The trip ID from the logs provided by the user.
    TRIP_ID = "Y4axbsssyjRawdeCUOew"
    PROJECT_ID = "familyvk-b1cce"
    
    # Run the cleanup function
    asyncio.run(cleanup_invalid_challenges(TRIP_ID, PROJECT_ID)) 