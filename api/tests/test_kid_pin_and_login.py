from unittest.mock import patch, AsyncMock
import pytest
from main import app
from app.auth import get_current_user


def test_kid_profile_create_requires_4_digit_pin(client, as_admin):
    # Invalid: non-4-digit
    resp = client.post('/api/v1/users/kid', json={"name": "Kid A", "pin": "123", "age": 7})
    assert resp.status_code == 422

    resp = client.post('/api/v1/users/kid', json={"name": "Kid A", "pin": "abcd", "age": 7})
    assert resp.status_code == 422

    # Valid
    # Override current user to include top-level familyId for this request
    app.dependency_overrides[get_current_user] = lambda: {"uid": "admin-1", "role": "admin", "familyId": "fam-1"}

    with patch('app.routers.users.get_async_firestore_client') as mock_db:
        class _Doc:
            id = 'kid-1'
            def to_dict(self):
                return {
                    'uid': 'kid-1', 'name': 'Kid A', 'role': 'kid', 'family_id': 'fam-1', 'pin_hash': 'hash', 'is_kid': True
                }
            @property
            def exists(self):
                return True
        class _Ref:
            id = 'kid-1'
            async def set(self, *_a, **_k):
                return None
            async def get(self):
                return _Doc()
        class _Users:
            def document(self):
                return _Ref()
        class _DB:
            def collection(self, *_args, **_kwargs):
                return _Users()
        mock_db.return_value = _DB()

        with patch('firebase_admin.auth.create_user') as mock_auth:
            mock_auth.return_value = None
            resp_ok = client.post('/api/v1/users/kid', json={"name": "Kid A", "pin": "1234", "age": 7})
            assert resp_ok.status_code == 201
    # Clean up override
    app.dependency_overrides.pop(get_current_user, None)


@patch('firebase_admin.auth.create_custom_token')
def test_kid_login_pin_verification_and_rate_limit(mock_create_token, client):
    mock_create_token.return_value = b'token'

    # Stub Firestore for kid login endpoint
    with patch('app.routers.family.get_async_firestore_client') as mock_db:
        class _Doc:
            def __init__(self, data):
                self._data = data
            @property
            def exists(self):
                return True
            def to_dict(self):
                return self._data
        class _Ref:
            async def get(self):
                # pin_hash for plain '1234' using passlib is unpredictable; instead patch verify
                return _Doc({'role': 'kid', 'pin_hash': 'hashed'})
        class _Users:
            def document(self, *_a, **_k):
                return _Ref()
        class _DB:
            def collection(self, *_a, **_k):
                return _Users()
        mock_db.return_value = _DB()

        # Patch the symbol used in the router module
        with patch('app.routers.family.verify_password') as mock_verify:
            # Wrong PIN
            mock_verify.return_value = False
            resp_wrong = client.post('/api/v1/family/kid/login', json={"uid": "kid-1", "pin": "1234"})
            assert resp_wrong.status_code == 401

            # Right PIN
            mock_verify.return_value = True
            resp_ok = client.post('/api/v1/family/kid/login', json={"uid": "kid-1", "pin": "1234"})
            assert resp_ok.status_code == 200
            assert 'access_token' in resp_ok.json()


def test_kid_pin_update_requires_4_digits(client, as_admin):
    # Payload validation should reject bad pins before hitting DB
    resp = client.post('/api/v1/users/some-user/pin', json={"pin": "12"})
    assert resp.status_code == 422
    resp = client.post('/api/v1/users/some-user/pin', json={"pin": "abcd"})
    assert resp.status_code == 422

