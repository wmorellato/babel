/**
 * Credential Storage Interface Tests
 * Tests the contract for all credential storage implementations
 */

import { StoredCredential, ICredentialStorage } from '../../../src/services/credentialStorage';

/**
 * Test helper: In-memory implementation for testing the interface contract
 */
class TestMemoryStorage implements ICredentialStorage {
  private credentials: Map<string, StoredCredential> = new Map();
  private deletedKeys: Set<string> = new Set();

  async store(key: string, credential: StoredCredential): Promise<void> {
    this.credentials.set(key, credential);
    this.deletedKeys.delete(key);
  }

  async retrieve(key: string): Promise<StoredCredential | null> {
    return this.credentials.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.deletedKeys.add(key);
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

describe('ICredentialStorage Interface Contract', () => {
  let storage: ICredentialStorage;

  beforeEach(() => {
    storage = new TestMemoryStorage();
  });

  const createTestCredential = (overrides = {}): StoredCredential => ({
    version: '1.0',
    type: 'oauth2',
    provider: 'google',
    accessToken: 'access_token_123',
    refreshToken: 'refresh_token_456',
    expiresAt: new Date(Date.now() + 3600000),
    scope: ['https://www.googleapis.com/auth/drive.file'],
    metadata: { userId: 'user123' },
    ...overrides,
  });

  describe('store()', () => {
    it('stores credential successfully', async () => {
      const credential = createTestCredential();
      await storage.store('google-drive', credential);

      const retrieved = await storage.retrieve('google-drive');
      expect(retrieved).toEqual(credential);
    });

    it('overwrites existing credential with same key', async () => {
      const cred1 = createTestCredential({ accessToken: 'token1' });
      const cred2 = createTestCredential({ accessToken: 'token2' });

      await storage.store('google-drive', cred1);
      await storage.store('google-drive', cred2);

      const retrieved = await storage.retrieve('google-drive');
      expect(retrieved?.accessToken).toBe('token2');
    });

    it('stores credential without optional refresh token', async () => {
      const credential = createTestCredential({ refreshToken: undefined });
      await storage.store('api-key', credential);

      const retrieved = await storage.retrieve('api-key');
      expect(retrieved).toEqual(credential);
      expect(retrieved?.refreshToken).toBeUndefined();
    });

    it('stores credential without optional expiry', async () => {
      const credential = createTestCredential({ expiresAt: undefined });
      await storage.store('static-token', credential);

      const retrieved = await storage.retrieve('static-token');
      expect(retrieved?.expiresAt).toBeUndefined();
    });

    it('stores credential with empty metadata', async () => {
      const credential = createTestCredential({ metadata: {} });
      await storage.store('minimal', credential);

      const retrieved = await storage.retrieve('minimal');
      expect(retrieved?.metadata).toEqual({});
    });

    it('clears deletion marker when overwriting deleted credential', async () => {
      const credential = createTestCredential();
      await storage.store('key1', credential);
      await storage.delete('key1');
      await storage.store('key1', credential);

      const retrieved = await storage.retrieve('key1');
      expect(retrieved).not.toBeNull();
    });
  });

  describe('retrieve()', () => {
    it('returns null for non-existent key', async () => {
      const result = await storage.retrieve('non-existent');
      expect(result).toBeNull();
    });

    it('returns stored credential unchanged', async () => {
      const credential = createTestCredential();
      await storage.store('test-key', credential);

      const retrieved = await storage.retrieve('test-key');
      expect(retrieved).toEqual(credential);
    });

    it('returns same object reference (no deep copy)', async () => {
      const credential = createTestCredential();
      await storage.store('ref-test', credential);

      const retrieved1 = await storage.retrieve('ref-test');
      const retrieved2 = await storage.retrieve('ref-test');
      expect(retrieved1).toBe(retrieved2);
    });

    it('preserves Date objects in credential', async () => {
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      const credential = createTestCredential({ expiresAt });
      await storage.store('date-test', credential);

      const retrieved = await storage.retrieve('date-test');
      expect(retrieved?.expiresAt).toEqual(expiresAt);
      expect(retrieved?.expiresAt).toBeInstanceOf(Date);
    });

    it('handles multiple credentials independently', async () => {
      const cred1 = createTestCredential({ provider: 'google', accessToken: 'token1' });
      const cred2 = createTestCredential({ provider: 'microsoft', accessToken: 'token2' });

      await storage.store('google', cred1);
      await storage.store('microsoft', cred2);

      expect(await storage.retrieve('google')).toEqual(cred1);
      expect(await storage.retrieve('microsoft')).toEqual(cred2);
    });
  });

  describe('delete()', () => {
    it('removes stored credential', async () => {
      const credential = createTestCredential();
      await storage.store('delete-test', credential);
      await storage.delete('delete-test');

      const retrieved = await storage.retrieve('delete-test');
      expect(retrieved).toBeNull();
    });

    it('is idempotent (deleting twice succeeds)', async () => {
      const credential = createTestCredential();
      await storage.store('idempotent', credential);

      await storage.delete('idempotent');
      expect(await storage.retrieve('idempotent')).toBeNull();

      // Second delete should not throw
      await expect(storage.delete('idempotent')).resolves.toBeUndefined();
    });

    it('deletes non-existent key without error', async () => {
      await expect(storage.delete('never-existed')).resolves.toBeUndefined();
    });

    it('does not affect other credentials', async () => {
      const cred1 = createTestCredential({ provider: 'google' });
      const cred2 = createTestCredential({ provider: 'microsoft' });

      await storage.store('key1', cred1);
      await storage.store('key2', cred2);
      await storage.delete('key1');

      expect(await storage.retrieve('key1')).toBeNull();
      expect(await storage.retrieve('key2')).toEqual(cred2);
    });
  });

  describe('list()', () => {
    it('returns empty array when no credentials stored', async () => {
      const keys = await storage.list();
      expect(keys).toEqual([]);
    });

    it('returns all stored credential keys', async () => {
      await storage.store('google', createTestCredential());
      await storage.store('microsoft', createTestCredential());
      await storage.store('github', createTestCredential());

      const keys = await storage.list();
      expect(keys).toContainEqual('google');
      expect(keys).toContainEqual('microsoft');
      expect(keys).toContainEqual('github');
      expect(keys.length).toBe(3);
    });

    it('excludes deleted credentials from list', async () => {
      await storage.store('keep', createTestCredential());
      await storage.store('remove', createTestCredential());
      await storage.delete('remove');

      const keys = await storage.list();
      expect(keys).toContainEqual('keep');
      expect(keys).not.toContainEqual('remove');
    });

    it('returns updated list after delete', async () => {
      await storage.store('key1', createTestCredential());
      let keys = await storage.list();
      expect(keys).toHaveLength(1);

      await storage.delete('key1');
      keys = await storage.list();
      expect(keys).toHaveLength(0);
    });

    it('returns list after overwriting credential', async () => {
      await storage.store('key1', createTestCredential());
      await storage.store('key1', createTestCredential({ accessToken: 'updated' }));

      const keys = await storage.list();
      expect(keys).toEqual(['key1']);
      expect(keys.length).toBe(1);
    });
  });

  describe('isMigrationNeeded()', () => {
    it('returns boolean', async () => {
      const result = await storage.isMigrationNeeded();
      expect(typeof result).toBe('boolean');
    });

    it('returns false when no migration needed', async () => {
      const result = await storage.isMigrationNeeded();
      expect(result).toBe(false);
    });
  });

  describe('migrateFromLegacy()', () => {
    it('copies credential from source key to target key', async () => {
      const credential = createTestCredential();
      await storage.store('legacy-key', credential);

      await storage.migrateFromLegacy('legacy-key', 'new-key');

      const migrated = await storage.retrieve('new-key');
      expect(migrated).toEqual(credential);
    });

    it('preserves source credential after migration', async () => {
      const credential = createTestCredential();
      await storage.store('old', credential);

      await storage.migrateFromLegacy('old', 'new');

      expect(await storage.retrieve('old')).toEqual(credential);
    });

    it('handles migration of non-existent source gracefully', async () => {
      await expect(
        storage.migrateFromLegacy('non-existent', 'target')
      ).resolves.toBeUndefined();

      const result = await storage.retrieve('target');
      expect(result).toBeNull();
    });

    it('overwrites existing target credential during migration', async () => {
      const oldCred = createTestCredential({ accessToken: 'old' });
      const newCred = createTestCredential({ accessToken: 'new' });

      await storage.store('source', oldCred);
      await storage.store('target', newCred);

      await storage.migrateFromLegacy('source', 'target');

      const result = await storage.retrieve('target');
      expect(result?.accessToken).toBe('old');
    });
  });

  describe('StoredCredential format', () => {
    it('requires version field', async () => {
      const credential = createTestCredential();
      expect(credential).toHaveProperty('version');
      expect(credential.version).toBe('1.0');
    });

    it('requires type field', async () => {
      const credential = createTestCredential();
      expect(credential).toHaveProperty('type');
    });

    it('requires provider field', async () => {
      const credential = createTestCredential();
      expect(credential).toHaveProperty('provider');
    });

    it('requires accessToken field', async () => {
      const credential = createTestCredential();
      expect(credential).toHaveProperty('accessToken');
      expect(typeof credential.accessToken).toBe('string');
    });

    it('has optional refreshToken field', async () => {
      const withRefresh = createTestCredential({ refreshToken: 'refresh' });
      const withoutRefresh = createTestCredential({ refreshToken: undefined });

      expect(withRefresh.refreshToken).toBe('refresh');
      expect(withoutRefresh.refreshToken).toBeUndefined();
    });

    it('has optional expiresAt field', async () => {
      const withExpiry = createTestCredential({ expiresAt: new Date() });
      const withoutExpiry = createTestCredential({ expiresAt: undefined });

      expect(withExpiry.expiresAt).toBeInstanceOf(Date);
      expect(withoutExpiry.expiresAt).toBeUndefined();
    });

    it('has optional scope array', async () => {
      const withScope = createTestCredential({ scope: ['scope1', 'scope2'] });
      const withoutScope = createTestCredential({ scope: undefined });

      expect(Array.isArray(withScope.scope)).toBe(true);
      expect(withoutScope.scope).toBeUndefined();
    });

    it('has optional metadata object', async () => {
      const withMetadata = createTestCredential({ metadata: { key: 'value' } });
      const withoutMetadata = createTestCredential({ metadata: undefined });

      expect(typeof withMetadata.metadata).toBe('object');
      expect(withoutMetadata.metadata).toBeUndefined();
    });
  });
});
