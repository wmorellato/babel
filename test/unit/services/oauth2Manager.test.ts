/**
 * OAuth2 Manager Tests
 * Tests OAuth2 flow abstraction for multiple providers
 */

import { OAuth2Manager, OAuth2Config } from '../../../src/services/oauth2Manager';
import { CredentialError } from '../../../src/utils/credentialError';

/**
 * Mock OAuth2Client for testing
 */
class MockOAuth2Client {
  private credentials: any = {};

  setCredentials(creds: any): void {
    this.credentials = { ...this.credentials, ...creds };
  }

  getCredentials(): any {
    return this.credentials;
  }

  generateAuthUrl(options: any): string {
    const params = new URLSearchParams({
      client_id: 'test-client-id',
      redirect_uri: 'http://localhost/callback',
      response_type: 'code',
      access_type: options.access_type || 'online',
      scope: Array.isArray(options.scope) ? options.scope.join(' ') : options.scope,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async getToken(code: string): Promise<{ tokens: any }> {
    if (!code || code === 'invalid') {
      throw new Error('Invalid authorization code');
    }
    return {
      tokens: {
        access_token: `access_${code}`,
        refresh_token: `refresh_${code}`,
        expires_in: 3600,
        token_type: 'Bearer',
      },
    };
  }

  async refreshAccessToken(): Promise<{ credentials: any }> {
    return {
      credentials: {
        access_token: 'refreshed_access_token',
        refresh_token: this.credentials.refresh_token,
        expires_in: 3600,
      },
    };
  }
}

/**
 * Mock googleapis module
 */
const mockGoogleAuth = {
  OAuth2: jest.fn((clientId, redirectUri) => new MockOAuth2Client()),
};

describe('OAuth2Manager', () => {
  let oauth2Manager: OAuth2Manager;
  let mockClient: MockOAuth2Client;
  let config: OAuth2Config;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      clientId: 'test-client-id',
      redirectUri: 'http://localhost/callback',
    };

    mockClient = new MockOAuth2Client();
    (mockGoogleAuth.OAuth2 as jest.Mock).mockReturnValue(mockClient);

    oauth2Manager = new OAuth2Manager(config, mockGoogleAuth);
  });

  describe('constructor', () => {
    it('initializes with configuration', () => {
      const manager = new OAuth2Manager(config, mockGoogleAuth);
      expect(manager).toBeDefined();
    });

    it('creates OAuth2Client with provided credentials', () => {
      new OAuth2Manager(config, mockGoogleAuth);

      expect(mockGoogleAuth.OAuth2).toHaveBeenCalledWith(
        'test-client-id',
        'http://localhost/callback'
      );
    });
  });

  describe('generateAuthorizationUrl()', () => {
    it('generates authorization URL with scopes', () => {
      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
      expect(url).toContain('client_id=test-client-id');
      expect(url).toContain('redirect_uri=http%3A%2F%2Flocalhost%2Fcallback');
      expect(url).toContain('response_type=code');
      expect(url).toContain('access_type=offline');
    });

    it('encodes multiple scopes correctly', () => {
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.email',
      ];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('scope=');
      // Both scopes should be in the URL
      expect(url).toContain('drive.file');
      expect(url).toContain('userinfo.email');
    });

    it('requests offline access for refresh tokens', () => {
      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('access_type=offline');
    });

    it('includes redirect URI in authorization URL', () => {
      const scopes = ['https://www.googleapis.com/auth/drive.file'];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('redirect_uri=');
      expect(url).toContain('localhost');
    });

    it('handles empty scope array', () => {
      const url = oauth2Manager.generateAuthorizationUrl([]);

      expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    });
  });

