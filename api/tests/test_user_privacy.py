from unittest.mock import AsyncMock, patch

from main import app
from app.auth import get_current_user, get_current_user_token


SENSITIVE_PROFILE = {
    "uid": "kid-1",
    "email": "kid@example.com",
    "name": "Kid A",
    "role": "kid",
    "family_id": "fam-1",
    "pin_hash": "secret-hash",
    "is_kid": True,
    "age": 8,
    "points": 25,
    "share_code": "SECRET1",
    "trip_ids": ["trip-1"],
}


def test_users_batch_returns_sanitized_member_profiles(client, as_user):
    with patch("app.routers.users.UserService") as mock_service:
        mock_service.return_value.get_users_by_ids = AsyncMock(return_value=[SENSITIVE_PROFILE])

        response = client.post("/api/v1/users/batch", json={"user_ids": ["kid-1"]})

    assert response.status_code == 200
    payload = response.json()[0]
    assert payload["uid"] == "kid-1"
    assert payload["age"] == 8
    assert payload["points"] == 25
    assert "pinHash" not in payload
    assert "pin_hash" not in payload
    assert "email" not in payload
    assert "shareCode" not in payload
    assert "tripIds" not in payload


def test_family_members_returns_sanitized_member_profiles(client):
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "admin-1",
        "role": "admin",
        "family_id": "fam-1",
    }
    try:
        with patch("app.routers.family.UserService") as mock_service:
            from app import schemas

            mock_service.return_value.get_family_members_by_id = AsyncMock(
                return_value=[schemas.UserProfile(**SENSITIVE_PROFILE)]
            )

            response = client.get("/api/v1/family/fam-1/members")
    finally:
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    payload = response.json()[0]
    assert payload["uid"] == "kid-1"
    assert payload["age"] == 8
    assert "pinHash" not in payload
    assert "email" not in payload
    assert "shareCode" not in payload


def test_by_email_requires_admin(client, as_user):
    response = client.get("/api/v1/users/by-email/kid@example.com")

    assert response.status_code == 403


def test_other_user_profile_does_not_expose_pin_hash(client):
    app.dependency_overrides[get_current_user_token] = lambda: {"uid": "user-1"}
    try:
        with patch("app.routers.users.UserService") as mock_service:
            mock_service.return_value.get_user_profile = AsyncMock(side_effect=[
                {
                    "uid": "user-1",
                    "name": "Parent",
                    "role": "member",
                    "family_id": "fam-1",
                    "is_kid": False,
                    "trip_ids": ["trip-1"],
                },
                SENSITIVE_PROFILE,
            ])

            response = client.get("/api/v1/users/kid-1", headers={"Authorization": "Bearer test"})
    finally:
        app.dependency_overrides.pop(get_current_user_token, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["uid"] == "kid-1"
    assert "pinHash" not in payload
    assert "email" not in payload
    assert "shareCode" not in payload
