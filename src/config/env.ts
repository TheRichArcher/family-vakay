import Constants from 'expo-constants';
import { Platform } from 'react-native';

// Best-effort access to process.env for web builds where webpack defines these
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runtimeProcessEnv: any = (typeof process !== 'undefined' && (process as any)?.env) || {};

const ENV = {
  dev: {
    // Prefer explicitly configured URL even in dev; fall back to sensible simulator defaults
    EXPO_PUBLIC_API_URL:
      runtimeProcessEnv.EXPO_PUBLIC_API_URL ||
      (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_URL ||
      (Platform.OS === 'android' ? 'http://10.0.2.2:8000' : 'http://localhost:8000'),
    DEEPLINK_BASE_URL:
      runtimeProcessEnv.DEEPLINK_BASE_URL || (Constants.expoConfig?.extra as any)?.DEEPLINK_BASE_URL || '',
    QR_BASE_URL:
      runtimeProcessEnv.QR_BASE_URL || (Constants.expoConfig?.extra as any)?.QR_BASE_URL || '',
  },
  prod: {
    EXPO_PUBLIC_API_URL:
      runtimeProcessEnv.EXPO_PUBLIC_API_URL || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_API_URL,
    DEEPLINK_BASE_URL:
      runtimeProcessEnv.DEEPLINK_BASE_URL || (Constants.expoConfig?.extra as any)?.DEEPLINK_BASE_URL,
    QR_BASE_URL:
      runtimeProcessEnv.QR_BASE_URL || (Constants.expoConfig?.extra as any)?.QR_BASE_URL,
    EXPO_PUBLIC_SENTRY_DSN:
      runtimeProcessEnv.EXPO_PUBLIC_SENTRY_DSN || (Constants.expoConfig?.extra as any)?.EXPO_PUBLIC_SENTRY_DSN,
    SENTRY_ENV: runtimeProcessEnv.SENTRY_ENV || (Constants.expoConfig?.extra as any)?.SENTRY_ENV,
  },
};

const getEnvVars = () => {
  // @ts-ignore
  if (__DEV__) {
    return ENV.dev;
  }
  return ENV.prod;
};

let {
  EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY,
  DEEPLINK_BASE_URL,
  QR_BASE_URL,
  EXPO_PUBLIC_SENTRY_DSN,
  SENTRY_ENV,
  EXPO_PUBLIC_ENABLE_APP_CHECK,
} = (Constants.expoConfig?.extra as any) || {};

// Allow runtime overrides (useful for web builds)
EXPO_PUBLIC_SENTRY_DSN = runtimeProcessEnv.EXPO_PUBLIC_SENTRY_DSN || EXPO_PUBLIC_SENTRY_DSN;
SENTRY_ENV = runtimeProcessEnv.SENTRY_ENV || SENTRY_ENV;

const API_URL = getEnvVars().EXPO_PUBLIC_API_URL;
const DEEPLINK_URL = getEnvVars().DEEPLINK_BASE_URL || DEEPLINK_BASE_URL;
const QR_URL = getEnvVars().QR_BASE_URL || QR_BASE_URL;

// Avoid throwing during test or static import; log a warning instead
if (
  (!EXPO_PUBLIC_FIREBASE_API_KEY ||
    !EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    !EXPO_PUBLIC_FIREBASE_PROJECT_ID ||
    !EXPO_PUBLIC_FIREBASE_APP_ID) &&
  // @ts-ignore - JEST_WORKER_ID is set when running tests
  typeof JEST_WORKER_ID === 'undefined'
) {
  console.warn('Missing required Firebase env variables');
}

export const env = {
  EXPO_PUBLIC_FIREBASE_API_KEY,
  EXPO_PUBLIC_FIREBASE_APP_ID,
  EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID,
  EXPO_PUBLIC_FIREBASE_APP_CHECK_KEY,
  EXPO_PUBLIC_API_URL: API_URL,
  DEEPLINK_BASE_URL: DEEPLINK_URL,
  QR_BASE_URL: QR_URL,
  EXPO_PUBLIC_SENTRY_DSN,
  SENTRY_ENV,
  EXPO_PUBLIC_ENABLE_APP_CHECK: String(
    runtimeProcessEnv.EXPO_PUBLIC_ENABLE_APP_CHECK ?? EXPO_PUBLIC_ENABLE_APP_CHECK ?? 'false'
  ).toLowerCase() === 'true',
}; 