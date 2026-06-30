import { User } from 'firebase/auth';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { auth } from '../config/firebaseConfig';
import rnAuth from '@react-native-firebase/auth';

const API_TOKEN_KEY = 'api_token';

// In-memory storage for web
let apiToken: string | null = null;

const webStorage = {
  getItem: async (_key: string): Promise<string | null> => {
    return apiToken;
  },
  setItem: async (_key: string, value: string): Promise<void> => {
    apiToken = value;
  },
  removeItem: async (_key: string): Promise<void> => {
    apiToken = null;
  },
};

const nativeStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key),
};

const storage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const authService = {
  async getIdToken(
    firebaseUser: User,
    forceRefresh = false
  ): Promise<string | null> {
    if (!firebaseUser) {
      console.error('getIdToken: called with no user');
      return null;
    }
    try {
      const firebaseToken = await firebaseUser.getIdToken(forceRefresh);
      await this.storeApiToken(firebaseToken);
      return firebaseToken;
    } catch (error) {
      console.error('Failed to get Firebase ID token:', error);
      return null;
    }
  },

  async storeApiToken(token: string): Promise<void> {
    await storage.setItem(API_TOKEN_KEY, token);
  },

  async getStoredApiToken(): Promise<string | null> {
    return await storage.getItem(API_TOKEN_KEY);
  },

  async clearStoredApiToken(): Promise<void> {
    await storage.removeItem(API_TOKEN_KEY);
  },

  async logout(): Promise<void> {
    try {
      // Clear local tokens first
      await this.clearStoredApiToken();

      // Sign out from Firebase
      if (Platform.OS === 'web') {
        await auth.signOut();
      } else {
        await rnAuth().signOut();
      }
    } catch (error) {
      console.error('Error during logout:', error);
    }
  },
};
