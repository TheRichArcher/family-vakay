from datetime import date, timedelta
import asyncio
from types import SimpleNamespace

from app.services.trips_service import TripsService, _get_trip_status
from app.schemas import TripCreate, TripStatus, TripUpdate


def test_get_trip_status_completed():
    today = date.today()
    assert _get_trip_status(today - timedelta(days=5), today - timedelta(days=1), TripStatus.UPCOMING) == TripStatus.COMPLETED


def test_get_trip_status_in_progress():
    today = date.today()
    assert _get_trip_status(today - timedelta(days=1), today + timedelta(days=1), TripStatus.UPCOMING) == TripStatus.IN_PROGRESS


def test_get_trip_status_upcoming():
    today = date.today()
    assert _get_trip_status(today + timedelta(days=1), today + timedelta(days=5), TripStatus.UPCOMING) == TripStatus.UPCOMING


def test_get_trip_status_cancelled_stays_cancelled():
    today = date.today()
    assert _get_trip_status(today - timedelta(days=10), today - timedelta(days=5), TripStatus.CANCELLED) == TripStatus.CANCELLED


def test_create_trip_uses_firestore_add_document_reference(monkeypatch):
    created_data = {}
    profile_updates = []

    class FakeSnapshot:
        exists = True
        id = "trip-1"

        def to_dict(self):
            return {
                **created_data,
                "id": "trip-1",
            }

    class FakeDocumentRef:
        id = "trip-1"

        async def get(self):
            return FakeSnapshot()

    class FakeTripsCollection:
        async def add(self, data):
            created_data.update(data)
            return SimpleNamespace(seconds=1), FakeDocumentRef()

    class FakeDB:
        def collection(self, name):
            assert name == "trips"
            return FakeTripsCollection()

    class FakeUserService:
        async def get_user_profile(self, user_id):
            assert user_id == "member-1"
            return {"uid": user_id, "familyId": "fam-1", "role": "member"}

        async def update_user_profile(self, user_id, data):
            profile_updates.append((user_id, data))

    monkeypatch.setattr("app.services.trips_service.get_async_firestore_client", lambda: FakeDB())
    monkeypatch.setattr("app.services.trips_service.UserService", lambda: FakeUserService())

    trip = asyncio.run(
        TripsService().create_trip(
            TripCreate(
                name="Beach",
                description="Summer trip",
                startDate="2026-07-01",
                endDate="2026-07-05",
                location="Cape Cod",
                participants=["kid-1"],
                budget=2500,
                coverImageUrl="trip_cover_images/member-1/file.jpg",
                coverImageThumbnailUrl="trip_cover_images/member-1/file_thumb.jpg",
                coverImageResizedUrl="trip_cover_images/member-1/file_resized.jpg",
            ),
            {"uid": "member-1", "role": "member"},
        )
    )

    assert trip.id == "trip-1"
    assert created_data["ownerId"] == "member-1"
    assert set(created_data["participants"]) == {"member-1", "kid-1"}
    assert created_data["budget"] == 2500
    assert created_data["coverImageUrl"] == "trip_cover_images/member-1/file.jpg"
    assert created_data["coverImageThumbnailUrl"] == "trip_cover_images/member-1/file_thumb.jpg"
    assert created_data["coverImageResizedUrl"] == "trip_cover_images/member-1/file_resized.jpg"
    assert created_data["status"] == "upcoming"
    assert {user_id for user_id, _data in profile_updates} == {"member-1", "kid-1"}


def test_create_trip_still_returns_when_participant_profile_update_fails(monkeypatch):
    created_data = {}

    class FakeSnapshot:
        exists = True
        id = "trip-1"

        def to_dict(self):
            return {
                **created_data,
                "id": "trip-1",
            }

    class FakeDocumentRef:
        id = "trip-1"

        async def get(self):
            return FakeSnapshot()

    class FakeTripsCollection:
        async def add(self, data):
            created_data.update(data)
            return SimpleNamespace(seconds=1), FakeDocumentRef()

    class FakeDB:
        def collection(self, name):
            assert name == "trips"
            return FakeTripsCollection()

    class FakeUserService:
        async def get_user_profile(self, user_id):
            return {"uid": user_id, "familyId": "fam-1", "role": "member"}

        async def update_user_profile(self, user_id, data):
            raise RuntimeError("profile update failed")

    monkeypatch.setattr("app.services.trips_service.get_async_firestore_client", lambda: FakeDB())
    monkeypatch.setattr("app.services.trips_service.UserService", lambda: FakeUserService())

    trip = asyncio.run(
        TripsService().create_trip(
            TripCreate(
                name="Beach",
                description="Summer trip",
                startDate="2026-07-01",
                endDate="2026-07-05",
                location="Cape Cod",
                participants=["kid-1"],
            ),
            {"uid": "member-1", "role": "member"},
        )
    )

    assert trip.id == "trip-1"
    assert created_data["ownerId"] == "member-1"


def test_create_trip_rejects_kid_accounts():
    trip = TripCreate(
        name="Beach",
        description="Summer trip",
        startDate="2026-07-01",
        endDate="2026-07-05",
        location="Cape Cod",
        participants=["kid-1"],
    )

    try:
        asyncio.run(TripsService().create_trip(trip, {"uid": "kid-1", "role": "kid"}))
    except PermissionError as error:
        assert "Kid accounts cannot create trips" in str(error)
    else:
        raise AssertionError("Expected kid account trip creation to be rejected")


def test_update_trip_writes_camel_case_firestore_fields(monkeypatch):
    update_payload = {}
    stored_trip = {
        "name": "Old Trip",
        "description": "Original",
        "startDate": "2026-07-01",
        "endDate": "2026-07-05",
        "location": "Cape Cod",
        "status": "upcoming",
        "participants": ["member-1"],
        "ownerId": "member-1",
    }

    class FakeSnapshot:
        exists = True
        id = "trip-1"

        def to_dict(self):
            return {**stored_trip, **update_payload}

    class FakeDocumentRef:
        async def get(self):
            return FakeSnapshot()

        async def update(self, data):
            update_payload.update(data)

    class FakeTripsCollection:
        def document(self, trip_id):
            assert trip_id == "trip-1"
            return FakeDocumentRef()

    class FakeDB:
        def collection(self, name):
            assert name == "trips"
            return FakeTripsCollection()

    class FakeUserService:
        async def update_user_profile(self, user_id, data):
            raise AssertionError("No participant profile updates expected")

    monkeypatch.setattr("app.services.trips_service.get_async_firestore_client", lambda: FakeDB())
    monkeypatch.setattr("app.services.trips_service.UserService", lambda: FakeUserService())

    trip = asyncio.run(
        TripsService().update_trip(
            "trip-1",
            TripUpdate(
                name="Updated Trip",
                startDate="2026-08-01",
                endDate="2026-08-06",
            ),
            {"uid": "member-1", "role": "member"},
        )
    )

    assert trip.name == "Updated Trip"
    assert update_payload["startDate"] == "2026-08-01"
    assert update_payload["endDate"] == "2026-08-06"
    assert "updatedAt" in update_payload
    assert "start_date" not in update_payload
    assert "end_date" not in update_payload
    assert "updated_at" not in update_payload
