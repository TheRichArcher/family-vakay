from unittest.mock import patch, AsyncMock


def test_get_trips_requires_auth(client, as_anonymous):
    response = client.get('/api/v1/trips/')
    # trips router checks for uid; anonymous fixture sets empty dict → 401
    assert response.status_code == 401


@patch('app.services.trips_service.TripsService.get_trips_for_user', new_callable=AsyncMock)
def test_get_trips_happy_path(mock_get_trips, client, as_user):
    mock_get_trips.return_value = []
    response = client.get('/api/v1/trips/')
    assert response.status_code == 200
    assert response.json() == []


@patch('app.services.trips_service.TripsService.get_trip_by_code', new_callable=AsyncMock)
def test_get_trip_by_code_found(mock_get_by_code, client, as_user):
    mock_get_by_code.return_value = {
        'id': 't1', 'name': 'Trip', 'description': '', 'startDate': '2024-01-01', 'endDate': '2024-01-02',
        'location': '', 'status': 'upcoming', 'participants': [], 'ownerId': 'user-1'
    }
    response = client.get('/api/v1/trips/by-code/ABC')
    assert response.status_code == 200
    assert response.json()['id'] == 't1'


@patch('app.services.trips_service.TripsService.get_trip_by_code', new_callable=AsyncMock)
def test_get_trip_by_code_not_found(mock_get_by_code, client, as_user):
    mock_get_by_code.side_effect = ValueError('Trip not found')
    response = client.get('/api/v1/trips/by-code/NOPE')
    assert response.status_code == 404


@patch('app.services.trips_service.TripsService.get_trips_for_family', new_callable=AsyncMock)
def test_get_family_trips_authorized(mock_get_family, client, as_user):
    mock_get_family.return_value = []
    # as_user has familyId=fam-1 and is accessing the same family
    response = client.get('/api/v1/trips/family/fam-1')
    assert response.status_code == 200


def test_get_family_trips_forbidden_for_other_family(client, as_user):
    response = client.get('/api/v1/trips/family/other-family')
    assert response.status_code == 403


