from datetime import datetime
from unittest.mock import AsyncMock, Mock

from main import app
from app.routers.rewards import RewardsService

from app import schemas


def _reward(**overrides):
    data = {
        "id": "reward-1",
        "familyId": "fam-1",
        "title": "Ice cream",
        "description": "One treat",
        "pointsCost": 25,
        "icon": "ice-cream-outline",
        "isActive": True,
        "isRedeemed": False,
        "createdAt": datetime.utcnow(),
    }
    data.update(overrides)
    return schemas.Reward(**data)


def _redemption(**overrides):
    data = {
        "id": "redeem-1",
        "familyId": "fam-1",
        "rewardId": "reward-1",
        "rewardTitle": "Ice cream",
        "rewardDescription": "One treat",
        "pointsCost": 25,
        "kidId": "kid-1",
        "kidName": "Kid A",
        "status": "requested",
        "requestedAt": datetime.utcnow(),
    }
    data.update(overrides)
    return schemas.RewardRedemption(**data)


def test_get_rewards_uses_profile_family_id(client, as_admin):
    fake_service = type("FakeRewardsService", (), {})()
    fake_service.get_rewards_for_family = AsyncMock(return_value=[_reward()])
    app.dependency_overrides[RewardsService] = lambda: fake_service

    try:
        response = client.get("/api/v1/rewards")
    finally:
        app.dependency_overrides.pop(RewardsService, None)

    assert response.status_code == 200
    assert response.json()[0]["id"] == "reward-1"
    fake_service.get_rewards_for_family.assert_awaited_once_with("fam-1")


def test_kid_can_request_reward(client):
    from app.auth import get_current_user

    fake_service = type("FakeRewardsService", (), {})()
    fake_service.request_redemption = AsyncMock(return_value=_redemption())
    app.dependency_overrides[RewardsService] = lambda: fake_service
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "kid-1",
        "role": "kid",
        "family_id": "fam-1",
        "points": 50,
    }
    try:
        response = client.post("/api/v1/rewards/reward-1/redeem")
    finally:
        app.dependency_overrides.pop(RewardsService, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "requested"
    assert payload["rewardTitle"] == "Ice cream"
    fake_service.request_redemption.assert_awaited_once_with("reward-1", "kid-1")


def test_admin_can_approve_redemption(client, as_admin):
    fake_service = type("FakeRewardsService", (), {})()
    fake_service.update_redemption_status = Mock(return_value=_redemption(status="approved", approvedBy="admin-1"))
    app.dependency_overrides[RewardsService] = lambda: fake_service

    try:
        response = client.put("/api/v1/rewards/redemptions/redeem-1", json={"status": "approved"})
    finally:
        app.dependency_overrides.pop(RewardsService, None)

    assert response.status_code == 200
    assert response.json()["status"] == "approved"
    args = fake_service.update_redemption_status.call_args.args
    assert args[0] == "redeem-1"
    assert args[1].status == schemas.RewardRedemptionStatus.APPROVED
    assert args[2] == "admin-1"
    assert args[3] == "fam-1"


def test_kid_cannot_update_redemption(client):
    from app.auth import get_current_user

    fake_service = type("FakeRewardsService", (), {})()
    fake_service.update_redemption_status = Mock()
    app.dependency_overrides[RewardsService] = lambda: fake_service
    app.dependency_overrides[get_current_user] = lambda: {
        "uid": "kid-1",
        "role": "kid",
        "family_id": "fam-1",
    }
    try:
        response = client.put("/api/v1/rewards/redemptions/redeem-1", json={"status": "approved"})
    finally:
        app.dependency_overrides.pop(RewardsService, None)
        app.dependency_overrides.pop(get_current_user, None)

    assert response.status_code == 403