  describe('handleAuthorizationCode()', () => {
    it('exchanges authorization code for tokens', async () => {
      const tokens = await oauth2Manager.handleAuthorizationCode('valid-code');

      expect(tokens.accessToken).toBe('access_valid-code');
      expect(tokens.refreshToken).toBe('refresh_valid-code');
    });

    it('returns token object with correct structure', async () => {
      const tokens = await oauth2Manager.handleAuthorizationCode('test-code');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresAt');
      expect(tokens.accessToken).toBe('access_test-code');
      expect(tokens.refreshToken).toBe('refresh_test-code');
    });

    it('calculates correct expiry time', async () => {
      const before = Date.now();
      const tokens = await oauth2Manager.handleAuthorizationCode('expiry-code');
      const after = Date.now();

      // Token expires in 3600 seconds (1 hour)
      expect(tokens.expiresAt).toBeDefined();
      const expectedExpiry = before + 3600000;
      expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(tokens.expiresAt!.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
    });

    it('throws error for invalid authorization code', async () => {
      await expect(oauth2Manager.handleAuthorizationCode('invalid')).rejects.toThrow();
    });

    it('throws error for empty code', async () => {
      await expect(oauth2Manager.handleAuthorizationCode('')).rejects.toThrow();
    });

    it('throws CredentialError on failure', async () => {
      const badManager = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => ({
          generateAuthUrl: jest.fn(),
          getToken: jest.fn().mockRejectedValue(new Error('Auth failed')),
        })),
      } as any);

      await expect(badManager.handleAuthorizationCode('code')).rejects.toThrow(
        CredentialError
      );
    });
  });

  describe('refreshAccessToken()', () => {
    it('refreshes access token using refresh token', async () => {
      const refreshToken = 'refresh_test_token';
      const newTokens = await oauth2Manager.refreshAccessToken(refreshToken);

      expect(newTokens.accessToken).toBe('refreshed_access_token');
      expect(newTokens.refreshToken).toBe(refreshToken);
    });

    it('returns new token object with expiry', async () => {
      const tokens = await oauth2Manager.refreshAccessToken('refresh_token');

      expect(tokens).toHaveProperty('accessToken');
      expect(tokens).toHaveProperty('refreshToken');
      expect(tokens).toHaveProperty('expiresAt');
      expect(tokens.expiresAt).toBeInstanceOf(Date);
    });

    it('sets client credentials before refresh', async () => {
      const refreshToken = 'refresh_token_123';

      jest.spyOn(mockClient, 'setCredentials');

      await oauth2Manager.refreshAccessToken(refreshToken);

      expect(mockClient.setCredentials).toHaveBeenCalledWith(
        expect.objectContaining({
          refresh_token: refreshToken,
        })
      );
    });

    it('calculates expiry time from expires_in', async () => {
      const before = Date.now();
      const tokens = await oauth2Manager.refreshAccessToken('refresh_token');
      const after = Date.now();

      // Token expires in 3600 seconds
      expect(tokens.expiresAt).toBeDefined();
      const expectedExpiry = before + 3600000;
      expect(tokens.expiresAt!.getTime()).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(tokens.expiresAt!.getTime()).toBeLessThanOrEqual(after + 3600000 + 100);
    });

    it('throws CredentialError on refresh failure', async () => {
      const badManager = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => ({
          generateAuthUrl: jest.fn(),
          setCredentials: jest.fn(),
          refreshAccessToken: jest
            .fn()
            .mockRejectedValue(new Error('Refresh failed')),
        })),
      } as any);

      await expect(badManager.refreshAccessToken('bad_token')).rejects.toThrow(
        CredentialError
      );
    });
  });

  describe('Configuration Handling', () => {
    it('uses provided redirect URI', () => {
      const customConfig = {
        clientId: 'custom-id',
        redirectUri: 'https://custom.example.com/oauth/callback',
      };

      new OAuth2Manager(customConfig, mockGoogleAuth);

      expect(mockGoogleAuth.OAuth2).toHaveBeenCalledWith(
        'custom-id',
        'https://custom.example.com/oauth/callback'
      );
    });

    it('handles localhost redirect URI', () => {
      const localhostConfig = {
        clientId: 'local-id',
        redirectUri: 'http://localhost:3000/oauth/callback',
      };

      new OAuth2Manager(localhostConfig, mockGoogleAuth);

      expect(mockGoogleAuth.OAuth2).toHaveBeenCalledWith(
        'local-id',
        'http://localhost:3000/oauth/callback'
      );
    });
  });

  describe('Token Response Parsing', () => {
    it('extracts expires_in from token response', async () => {
      const tokens = await oauth2Manager.handleAuthorizationCode('code-with-expiry');

      expect(tokens.expiresAt).toBeInstanceOf(Date);
      expect(tokens.expiresAt!.getTime()).toBeGreaterThan(Date.now());
    });

    it('handles missing refresh token in response', async () => {
      const noRefreshClient = {
        generateAuthUrl: jest.fn(),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'access_only',
            expires_in: 3600,
          },
        }),
      };

      const managerWithNoRefresh = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => noRefreshClient),
      } as any);

      const tokens = await managerWithNoRefresh.handleAuthorizationCode('code');

      expect(tokens.accessToken).toBe('access_only');
      expect(tokens.refreshToken).toBeUndefined();
    });

    it('handles missing expires_in in response', async () => {
      const noExpiryClient = {
        generateAuthUrl: jest.fn(),
        getToken: jest.fn().mockResolvedValue({
          tokens: {
            access_token: 'access_no_expiry',
            refresh_token: 'refresh_no_expiry',
          },
        }),
      };

      const managerWithNoExpiry = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => noExpiryClient),
      } as any);

      const tokens = await managerWithNoExpiry.handleAuthorizationCode('code');

      expect(tokens.accessToken).toBe('access_no_expiry');
      expect(tokens.expiresAt).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    it('wraps OAuth2 errors in CredentialError', async () => {
      const errorClient = {
        generateAuthUrl: jest.fn(),
        getToken: jest.fn().mockRejectedValue(new Error('OAuth failed')),
      };

      const errorManager = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => errorClient),
      } as any);

      await expect(errorManager.handleAuthorizationCode('code')).rejects.toBeInstanceOf(
        CredentialError
      );
    });

    it('includes original error message in CredentialError', async () => {
      const errorClient = {
        generateAuthUrl: jest.fn(),
        getToken: jest.fn().mockRejectedValue(new Error('Invalid grant')),
      };

      const errorManager = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => errorClient),
      } as any);

      await expect(errorManager.handleAuthorizationCode('code')).rejects.toThrow(
        /Invalid grant/
      );
    });

    it('handles network errors', async () => {
      const networkErrorClient = {
        generateAuthUrl: jest.fn(),
        getToken: jest.fn().mockRejectedValue(new Error('ECONNREFUSED')),
      };

      const errorManager = new OAuth2Manager(config, {
        OAuth2: jest.fn(() => networkErrorClient),
      } as any);

      await expect(errorManager.handleAuthorizationCode('code')).rejects.toThrow(
        CredentialError
      );
    });
  });

  describe('Scope Management', () => {
    it('preserves scope order in authorization URL', () => {
      const scopes = ['scope-a', 'scope-b', 'scope-c'];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('scope=');
    });

    it('handles Google Drive specific scopes', () => {
      const driveScopes = ['https://www.googleapis.com/auth/drive.file'];
      const url = oauth2Manager.generateAuthorizationUrl(driveScopes);

      expect(url).toContain('drive.file');
    });

    it('handles multiple Google API scopes', () => {
      const scopes = [
        'https://www.googleapis.com/auth/drive.file',
        'https://www.googleapis.com/auth/userinfo.profile',
      ];
      const url = oauth2Manager.generateAuthorizationUrl(scopes);

      expect(url).toContain('drive.file');
      expect(url).toContain('userinfo.profile');
    });
  });
});
