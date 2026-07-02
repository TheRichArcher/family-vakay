from datetime import datetime
from unittest.mock import AsyncMock

from main import app
from app.routers import family


def _invite(**overrides):
    data = {
        "id": "invite-1",
        "code": "ABCDEFGH",
        "familyId": "fam-1",
        "role": "member",
        "status": "pending",
        "recipientName": "Co Parent",
        "recipientEmail": "parent@example.com",
        "createdBy": "admin-1",
        "createdAt": datetime.utcnow(),
    }
    data.update(overrides)
    return data


def test_admin_can_create_family_invite(client, as_admin, monkeypatch):
    fake_service = type("FakeUserService", (), {})()
    fake_service.create_family_invite = AsyncMock(return_value=_invite())
    monkeypatch.setattr(family, "UserService", lambda: fake_service)

    response = client.post(
        "/api/v1/family/invites",
        json={"recipientName": "Co Parent", "recipientEmail": "parent@example.com", "role": "member"},
    )

    assert response.status_code == 201
    assert response.json()["code"] == "ABCDEFGH"
    fake_service.create_family_invite.assert_awaited_once()
    kwargs = fake_service.create_family_invite.call_args.kwargs
    assert kwargs["family_id"] == "fam-1"
    assert kwargs["created_by"] == "admin-1"


def test_member_cannot_create_family_invite(client, as_user):
    response = client.post("/api/v1/family/invites", json={"role": "member"})

    assert response.status_code == 403


def test_public_can_resolve_pending_family_invite(client, monkeypatch):
    fake_service = type("FakeUserService", (), {})()
    fake_service.get_family_invite_by_code = AsyncMock(return_value=_invite())
    monkeypatch.setattr(family, "UserService", lambda: fake_service)

    response = client.get("/api/v1/family/invites/by-code/ABCDEFGH")

    assert response.status_code == 200
    assert response.json()["familyId"] == "fam-1"
    assert response.json()["status"] == "pending"


def test_revoked_invite_resolve_returns_gone(client, monkeypatch):
    fake_service = type("FakeUserService", (), {})()
    fake_service.get_family_invite_by_code = AsyncMock(return_value=_invite(status="revoked"))
    monkeypatch.setattr(family, "UserService", lambda: fake_service)

    response = client.get("/api/v1/family/invites/by-code/ABCDEFGH")

    assert response.status_code == 410
