import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateTripScreen from '../screens/CreateTripScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
    canGoBack: mockCanGoBack,
  }),
}));

// Mock the useAuth hook
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'test-user-id', email: 'test@example.com', familyId: 'fam1' },
  }),
}));

// Mock the tripsService
jest.mock('../services/trips', () => ({
  tripsService: {
    createTrip: jest.fn().mockResolvedValue({ id: 'new-trip-id' }),
    updateTrip: jest.fn().mockResolvedValue({ id: 'new-trip-id' }),
  },
}));

// Mock storage service to avoid hitting Firebase in tests
jest.mock('../services/storageService', () => ({
  storageService: {
    uploadImageAndGetDownloadURL: jest.fn().mockResolvedValue('https://example.com/image.jpg'),
    uploadViaBackendDirect: jest.fn().mockResolvedValue({
      image_path: 'trip_cover_images/test/file.jpg',
      download_token: 'token',
      resized_path: 'trip_cover_images/test/file_resized.jpg',
      thumbnail_path: 'trip_cover_images/test/file_thumb.jpg',
    }),
  },
  generateUniqueFileName: jest.fn(() => 'file.jpg'),
}));

// Mock userService used by TripForm to provide participants
jest.mock('../services/userService', () => ({
  userService: {
    getFamilyMembers: jest.fn().mockResolvedValue([{ uid: 'u1', name: 'Member One' }]),
    getUsersByIds: jest.fn().mockResolvedValue([]),
  },
}));

describe('CreateTripScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanGoBack.mockReturnValue(true);
  });

  it('renders the create trip form correctly', () => {
    const { getByPlaceholderText, getByText } = render(<CreateTripScreen />);

    expect(getByPlaceholderText('Enter trip name')).toBeTruthy();
    expect(getByPlaceholderText('e.g., A week of adventure in the mountains')).toBeTruthy();
    expect(getByPlaceholderText('e.g., Denver, CO')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
    expect(getByText('Trips')).toBeTruthy();
  });

  it('creates the trip before uploading optional cover images', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<CreateTripScreen />);

    // Wait for async effects (participants fetch) to settle
    await waitFor(() => expect(queryByText('Participants')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Enter trip name'), 'Test Trip');
    fireEvent.changeText(getByPlaceholderText('e.g., A week of adventure in the mountains'), 'A fun trip');
    fireEvent.changeText(getByPlaceholderText('e.g., Denver, CO'), 'Test Location');
    fireEvent.changeText(getByPlaceholderText('e.g., 2000'), '2500');

    const createButton = getByText('Save');
    fireEvent.press(createButton);

    const { tripsService } = require('../services/trips');
    await waitFor(() => {
      expect(tripsService.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test Trip',
          description: 'A fun trip',
          location: 'Test Location',
          startDate: '2026-07-05',
          endDate: '2026-07-05',
          budget: 2500,
          ownerId: 'test-user-id',
          participants: ['u1', 'test-user-id'],
          coverImageUrl: undefined,
          coverImageResizedUrl: undefined,
          coverImageThumbnailUrl: undefined,
        }),
        'test-user-id',
      );
    });
    expect(tripsService.updateTrip).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('App', {
        screen: 'Trips',
        params: {
          screen: 'TripDetail',
          params: { tripId: 'new-trip-id' },
        },
      });
    });
  });

  it('submits itinerary stop dates in API format from US date inputs', async () => {
    const { getAllByPlaceholderText, getByPlaceholderText, getByText, queryByText } = render(<CreateTripScreen />);

    await waitFor(() => expect(queryByText('Participants')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Enter trip name'), 'Cruise');
    fireEvent.changeText(getByPlaceholderText('e.g., A week of adventure in the mountains'), 'Boston to Bermuda');
    fireEvent.changeText(getByPlaceholderText('e.g., Denver, CO'), 'Bermuda');
    fireEvent.press(getByText('Multiple Locations'));
    fireEvent.press(getByText('Add Stop'));
    fireEvent.changeText(getAllByPlaceholderText('Date (7/5, 7-5, 7/5/26)')[0], '26-7-5');
    fireEvent.changeText(getByPlaceholderText('Arrive, 12:00 PM'), '14:30');
    fireEvent.changeText(getByPlaceholderText('Depart, 2:30 PM'), '12p');
    fireEvent.press(getByText('Save'));

    const { tripsService } = require('../services/trips');
    await waitFor(() => {
      expect(tripsService.createTrip).toHaveBeenCalledWith(
        expect.objectContaining({
          tripType: 'multiLocation',
          itinerary: [
            expect.objectContaining({
              date: '2026-07-05',
              portName: 'Bermuda',
              arrivalTime: '2:30 PM',
              departureTime: '12:00 PM',
            }),
          ],
        }),
        'test-user-id',
      );
    });
  });

  it('returns to the Trips tab when opened directly without navigation history', async () => {
    mockCanGoBack.mockReturnValue(false);
    const { getByText } = render(<CreateTripScreen />);

    fireEvent.press(getByText('Trips'));

    expect(mockNavigate).toHaveBeenCalledWith('App', { screen: 'Trips' });
  });
});
