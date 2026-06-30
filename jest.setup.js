import 'react-native-gesture-handler/jestSetup';
import '@testing-library/jest-native/extend-expect';

// Increase default test timeout to accommodate async screens
jest.setTimeout(20000);

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  Reanimated.default.call = () => {};
  return Reanimated;
});


jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: jest.fn(() => Promise.resolve({
    canceled: false,
    assets: [{ uri: 'file:///test/image.jpg' }],
  })),
  requestMediaLibraryPermissionsAsync: jest.fn(() => Promise.resolve({
    status: 'granted'
  })),
}));

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  getCurrentPositionAsync: jest.fn(() => Promise.resolve({
    coords: {
      latitude: 37.7749,
      longitude: -122.4194,
    },
  })),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
  deleteItemAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('expo-barcode-scanner', () => ({
  ...jest.requireActual('expo-barcode-scanner'),
  requestPermissionsAsync: jest.fn(() => Promise.resolve({ status: 'granted' })),
  BarCodeScanner: {
    Constants: {
      Type: {
        back: 'back'
      },
      BarCodeType: {
        qr: 'qr'
      }
    }
  }
}));

// Mock NativeEventEmitter
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock expo-asset/Expo access for @expo/vector-icons
jest.mock('expo-asset', () => ({
  Asset: { fromModule: jest.fn(() => ({ downloadAsync: jest.fn() })) },
}));
jest.mock('expo-font', () => ({
  loadAsync: jest.fn(() => Promise.resolve()),
  isLoaded: jest.fn(() => true),
}));

// Mock vector icons to avoid Font loading logic
jest.mock('@expo/vector-icons', () => {
  const React = require('react');
  const MockIcon = (props) => React.createElement('Icon', props, props.children);
  return {
    Ionicons: MockIcon,
    MaterialIcons: MockIcon,
    FontAwesome: MockIcon,
    default: { Ionicons: MockIcon },
  };
});

// Mock @react-native-firebase/auth to avoid ESM parsing and native bindings
jest.mock('@react-native-firebase/auth', () => {
  const mockAuth = () => ({
    signInWithEmailAndPassword: jest.fn(() => Promise.resolve()),
    createUserWithEmailAndPassword: jest.fn(() => Promise.resolve({ user: { uid: 'uid' } })),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
    signInWithCustomToken: jest.fn(() => Promise.resolve({ user: { uid: 'kid' } })),
    signOut: jest.fn(() => Promise.resolve()),
    onAuthStateChanged: jest.fn(() => () => {}),
    currentUser: null,
  });
  return mockAuth;
});

// Provide minimal expo-constants mock for env reading in tests
jest.mock('expo-constants', () => ({
  expoConfig: { extra: { EXPO_PUBLIC_API_URL: 'http://localhost:8000', EXPO_PUBLIC_FIREBASE_API_KEY: 'x', EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN: 'x', EXPO_PUBLIC_FIREBASE_PROJECT_ID: 'x', EXPO_PUBLIC_FIREBASE_APP_ID: 'x', EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET: 'x', EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'x' } }
}));

// Minimal virtual mocks for Firebase ESM packages during tests
jest.mock('firebase/app', () => ({
  getApps: () => [],
  initializeApp: jest.fn(() => ({ __mockApp: true })),
  getApp: jest.fn(() => ({ __mockApp: true })),
}), { virtual: true });
jest.mock('firebase/firestore', () => ({
  getFirestore: () => ({}),
}), { virtual: true });
jest.mock('firebase/storage', () => ({
  getStorage: () => ({}),
}), { virtual: true });
jest.mock('firebase/auth', () => ({
  getAuth: () => ({
    signInWithEmailAndPassword: jest.fn(),
    createUserWithEmailAndPassword: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  }),
}), { virtual: true });
