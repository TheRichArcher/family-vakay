import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { useAuth } from '../contexts/AuthContext'; // Assuming AuthContext provides login function
import LoginScreen from '../screens/LoginScreen';

// Mocks
jest.mock('../contexts/AuthContext', () => ({
  useAuth: jest.fn(),
}));

const mockNavigate = jest.fn();

jest.mock('@react-navigation/native', () => {
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: () => ({
      navigate: mockNavigate,
    }),
  };
});

// A helper to wrap the component in necessary providers
const AllTheProviders = ({ children }: { children: React.ReactNode }) => {
  return (
    // You can add more providers here if LoginScreen depends on them
    <>{children}</>
  );
};

describe('LoginScreen', () => {
  const mockSignInWithEmail = jest.fn();

  beforeEach(() => {
    // Reset mocks before each test
    mockSignInWithEmail.mockClear();
    mockNavigate.mockClear();
    (useAuth as jest.Mock).mockReturnValue({
      signInWithEmail: mockSignInWithEmail,
      forgotPassword: jest.fn(),
      user: null,
      isLoading: false,
      error: null,
    });
  });

  it('renders correctly', () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />, { wrapper: AllTheProviders });
    
    expect(getByPlaceholderText('Email')).toBeTruthy();
    expect(getByPlaceholderText('Password')).toBeTruthy();
    expect(getByText('Login')).toBeTruthy();
  });

  it('calls login function with credentials on button press', async () => {
    const { getByPlaceholderText, getByText } = render(<LoginScreen />, { wrapper: AllTheProviders });
    
    fireEvent.changeText(getByPlaceholderText('Email'), 'test@example.com');
    fireEvent.changeText(getByPlaceholderText('Password'), 'password');
    fireEvent.press(getByText('Login'));

    await waitFor(() => {
      expect(mockSignInWithEmail).toHaveBeenCalledWith('test@example.com', 'password');
    });
  });

  it('navigates to Register screen on "Register" press', () => {
    const { getByText } = render(<LoginScreen />, { wrapper: AllTheProviders });
    fireEvent.press(getByText("Don't have an account? Register"));
    expect(mockNavigate).toHaveBeenCalledWith('Register', {});
  });

  it('navigates to FamilyCode screen for kid login', async () => {
    const { getByText } = render(<LoginScreen />, { wrapper: AllTheProviders });
    fireEvent.press(getByText("Kid's Login"));
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalled();
    });
  });

  // Add more tests for error handling, etc.
});
