import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import TripsScreen from '../screens/TripsScreen';

// Mock navigation
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native');
  const React = require('react');
  return {
    ...actual,
    useNavigation: () => ({ navigate: mockNavigate }),
    useFocusEffect: (cb: any) => {
      // run once after mount similar to useEffect([])
      React.useEffect(cb, []);
    },
  };
});

// Mock useAuth to provide a logged-in user
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'user-1', displayName: 'Test User', name: 'Test User', role: 'member' },
    authInitializing: false,
    refreshUser: jest.fn(),
  }),
}));

// Mock tripsService
jest.mock('../services/trips', () => ({
  tripsService: {
    getTrips: jest.fn(async () => [
      { id: 't1', name: 'Trip One', description: '', startDate: '2024-01-01', endDate: '2024-01-02', location: '', status: 'upcoming', participants: [], ownerId: 'user-1' },
    ]),
    getTripByCode: jest.fn(async (code: string) => code === 'GOOD' ? ({ id: 't2', name: 'Joinable Trip', description: '', startDate: '2024-01-01', endDate: '2024-01-02', location: '', status: 'upcoming', participants: [], ownerId: 'someone-else' }) : null),
    updateTrip: jest.fn(async () => ({ id: 't1' })),
  }
}));

describe('TripsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('loads trips and renders list', async () => {
    const { getByText, queryByText } = render(<TripsScreen />);
    await waitFor(() => expect(queryByText('My Trips')).toBeTruthy());
    expect(getByText('New Trip')).toBeTruthy();
    await waitFor(() => expect(getByText('Trip One')).toBeTruthy());
  });

  it('opens the shared create trip screen from the Trips page', async () => {
    const { getByText } = render(<TripsScreen />);

    await waitFor(() => expect(getByText('New Trip')).toBeTruthy());
    fireEvent.press(getByText('New Trip'));

    expect(mockNavigate).toHaveBeenCalledWith('CreateTrip');
  });

  it('allows joining a trip via code', async () => {
    const { getByText, getByPlaceholderText } = render(<TripsScreen />);

    await waitFor(() => expect(getByText('Join a Trip')).toBeTruthy());
    fireEvent.press(getByText('Join a Trip'));

    // Enter code and submit
    const input = getByPlaceholderText('Enter Vacation Code');
    fireEvent.changeText(input, 'GOOD');
    fireEvent.press(getByText('Join'));

    // After successful join, updateTrip should be called
    const { tripsService } = require('../services/trips');
    await waitFor(() => expect(tripsService.updateTrip).toHaveBeenCalled());
  });
});
