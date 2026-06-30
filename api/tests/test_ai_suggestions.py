import asyncio
import json

from app import schemas
from app.services.ai_prompts import construct_activity_suggestion_prompt
from app.services.ai_service import AIService


def test_activity_suggestion_prompt_uses_full_trip_context():
    prompt = construct_activity_suggestion_prompt(
        "Cape Cod",
        "Based on the following interests: Foodie, Tourist",
        10,
        {
            "trip": {
                "name": "Summer Trip",
                "startDate": "2026-07-01",
                "endDate": "2026-07-05",
                "budget": 1200,
            },
            "participants": [{"name": "Kid One", "age": 10}],
            "existingActivities": [{"name": "Beach Day"}],
        },
    )

    assert "Cape Cod" in prompt
    assert "Foodie, Tourist" in prompt
    assert "2026-07-01" in prompt
    assert "1200" in prompt
    assert "Beach Day" in prompt
    assert '"suggestions"' in prompt
    assert "Do not duplicate existing saved activities" in prompt
    assert "Cruise/itinerary rules" in prompt


def test_suggest_activity_returns_normalized_structured_suggestions(monkeypatch):
    captured = {}

    class FakeTripsService:
        async def get_trip_by_id(self, trip_id, current_user):
            return schemas.Trip(
                id=trip_id,
                name="Beach Weekend",
                description="Family beach trip",
                startDate="2026-07-01",
                endDate="2026-07-04",
                location="Cape Cod",
                status="upcoming",
                participants=["adult-1", "kid-1"],
                ownerId="adult-1",
                budget=900,
            )

    class FakeActivitiesService:
        async def get_activities_for_trip(self, trip_id, current_user):
            return [
                {
                    "name": "Beach Day",
                    "description": "Morning at the beach",
                    "date": "2026-07-02",
                    "activityTypes": ["Relaxed"],
                    "budget": 0,
                }
            ]

    class FakeUserService:
        async def get_user_profile(self, user_id):
            return {"uid": user_id, "age": 42}

        async def get_users_by_ids(self, user_ids):
            return [
                {"uid": "adult-1", "name": "Adult", "role": "admin", "age": 42, "isKid": False},
                {"uid": "kid-1", "name": "Kid", "role": "kid", "age": 10, "isKid": True},
            ]

    class FakeMessage:
        content = json.dumps(
            {
                "suggestions": [
                    {
                        "title": "Harbor snack crawl",
                        "category": "Food",
                        "why": "It fits Cape Cod, the family ages, and does not repeat Beach Day.",
                        "kidFit": "Best for ages 10+",
                        "costLevel": "$$",
                        "timeNeeded": "1-2 hours",
                    }
                ]
            }
        )

    class FakeChoice:
        message = FakeMessage()

    class FakeResponse:
        choices = [FakeChoice()]

    class FakeCompletions:
        @staticmethod
        def create(**kwargs):
            captured.update(kwargs)
            return FakeResponse()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr("app.services.ai_service.TripsService", FakeTripsService)
    monkeypatch.setattr("app.services.ai_service.ActivitiesService", FakeActivitiesService)
    monkeypatch.setattr("app.services.ai_service.UserService", FakeUserService)

    service = AIService()
    service.client = FakeClient()

    result = asyncio.run(
        service.suggest_activity(
            "trip-1",
            "Based on the following interests: Foodie",
            {"uid": "adult-1", "role": "admin"},
        )
    )

    suggestions = result["suggestions"]
    assert suggestions[0]["title"] == "Harbor snack crawl"
    assert suggestions[0]["costLevel"] == "$$"
    assert json.loads(result["text"])[0]["kidFit"] == "Best for ages 10+"
    assert captured["response_format"] == {"type": "json_object"}
    prompt = captured["messages"][0]["content"]
    assert "Beach Weekend" in prompt
    assert "Beach Day" in prompt
    assert "Kid" in prompt


