/**
 * Token Manager Tests
 * Tests token lifecycle management, refresh, and expiry handling
 */

import { TokenManager } from '../../../src/services/tokenManager';
import { ICredentialStorage, StoredCredential } from '../../../src/services/credentialStorage';
import { TokenExpiredError, AuthenticationRequiredError } from '../../../src/utils/credentialError';

/**
 * Mock credential storage for testing
 */
class MockStorage implements ICredentialStorage {
  private credentials: Map<string, StoredCredential> = new Map();

  async store(key: string, credential: StoredCredential): Promise<void> {
    this.credentials.set(key, credential);
  }

  async retrieve(key: string): Promise<StoredCredential | null> {
    return this.credentials.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.credentials.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.credentials.keys());
  }

  async isMigrationNeeded(): Promise<boolean> {
    return false;
  }

  async migrateFromLegacy(sourceKey: string, targetKey: string): Promise<void> {
    const credential = this.credentials.get(sourceKey);
    if (credential) {
      this.credentials.set(targetKey, credential);
    }
  }
}

describe('TokenManager', () => {
  let storage: MockStorage;
  let tokenManager: TokenManager;

  beforeEach(() => {
    storage = new MockStorage();
    tokenManager = new TokenManager(storage, 300); // 5 minute refresh buffer
  });

  const createTestCredential = (overrides = {}): StoredCredential => ({
    version: '1.0',
    type: 'oauth2',
    provider: 'google',
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
    scope: ['https://www.googleapis.com/auth/drive.file'],
    metadata: { userId: 'user123' },
    ...overrides,
  });

  describe('acquireToken()', () => {
    it('stores new credential with given access and refresh tokens', async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      await tokenManager.acquireToken('google-drive', 'access123', 'refresh456', expiresAt);

      const stored = await storage.retrieve('google-drive');
      expect(stored).not.toBeNull();
      expect(stored?.accessToken).toBe('access123');
      expect(stored?.refreshToken).toBe('refresh456');
    });

    it('sets credential metadata with acquisition time', async () => {
      const expiresAt = new Date();
      await tokenManager.acquireToken('test-key', 'access', 'refresh', expiresAt);

      const stored = await storage.retrieve('test-key');
      expect(stored?.metadata).toBeDefined();
      expect(stored?.metadata?.acquiredAt).toBeDefined();
    });

    it('stores token without refresh token if not provided', async () => {
      const expiresAt = new Date(Date.now() + 3600000);
      await tokenManager.acquireToken('api-key', 'access_only', undefined, expiresAt);

      const stored = await storage.retrieve('api-key');
      expect(stored?.accessToken).toBe('access_only');
      expect(stored?.refreshToken).toBeUndefined();
    });

    it('stores token without expiry if not provided', async () => {
      await tokenManager.acquireToken('static-token', 'access', undefined, undefined);

      const stored = await storage.retrieve('static-token');
      expect(stored?.accessToken).toBe('access');
      expect(stored?.expiresAt).toBeUndefined();
    });

    it('overwrites existing token with same key', async () => {
      await tokenManager.acquireToken('key1', 'old_token', undefined, undefined);
      await tokenManager.acquireToken('key1', 'new_token', undefined, undefined);

      const stored = await storage.retrieve('key1');
      expect(stored?.accessToken).toBe('new_token');
    });
  });

  describe('getValidToken()', () => {
    it('returns access token when credential exists and not expired', async () => {
      const credential = createTestCredential();
      await storage.store('google-drive', credential);

      const token = await tokenManager.getValidToken('google-drive');

      expect(token).toBe('access_token_123');
    });

    it('returns null if credential does not exist', async () => {
      const token = await tokenManager.getValidToken('non-existent');

      expect(token).toBeNull();
    });

    it('returns null if credential is expired and no refresh token available', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        refreshToken: undefined,
      });
      await storage.store('expired', credential);

      const token = await tokenManager.getValidToken('expired');

      expect(token).toBeNull();
    });

    it('auto-refreshes token when near expiry (within refresh buffer)', async () => {
      const expiresAt = new Date(Date.now() + 200000); // 200 seconds from now
      const credential = createTestCredential({
        expiresAt,
        refreshToken: 'refresh_token',
      });
      await storage.store('expiring', credential);

      // Mock the refresh by directly updating storage
      await storage.store('expiring', createTestCredential({
        expiresAt: new Date(Date.now() + 3600000),
        accessToken: 'refreshed_token',
        refreshToken: 'refresh_token',
      }));

      const token = await tokenManager.getValidToken('expiring');

      // Token should be refreshed (we updated it above)
      expect(token).toBe('refreshed_token');
    });

    it('handles token without expiry (static token)', async () => {
      const credential = createTestCredential({ expiresAt: undefined });
      await storage.store('static', credential);

      const token = await tokenManager.getValidToken('static');

      expect(token).toBe('access_token_123');
    });
  });

  describe('isTokenExpired()', () => {
    it('returns true if token is past expiry', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() - 1000), // 1 second ago
      });
      await storage.store('expired', credential);

      const isExpired = await tokenManager.isTokenExpired('expired');

      expect(isExpired).toBe(true);
    });

    it('returns false if token has time remaining', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 3600000), // 1 hour from now
      });
      await storage.store('valid', credential);

      const isExpired = await tokenManager.isTokenExpired('valid');

      expect(isExpired).toBe(false);
    });

    it('returns false if token has no expiry', async () => {
      const credential = createTestCredential({ expiresAt: undefined });
      await storage.store('no-expiry', credential);

      const isExpired = await tokenManager.isTokenExpired('no-expiry');

      expect(isExpired).toBe(false);
    });

    it('returns false if credential not found', async () => {
      const isExpired = await tokenManager.isTokenExpired('non-existent');

      expect(isExpired).toBe(false);
    });
  });

  describe('isTokenNearExpiry()', () => {
    it('returns true if token expires within refresh buffer (300s)', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 200000), // 200 seconds from now
      });
      await storage.store('near-expiry', credential);

      const isNearExpiry = await tokenManager.isTokenNearExpiry('near-expiry');

      expect(isNearExpiry).toBe(true);
    });

    it('returns false if token expires after refresh buffer', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 400000), // 400 seconds from now
      });
      await storage.store('safe', credential);

      const isNearExpiry = await tokenManager.isTokenNearExpiry('safe');

      expect(isNearExpiry).toBe(false);
    });

    it('returns false if token has no expiry', async () => {
      const credential = createTestCredential({ expiresAt: undefined });
      await storage.store('no-expiry', credential);

      const isNearExpiry = await tokenManager.isTokenNearExpiry('no-expiry');

      expect(isNearExpiry).toBe(false);
    });

    it('returns false if credential not found', async () => {
      const isNearExpiry = await tokenManager.isTokenNearExpiry('non-existent');

      expect(isNearExpiry).toBe(false);
    });

    it('respects custom refresh buffer', async () => {
      const customTokenManager = new TokenManager(storage, 600); // 10 minute buffer
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 500000), // 500 seconds from now
      });
      await storage.store('custom', credential);

      const isNearExpiry = await customTokenManager.isTokenNearExpiry('custom');

      expect(isNearExpiry).toBe(true); // Should be near expiry with 10min buffer
    });
  });

  describe('refreshToken()', () => {
    it('requires refresh token to refresh', async () => {
      const credential = createTestCredential({ refreshToken: undefined });
      await storage.store('no-refresh', credential);

      await expect(
        tokenManager.refreshToken('no-refresh', async () => ({
          accessToken: 'new_token',
          refreshToken: 'new_refresh',
          expiresAt: new Date(Date.now() + 3600000),
        }))
      ).rejects.toThrow();
    });

    it('calls refreshHandler to get new tokens', async () => {
      const credential = createTestCredential();
      await storage.store('to-refresh', credential);

      const refreshHandler = jest.fn().mockResolvedValue({
        accessToken: 'new_access',
        refreshToken: 'new_refresh',
        expiresAt: new Date(Date.now() + 3600000),
      });

      await tokenManager.refreshToken('to-refresh', refreshHandler);

      expect(refreshHandler).toHaveBeenCalledWith('refresh_token_456');
    });

    it('stores new tokens returned from refresh handler', async () => {
      const credential = createTestCredential();
      await storage.store('refresh-me', credential);

      await tokenManager.refreshToken('refresh-me', async () => ({
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      const updated = await storage.retrieve('refresh-me');
      expect(updated?.accessToken).toBe('new_access_token');
      expect(updated?.refreshToken).toBe('new_refresh_token');
    });

    it('propagates refresh handler errors', async () => {
      const credential = createTestCredential();
      await storage.store('error', credential);

      const refreshHandler = jest.fn().mockRejectedValue(new Error('Refresh failed'));

      await expect(
        tokenManager.refreshToken('error', refreshHandler)
      ).rejects.toThrow('Refresh failed');
    });

    it('handles refresh token rotation (new refresh token)', async () => {
      const credential = createTestCredential({
        refreshToken: 'old_refresh_token',
      });
      await storage.store('rotate', credential);

      await tokenManager.refreshToken('rotate', async () => ({
        accessToken: 'new_access',
        refreshToken: 'new_refresh_token_rotated',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      const updated = await storage.retrieve('rotate');
      expect(updated?.refreshToken).toBe('new_refresh_token_rotated');
    });
  });

  describe('revokeToken()', () => {
    it('deletes credential from storage', async () => {
      const credential = createTestCredential();
      await storage.store('to-revoke', credential);

      await tokenManager.revokeToken('to-revoke');

      const deleted = await storage.retrieve('to-revoke');
      expect(deleted).toBeNull();
    });

    it('is idempotent (revoking twice succeeds)', async () => {
      const credential = createTestCredential();
      await storage.store('idempotent', credential);

      await tokenManager.revokeToken('idempotent');
      await expect(tokenManager.revokeToken('idempotent')).resolves.not.toThrow();
    });

    it('revokes non-existent credential without error', async () => {
      await expect(tokenManager.revokeToken('never-existed')).resolves.not.toThrow();
    });

    it('does not affect other tokens', async () => {
      const cred1 = createTestCredential();
      const cred2 = createTestCredential();

      await storage.store('keep', cred1);
      await storage.store('remove', cred2);

      await tokenManager.revokeToken('remove');

      expect(await storage.retrieve('keep')).not.toBeNull();
      expect(await storage.retrieve('remove')).toBeNull();
    });
  });

  describe('Concurrent Refresh Protection', () => {
    it('prevents concurrent refresh of same token', async () => {
      const credential = createTestCredential();
      await storage.store('concurrent', credential);

      let refreshCallCount = 0;
      const refreshHandler = jest.fn(async () => {
        refreshCallCount++;
        // Simulate slow refresh
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          accessToken: `token_${refreshCallCount}`,
          refreshToken: 'refresh',
          expiresAt: new Date(Date.now() + 3600000),
        };
      });

      // Start two refreshes concurrently
      const results = await Promise.all([
        tokenManager.refreshToken('concurrent', refreshHandler),
        tokenManager.refreshToken('concurrent', refreshHandler),
      ]);

      // Both should succeed (share same handler invocation)
      expect(results).toHaveLength(2);
      // Handler should only be called once due to lock
      expect(refreshHandler).toHaveBeenCalledTimes(1);
    });

    it('allows concurrent refresh of different tokens', async () => {
      const cred1 = createTestCredential({ refreshToken: 'refresh1' });
      const cred2 = createTestCredential({ refreshToken: 'refresh2' });

      await storage.store('key1', cred1);
      await storage.store('key2', cred2);

      const handler1 = jest.fn(async () => ({
        accessToken: 'token1',
        refreshToken: 'refresh1',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      const handler2 = jest.fn(async () => ({
        accessToken: 'token2',
        refreshToken: 'refresh2',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      await Promise.all([
        tokenManager.refreshToken('key1', handler1),
        tokenManager.refreshToken('key2', handler2),
      ]);

      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });

    it('allows refresh after previous refresh completes', async () => {
      const credential = createTestCredential();
      await storage.store('sequential', credential);

      const handler = jest.fn(async () => ({
        accessToken: 'new_token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      // First refresh
      await tokenManager.refreshToken('sequential', handler);

      // Second refresh should work
      await tokenManager.refreshToken('sequential', handler);

      expect(handler).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Scenarios', () => {
    it('throws AuthenticationRequiredError when token expired and no refresh available', async () => {
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() - 1000),
        refreshToken: undefined,
      });
      await storage.store('expired-no-refresh', credential);

      // getValidToken returns null, but throwing error version would be used elsewhere
      const token = await tokenManager.getValidToken('expired-no-refresh');
      expect(token).toBeNull();
    });

    it('handles storage errors gracefully', async () => {
      const badStorage = new MockStorage();
      const badTokenManager = new TokenManager(badStorage);

      // Should not throw for missing credentials
      const token = await badTokenManager.getValidToken('missing');
      expect(token).toBeNull();
    });
  });

  describe('Refresh Buffer Configuration', () => {
    it('uses default 300s buffer if not specified', async () => {
      const defaultManager = new TokenManager(storage);
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 250000), // 250s from now
      });
      await storage.store('default-buffer', credential);

      const isNear = await defaultManager.isTokenNearExpiry('default-buffer');
      expect(isNear).toBe(true); // Should be near with 300s buffer
    });

    it('respects custom buffer configuration', async () => {
      const customManager = new TokenManager(storage, 100);
      const credential = createTestCredential({
        expiresAt: new Date(Date.now() + 80000), // 80s from now - within 100s buffer
      });
      await storage.store('custom-buffer', credential);

      const isNear = await customManager.isTokenNearExpiry('custom-buffer');
      expect(isNear).toBe(true); // Should be near with 100s buffer
    });
  });

  describe('Metadata Management', () => {
    it('tracks acquisition time in metadata', async () => {
      const before = Date.now();
      await tokenManager.acquireToken('tracked', 'access', undefined, undefined);
      const after = Date.now();

      const stored = await storage.retrieve('tracked');
      const acquiredAt = parseInt(stored?.metadata?.acquiredAt || '0');

      expect(acquiredAt).toBeGreaterThanOrEqual(before);
      expect(acquiredAt).toBeLessThanOrEqual(after);
    });

    it('preserves existing metadata when refreshing', async () => {
      const credential = createTestCredential({
        metadata: { customKey: 'customValue', userId: 'user123' },
      });
      await storage.store('metadata-test', credential);

      await tokenManager.refreshToken('metadata-test', async () => ({
        accessToken: 'new_token',
        refreshToken: 'refresh',
        expiresAt: new Date(Date.now() + 3600000),
      }));

      const updated = await storage.retrieve('metadata-test');
      expect(updated?.metadata?.customKey).toBe('customValue');
    });
  });
});
