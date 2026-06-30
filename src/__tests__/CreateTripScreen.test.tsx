import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import CreateTripScreen from '../screens/CreateTripScreen';

// Mock navigation
const mockNavigate = jest.fn();
const mockGoBack = jest.fn();
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({
    navigate: mockNavigate,
    goBack: mockGoBack,
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
  },
}));

// Mock storage service to avoid hitting Firebase in tests
jest.mock('../services/storageService', () => ({
  storageService: {
    uploadImageAndGetDownloadURL: jest.fn().mockResolvedValue('https://example.com/image.jpg'),
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
  it('renders the create trip form correctly', () => {
    const { getByPlaceholderText, getByText } = render(<CreateTripScreen />);

    expect(getByPlaceholderText('Enter trip name')).toBeTruthy();
    expect(getByPlaceholderText('e.g., A week of adventure in the mountains')).toBeTruthy();
    expect(getByPlaceholderText('e.g., Denver, CO')).toBeTruthy();
    expect(getByText('Save')).toBeTruthy();
  });

  it('calls the createTrip service on form submission', async () => {
    const { getByPlaceholderText, getByText, queryByText } = render(<CreateTripScreen />);

    // Wait for async effects (participants fetch) to settle
    await waitFor(() => expect(queryByText('Participants')).toBeTruthy());

    fireEvent.changeText(getByPlaceholderText('Enter trip name'), 'Test Trip');
    fireEvent.changeText(getByPlaceholderText('e.g., A week of adventure in the mountains'), 'A fun trip');
    fireEvent.changeText(getByPlaceholderText('e.g., Denver, CO'), 'Test Location');

    const createButton = getByText('Save');
    fireEvent.press(createButton);

    await waitFor(() => {
      expect(mockGoBack).toHaveBeenCalled();
    });
  });
}); 