import { AxiosRequestConfig } from 'axios';
import { Platform } from 'react-native';
import apiClient from '../utils/apiClient';

jest.mock('../services/authService', () => ({
  authService: {
    getStoredApiToken: jest.fn(async () => null),
    storeApiToken: jest.fn(async () => {}),
    logout: jest.fn(async () => {}),
  },
}));

// Test-specific mock for rn firebase auth to control currentUser
jest.mock('@react-native-firebase/auth', () => {
  return jest.fn(() => ({
    currentUser: null,
  }));
});

const { authService } = jest.requireMock('../services/authService');

describe('apiClient interceptors', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (authService.getStoredApiToken as jest.Mock).mockResolvedValue(null);
  });

  it('injects Authorization header when stored token exists', async () => {
    (authService.getStoredApiToken as jest.Mock).mockResolvedValue('stored-token');

    const seenConfigs: AxiosRequestConfig[] = [];
    // Install a stub adapter to avoid real HTTP and capture headers
    (apiClient.defaults as any).adapter = jest.fn(async (config: AxiosRequestConfig) => {
      seenConfigs.push(config);
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: {},
        config: config as any,
      } as any;
    });

    await apiClient.get('/test-auth-header');

    expect(seenConfigs[0]?.headers).toBeDefined();
    expect((seenConfigs[0]!.headers as any).Authorization).toBe('Bearer stored-token');
  });

  it('on 401 refreshes token via Firebase and retries with new Authorization header', async () => {
    // Ensure native path is used (rn auth)
    (Platform as any).OS = 'ios';

    const rnAuth = require('@react-native-firebase/auth');
    rnAuth.mockImplementation(() => ({
      currentUser: {
        getIdToken: jest.fn().mockResolvedValue('new-fb-token'),
      },
    }));

    const adapterMock = jest.fn()
      // First call: respond with a 401
      .mockImplementationOnce(async (config: AxiosRequestConfig) => {
        const error: any = new Error('Unauthorized');
        error.config = config;
        error.isAxiosError = true;
        error.response = { status: 401, data: { detail: 'unauthorized' } };
        throw error;
      })
      // Second call: succeed
      .mockImplementationOnce(async (config: AxiosRequestConfig) => {
        return {
          data: { ok: true },
          status: 200,
          statusText: 'OK',
          headers: {},
          config: config as any,
        } as any;
      });

    (apiClient.defaults as any).adapter = adapterMock;

    const response = await apiClient.get('/will-401-then-retry');
    expect(response.status).toBe(200);

    // Second invocation should have Authorization set to refreshed token
    const secondConfig = (adapterMock.mock.calls[1] as any[])[0] as AxiosRequestConfig;
    expect((secondConfig.headers as any).Authorization).toBe('Bearer new-fb-token');
    expect(authService.storeApiToken).toHaveBeenCalledWith('new-fb-token');
  });
});

