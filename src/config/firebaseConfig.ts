import { FirebaseApp, initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import rnAuth from '@react-native-firebase/auth';
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { Platform } from 'react-native';
import { env } from './env';

// Your web app's Firebase configuration
const firebaseConfig = {
    apiKey: env.EXPO_PUBLIC_FIREBASE_API_KEY,
    authDomain: env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: env.EXPO_PUBLIC_FIREBASE_APP_ID,
    measurementId: env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

// Validate required config
const requiredFields = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket'];
const missingFields = requiredFields.filter(field => !firebaseConfig[field as keyof typeof firebaseConfig]);

if (missingFields.length > 0) {
  console.error('Missing required Firebase configuration fields:', missingFields);
  // It's better to not throw here during initial load, let components handle it or show a global error UI
  // For now, console.error is good for visibility during development.
  // Consider a more graceful error handling strategy for production.
}

// Initialize Firebase
let app: FirebaseApp;
if (getApps().length === 0) {
    app = initializeApp(firebaseConfig);
} else {
    app = getApp();
}

// Initialize Firebase App Check on web only when explicitly enabled
if (Platform.OS === 'web' && env.EXPO_PUBLIC_ENABLE_APP_CHECK && env.EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(env.EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (e) {
    console.warn('Failed to initialize Firebase App Check:', e);
  }
}

const auth = Platform.OS === 'web' ? getAuth(app) : rnAuth();
const db = getFirestore(app);
// Use the configured storageBucket from env; Firebase JS SDK handles modern hostnames
const storage = getStorage(app);

export { app, auth, db, storage }; 
