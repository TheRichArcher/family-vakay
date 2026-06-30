import pytest
from fastapi.testclient import TestClient
from main import app
from app.auth import get_current_user
import types


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def as_user():
    """Override dependency to act as a normal member user with a profile."""
    user = {"uid": "user-1", "role": "member", "profile": {"familyId": "fam-1"}}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture()
def as_admin():
    """Override dependency to act as an admin user."""
    user = {"uid": "admin-1", "role": "admin", "profile": {"familyId": "fam-1"}}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture()
def as_anonymous():
    """Override dependency to simulate missing uid, triggering 401 in routes."""
    user = {}
    app.dependency_overrides[get_current_user] = lambda: user
    yield user
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture(autouse=True)
def stub_async_firestore(monkeypatch):
    """Avoid hitting real Firebase in service constructors during tests."""
    class _DummyCollection:
        def document(self, *_args, **_kwargs):
            return self
        def get(self, *_args, **_kwargs):
            return types.SimpleNamespace(exists=False, to_dict=lambda: {}, id='doc')
        def where(self, *args, **kwargs):
            return self
        def stream(self):
            async def _aiter():
                if False:
                    yield None
            return _aiter()
        def add(self, *_args, **_kwargs):
            async def _add():
                return None, types.SimpleNamespace(id='new')
            return _add()
        def update(self, *_args, **_kwargs):
            async def _update():
                return None
            return _update()

    class _DummyDB:
        def collection(self, *_args, **_kwargs):
            return _DummyCollection()

    dummy_db = _DummyDB()
    monkeypatch.setattr('app.firebase_admin.get_async_firestore_client', lambda: dummy_db)
    # Also patch the symbol as imported in services module
    monkeypatch.setattr('app.services.trips_service.get_async_firestore_client', lambda: dummy_db)