def test_suggest_activity_returns_structured_fallback_when_openai_is_off(monkeypatch):
    class FakeTripsService:
        async def get_trip_by_id(self, trip_id, current_user):
            return schemas.Trip(
                id=trip_id,
                name="Beach Weekend",
                description="Family beach trip",
                startDate="2026-07-01",
                endDate="2026-07-04",
                location="Cape Cod",
                status="upcoming",
                participants=["adult-1", "kid-1"],
                ownerId="adult-1",
                budget=900,
            )

    class FakeActivitiesService:
        async def get_activities_for_trip(self, trip_id, current_user):
            return [{"name": "Beach Day", "description": "Morning at the beach"}]

    class FakeUserService:
        async def get_user_profile(self, user_id):
            return {"uid": user_id, "age": 42}

        async def get_users_by_ids(self, user_ids):
            return [{"uid": "kid-1", "name": "Kid", "role": "kid", "age": 10, "isKid": True}]

    monkeypatch.setattr("app.services.ai_service.TripsService", FakeTripsService)
    monkeypatch.setattr("app.services.ai_service.ActivitiesService", FakeActivitiesService)
    monkeypatch.setattr("app.services.ai_service.UserService", FakeUserService)

    service = AIService()
    service.client = None

    result = asyncio.run(
        service.suggest_activity(
            "trip-1",
            "Based on the following interests: Foodie",
            {"uid": "adult-1", "role": "admin"},
        )
    )

    suggestions = result["suggestions"]
    assert len(suggestions) > 0
    assert suggestions[0]["title"] == "Family food crawl in Cape Cod"
    assert suggestions[0]["category"] == "Dining"
    assert json.loads(result["text"])[0]["title"] == "Family food crawl in Cape Cod"


def test_suggest_activity_uses_selected_cruise_stop(monkeypatch):
    captured = {}

    class FakeTripsService:
        async def get_trip_by_id(self, trip_id, current_user):
            return schemas.Trip(
                id=trip_id,
                name="Bahamas Cruise",
                description="Family cruise",
                startDate="2026-07-01",
                endDate="2026-07-07",
                location="Bahamas",
                status="upcoming",
                participants=["adult-1", "kid-1"],
                ownerId="adult-1",
                tripType="cruise",
                itinerary=[
                    {
                        "id": "stop-sea",
                        "date": "2026-07-02",
                        "type": "sea",
                        "portName": "At Sea",
                    },
                    {
                        "id": "stop-nassau",
                        "date": "2026-07-03",
                        "type": "port",
                        "portName": "Nassau",
                        "arrivalTime": "08:00",
                        "departureTime": "17:00",
                    },
                ],
            )

    class FakeActivitiesService:
        async def get_activities_for_trip(self, trip_id, current_user):
            return []

    class FakeUserService:
        async def get_user_profile(self, user_id):
            return {"uid": user_id, "age": 42}

        async def get_users_by_ids(self, user_ids):
            return [{"uid": "kid-1", "name": "Kid", "role": "kid", "age": 10, "isKid": True}]

    class FakeMessage:
        content = json.dumps(
            {
                "suggestions": [
                    {
                        "title": "Nassau port snack walk",
                        "category": "Food",
                        "why": "Fits the port window.",
                        "kidFit": "Best for ages 10+",
                        "costLevel": "$$",
                        "timeNeeded": "1-2 hours",
                    }
                ]
            }
        )

    class FakeChoice:
        message = FakeMessage()

    class FakeResponse:
        choices = [FakeChoice()]

    class FakeCompletions:
        @staticmethod
        def create(**kwargs):
            captured.update(kwargs)
            return FakeResponse()

    class FakeChat:
        completions = FakeCompletions()

    class FakeClient:
        chat = FakeChat()

    monkeypatch.setattr("app.services.ai_service.TripsService", FakeTripsService)
    monkeypatch.setattr("app.services.ai_service.ActivitiesService", FakeActivitiesService)
    monkeypatch.setattr("app.services.ai_service.UserService", FakeUserService)

    service = AIService()
    service.client = FakeClient()

    result = asyncio.run(
        service.suggest_activity(
            "trip-1",
            "Based on the following interests: Foodie",
            {"uid": "adult-1", "role": "admin"},
            "stop-nassau",
        )
    )

    suggestion = result["suggestions"][0]
    assert suggestion["itineraryStopId"] == "stop-nassau"
    assert suggestion["itineraryDate"] == "2026-07-03"
    assert suggestion["portName"] == "Nassau"
    prompt = captured["messages"][0]["content"]
    assert "Nassau on 2026-07-03" in prompt
    assert "selectedItineraryStop" in prompt
    assert "08:00" in prompt
