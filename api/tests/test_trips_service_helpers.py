from datetime import date, timedelta

from app.services.trips_service import _get_trip_status
from app.schemas import TripStatus


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


