import axios, { AxiosError, AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { Alert, Platform } from 'react-native';
import { auth } from '../config/firebaseConfig';
import rnAuth from '@react-native-firebase/auth';
import { env } from '../config/env';
import { authService } from '../services/authService';
import { addBreadcrumb, captureException } from '../monitoring';

// Create axios instance with default config
export const apiClient: AxiosInstance = axios.create({
  baseURL: env.EXPO_PUBLIC_API_URL, // This should be just the domain, e.g., http://localhost:8000
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
apiClient.interceptors.request.use(
  async (config) => {
    addBreadcrumb({
      category: 'api',
      message: `Request: ${config.method?.toUpperCase()} ${config.baseURL}${config.url}`,
      level: 'info',
      data: { headers: { ...config.headers }, params: config.params },
    });
    const token = await authService.getStoredApiToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    captureException(error, { tags: { area: 'api', phase: 'request' } });
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError<{ detail?: string; message?: string }>) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const currentUser = Platform.OS === 'web' ? auth.currentUser : rnAuth().currentUser;

      if (currentUser) {
        try {
          // 1. Force refresh the Firebase token to ensure it's valid
          const fbToken = await currentUser.getIdToken(true);
          
          if (fbToken) {
            // 2. Store the new token
            await authService.storeApiToken(fbToken);
            
            // 3. Update the header for the retry and resend the request
            originalRequest.headers.Authorization = `Bearer ${fbToken}`;
            return apiClient(originalRequest);
          }
        } catch (refreshError) {
          captureException(refreshError, { tags: { area: 'api', reason: 'token_refresh_failed' } });
          console.error('API token refresh failed. Logging out.', refreshError);
          // If refresh fails, the user is effectively logged out.
          await authService.logout(); // This should clear tokens and navigate to login
          Alert.alert('Session Expired', 'Your session has expired. Please log in again.');
          return Promise.reject(error);
        }
      }
    }

    // Don't show a global alert for 404s, let the caller handle it.
    if (error.response?.status === 404) {
      return Promise.reject(error);
    }

    // Handle forbidden errors
    if (error.response?.status === 403) {
      Alert.alert(
        'Access Denied',
        'You do not have permission to perform this action.'
      );
      captureException(error, { tags: { area: 'api', status: '403' } });
      return Promise.reject(error);
    }

    // Handle server errors
    if (error.response?.status && error.response.status >= 500) {
      Alert.alert(
        'Server Error',
        'Something went wrong on our end. Please try again later.'
      );
      captureException(error, { tags: { area: 'api', status: String(error.response.status) } });
      return Promise.reject(error);
    }

    // For other errors, we probably want the calling code to handle it.
    // The generic alert here is often not helpful and can be confusing.
    /*
    const errorMessage = error.response?.data?.detail || 
                        error.response?.data?.message || 
                        'An unexpected error occurred';
    
    Alert.alert('Error', errorMessage);
    */
    captureException(error, { tags: { area: 'api', status: String(error.response?.status || 'unknown') } });
    return Promise.reject(error);
  }
);

export default apiClient; 