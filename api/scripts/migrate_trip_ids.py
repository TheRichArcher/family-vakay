import asyncio
import os
import sys
import logging

# Add the API package root to the Python path to allow for absolute imports
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from google.cloud.firestore import ArrayUnion
from app.firebase_admin import initialize_firebase_admin, get_async_firestore_client

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

async def main():
    """
    Migrates trip participant data to a denormalized trip_ids field on user profiles.
    This script is idempotent and can be run multiple times.
    """
    try:
        initialize_firebase_admin()
    except (ValueError, ConnectionError) as e:
        logging.critical(f"Failed to initialize Firebase: {e}")
        return

    db = get_async_firestore_client()
    trips_collection = db.collection('trips')
    users_collection = db.collection('users')
    
    logging.info("Starting migration: Populating trip_ids on user profiles...")
    
    processed_count = 0
    try:
        async for trip in trips_collection.stream():
            trip_id = trip.id
            trip_data = trip.to_dict()
            participants = trip_data.get('participants', [])
            
            if not participants:
                logging.info(f"Trip {trip_id} has no participants. Skipping.")
                continue
                
            logging.info(f"Processing Trip ID: {trip_id} with {len(participants)} participants...")
            
            tasks = []
            for user_id in participants:
                user_ref = users_collection.document(user_id)
                task = user_ref.update({'trip_ids': ArrayUnion([trip_id])})
                tasks.append(task)
            
            try:
                await asyncio.gather(*tasks)
                logging.info(f"  - Successfully processed {len(tasks)} participants for trip {trip_id}.")
                processed_count += 1
            except Exception as e:
                logging.error(f"  - FAILED to process participants for trip {trip_id}. Reason: {e}")

    except Exception as e:
        logging.critical(f"An unexpected error occurred during migration: {e}", exc_info=True)
        return

    logging.info(f"Migration completed. Processed {processed_count} trips successfully.")

if __name__ == "__main__":
    # Ensure GOOGLE_APPLICATION_CREDENTIALS is set if running locally without a serviceAccountKey.json file in the root.
    # The `initialize_firebase_admin` function handles the credential logic.
    asyncio.run(main()) 