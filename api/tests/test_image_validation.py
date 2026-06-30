from unittest.mock import patch
from main import app
from app.auth import get_current_user, verify_trip_participant_for_activity as verify_dep


def test_finalize_cover_rejects_oversized_or_invalid_image(client, as_user):
    # Mock storage service methods used by finalize-cover; patch at router import site
    with patch('app.routers.trips.get_storage_service') as get_ss:
        class _SS:
            def validate_uploaded_image(self, file_path, expected_content_type, max_size_bytes):
                # Simulate invalid
                raise ValueError('Invalid image type uploaded.')
            def ensure_download_token(self, file_path):
                return 'tok'
        get_ss.return_value = _SS()

        resp = client.post('/api/v1/trips/finalize-cover', json={'image_path': 'trip_cover_images/u/pic.jpg'})
        # Validation errors should become 400 (bad request)
        assert resp.status_code == 400


def test_add_image_to_activity_rejects_oversized_or_invalid_image(client, as_user):
    # Dependency in activities router uses verify_trip_participant_for_activity which hits Firestore
    # Override user to satisfy dependency with a minimal stub
    app.dependency_overrides[get_current_user] = lambda: {"uid": "user-1", "role": "member", "profile": {"familyId": "fam-1"}}
    with patch('app.routers.activities.get_storage_service') as get_ss:
        class _SS:
            def validate_uploaded_image(self, file_path, expected_content_type, max_size_bytes):
                raise ValueError('File is too large.')
            def ensure_download_token(self, file_path):
                return 'tok'
        get_ss.return_value = _SS()

        # Override the dependency FastAPI uses
        async def _return_trip(activity_id: str, current_user: dict):
            return {"id": "t1"}
        app.dependency_overrides[verify_dep] = _return_trip
        # Patch ActivitiesService used inside the route to avoid Firestore
        with patch('app.routers.activities.ActivitiesService') as MockService:
            instance = MockService.return_value
            instance.add_image_to_gallery.return_value = {"ok": True}
            resp = client.post('/api/v1/activities/act-1/add-image', json={'image_url': 'activity_gallery/t/a/u/p.jpg'})
        # Activities route converts ValueError to 400
        assert resp.status_code == 400
    app.dependency_overrides.pop(get_current_user, None)
    app.dependency_overrides.pop(verify_dep, None)

