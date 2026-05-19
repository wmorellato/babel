/**
 * VSCode SecretStorage Implementation Tests
 * Tests secure credential storage using VSCode's native APIs
 */

import * as vscode from 'vscode';
import { VSCodeSecretStorage, StoredCredential } from '../../../src/services/credentialStorage';

// Mock vscode.SecretStorage
const createMockSecretStorage = (): jest.Mocked<vscode.SecretStorage> => ({
  store: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(undefined),
  delete: jest.fn().mockResolvedValue(undefined),
  keys: jest.fn().mockResolvedValue([]),
  onDidChange: {
    event: jest.fn(),
  } as any,
});

describe('VSCodeSecretStorage', () => {
  let mockSecrets: jest.Mocked<vscode.SecretStorage>;
  let storage: VSCodeSecretStorage;

  beforeEach(() => {
    jest.clearAllMocks();
    mockSecrets = createMockSecretStorage();
    // Smart mock that returns appropriate values based on requested key
    mockSecrets.get.mockImplementation((key: string) => {
      if (key === 'babel:_keys') {
        return Promise.resolve(JSON.stringify([]));
      }
      return Promise.resolve(undefined);
    });
    storage = new VSCodeSecretStorage(mockSecrets);
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
    it('stores credential via VSCode SecretStorage', async () => {
      const credential = createTestCredential();
      await storage.store('google-drive', credential);

      expect(mockSecrets.store).toHaveBeenCalledWith(
        'babel:google-drive',
        expect.any(String)
      );
    });

    it('serializes credential to JSON before storing', async () => {
      const credential = createTestCredential();
      await storage.store('test-key', credential);

      const callArgs = mockSecrets.store.mock.calls[0];
      const storedJson = callArgs[1];
      const parsed = JSON.parse(storedJson);

      // JSON serialization converts Date to ISO string, so check properties
      expect(parsed.version).toEqual(credential.version);
      expect(parsed.type).toEqual(credential.type);
      expect(parsed.provider).toEqual(credential.provider);
      expect(parsed.accessToken).toEqual(credential.accessToken);
      expect(parsed.refreshToken).toEqual(credential.refreshToken);
      expect(parsed.scope).toEqual(credential.scope);
      expect(parsed.metadata).toEqual(credential.metadata);
      // expiresAt is stored as ISO string, not Date
      expect(parsed.expiresAt).toBe(credential.expiresAt?.toISOString());
    });

    it('includes babel prefix in storage key', async () => {
      const credential = createTestCredential();
      await storage.store('my-key', credential);

      expect(mockSecrets.store).toHaveBeenCalledWith('babel:my-key', expect.any(String));
    });

    it('handles credential without refresh token', async () => {
      const credential = createTestCredential({ refreshToken: undefined });
      await storage.store('static', credential);

      const callArgs = mockSecrets.store.mock.calls[0];
      const parsed = JSON.parse(callArgs[1]);
      expect(parsed.refreshToken).toBeUndefined();
    });

    it('handles credential with null metadata', async () => {
      const credential = createTestCredential({ metadata: {} });
      await storage.store('minimal', credential);

      const callArgs = mockSecrets.store.mock.calls[0];
      const parsed = JSON.parse(callArgs[1]);
      expect(parsed.metadata).toEqual({});
    });

    it('preserves Date object as ISO string', async () => {
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      const credential = createTestCredential({ expiresAt });
      await storage.store('date-test', credential);

      const callArgs = mockSecrets.store.mock.calls[0];
      const parsed = JSON.parse(callArgs[1]);
      expect(typeof parsed.expiresAt).toBe('string');
      expect(new Date(parsed.expiresAt)).toEqual(expiresAt);
    });

    it('propagates VSCode API errors', async () => {
      const error = new Error('VSCode storage unavailable');
      mockSecrets.store.mockRejectedValue(error);

      await expect(storage.store('key', createTestCredential())).rejects.toThrow(
        'VSCode storage unavailable'
      );
    });
  });

  describe('retrieve()', () => {
    it('retrieves credential from VSCode SecretStorage', async () => {
      const credential = createTestCredential();
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:google-drive') {
          return Promise.resolve(stored);
        }
        if (key === 'babel:_keys') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(undefined);
      });

      const result = await storage.retrieve('google-drive');

      expect(mockSecrets.get).toHaveBeenCalledWith('babel:google-drive');
      expect(result).toEqual(credential);
    });

    it('returns null when credential not found', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const result = await storage.retrieve('non-existent');

      expect(result).toBeNull();
    });

    it('deserializes stored JSON back to object', async () => {
      const credential = createTestCredential();
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockResolvedValue(stored);

      const result = await storage.retrieve('test-key');

      expect(result).toEqual(credential);
      expect(typeof result?.accessToken).toBe('string');
    });

    it('converts ISO date string back to Date object', async () => {
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      const credential = createTestCredential({ expiresAt });
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:date-test') {
          return Promise.resolve(stored);
        }
        return Promise.resolve(undefined);
      });

      const result = await storage.retrieve('date-test');

      expect(result?.expiresAt).toBeInstanceOf(Date);
      expect(result?.expiresAt).toEqual(expiresAt);
    });

    it('includes babel prefix in retrieval key', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      await storage.retrieve('my-key');

      expect(mockSecrets.get).toHaveBeenCalledWith('babel:my-key');
    });

    it('handles malformed JSON gracefully', async () => {
      mockSecrets.get.mockResolvedValue('invalid-json{');

      await expect(storage.retrieve('bad-json')).rejects.toThrow();
    });

    it('propagates VSCode API errors', async () => {
      const error = new Error('VSCode secrets unavailable');
      mockSecrets.get.mockRejectedValue(error);

      await expect(storage.retrieve('key')).rejects.toThrow('VSCode secrets unavailable');
    });

    it('handles empty string response as null', async () => {
      mockSecrets.get.mockResolvedValue('');

      const result = await storage.retrieve('empty-key');

      expect(result).toBeNull();
    });
  });

  describe('delete()', () => {
    it('deletes credential from VSCode SecretStorage', async () => {
      await storage.delete('google-drive');

      expect(mockSecrets.delete).toHaveBeenCalledWith('babel:google-drive');
    });

    it('includes babel prefix in deletion key', async () => {
      await storage.delete('my-key');

      expect(mockSecrets.delete).toHaveBeenCalledWith('babel:my-key');
    });

    it('is idempotent', async () => {
      mockSecrets.delete.mockResolvedValue(undefined);

      await storage.delete('key1');
      await storage.delete('key1');

      expect(mockSecrets.delete).toHaveBeenCalledTimes(2);
    });

    it('deletes non-existent key without error', async () => {
      mockSecrets.delete.mockResolvedValue(undefined);

      await expect(storage.delete('never-existed')).resolves.toBeUndefined();
    });

    it('propagates VSCode API errors', async () => {
      const error = new Error('Delete failed');
      mockSecrets.delete.mockRejectedValue(error);

      await expect(storage.delete('key')).rejects.toThrow('Delete failed');
    });
  });

  describe('list()', () => {
    it('returns empty array when no keys stored', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const keys = await storage.list();

      expect(keys).toEqual([]);
    });

    it('retrieves key index from special babel:_keys entry', async () => {
      const keyIndex = ['google-drive', 'microsoft-onedrive', 'github'];
      mockSecrets.get.mockResolvedValue(JSON.stringify(keyIndex));

      const keys = await storage.list();

      expect(keys).toEqual(keyIndex);
    });

    it('returns empty array if key index not found', async () => {
      mockSecrets.get.mockResolvedValue(undefined);

      const keys = await storage.list();

      expect(keys).toEqual([]);
    });

    it('handles corrupted key index gracefully', async () => {
      mockSecrets.get.mockResolvedValue('invalid-json');

      // list() catches JSON parse errors and returns empty array
      const result = await storage.list();
      expect(result).toEqual([]);
    });

    it('queries for babel:_keys entry', async () => {
      mockSecrets.get.mockResolvedValue(JSON.stringify([]));

      await storage.list();

      expect(mockSecrets.get).toHaveBeenCalledWith('babel:_keys');
    });
  });

  describe('isMigrationNeeded()', () => {
    it('returns false (VSCode native storage, no migration)', async () => {
      const result = await storage.isMigrationNeeded();
      expect(result).toBe(false);
    });
  });

  describe('migrateFromLegacy()', () => {
    it('copies credential from source to target key', async () => {
      const credential = createTestCredential();
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:old-key') {
          return Promise.resolve(stored);
        }
        if (key === 'babel:_keys') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(undefined);
      });

      await storage.migrateFromLegacy('old-key', 'new-key');

      expect(mockSecrets.get).toHaveBeenCalledWith('babel:old-key');
      expect(mockSecrets.store).toHaveBeenCalledWith('babel:new-key', stored);
    });

    it('handles migration of non-existent source gracefully', async () => {
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:_keys') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(undefined);
      });

      await storage.migrateFromLegacy('non-existent', 'target');

      // store should not be called for the credential, only for key index if at all
      const credentialStores = mockSecrets.store.mock.calls.filter(
        (call) => call[0].startsWith('babel:non-existent') || call[0] === 'babel:target'
      );
      expect(credentialStores).toHaveLength(0);
    });

    it('preserves credential data during migration', async () => {
      const credential = createTestCredential({ provider: 'test' });
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:source') {
          return Promise.resolve(stored);
        }
        if (key === 'babel:_keys') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(undefined);
      });

      await storage.migrateFromLegacy('source', 'target');

      // Find the store call for the migrated credential (not the key index update)
      const credentialStoreCall = mockSecrets.store.mock.calls.find(
        (call) => call[0] === 'babel:target'
      );
      expect(credentialStoreCall).toBeDefined();
      expect(credentialStoreCall![1]).toBe(stored);
    });
  });

  describe('Key management', () => {
    it('prepends babel: to all keys for namespacing', async () => {
      const credential = createTestCredential();
      await storage.store('my-provider', credential);

      const storeCall = mockSecrets.store.mock.calls[0];
      expect(storeCall[0]).toMatch(/^babel:/);
    });

    it('maintains key index on store operations', async () => {
      const credential = createTestCredential();
      mockSecrets.get.mockResolvedValue(JSON.stringify(['existing']));

      await storage.store('new-key', credential);

      // Should update key index
      expect(mockSecrets.store).toHaveBeenCalledWith(
        'babel:_keys',
        expect.any(String)
      );
    });

    it('maintains key index on delete operations', async () => {
      mockSecrets.get.mockResolvedValue(JSON.stringify(['key1', 'key2']));

      await storage.delete('key1');

      // Should update key index to remove key1
      const keyIndexCall = mockSecrets.store.mock.calls.find(
        (call) => call[0] === 'babel:_keys'
      );
      expect(keyIndexCall).toBeDefined();
    });
  });

  describe('Error scenarios', () => {
    it('handles VSCode API becoming unavailable', async () => {
      mockSecrets.store.mockRejectedValue(new Error('VSCode API unavailable'));

      await expect(storage.store('key', createTestCredential())).rejects.toThrow(
        'VSCode API unavailable'
      );
    });

    it('handles quota exceeded errors', async () => {
      mockSecrets.store.mockRejectedValue(new Error('Quota exceeded'));

      await expect(storage.store('key', createTestCredential())).rejects.toThrow(
        'Quota exceeded'
      );
    });

    it('handles concurrent operations safely', async () => {
      mockSecrets.store.mockResolvedValue(undefined);
      // Return different values based on which key is being requested
      mockSecrets.get.mockImplementation((key: string) => {
        if (key === 'babel:_keys') {
          return Promise.resolve(JSON.stringify([]));
        }
        return Promise.resolve(JSON.stringify(createTestCredential()));
      });

      const cred = createTestCredential();
      await Promise.all([
        storage.store('key1', cred),
        storage.store('key2', cred),
        storage.retrieve('key1'),
      ]);

      // store calls: key1, key2, plus key index updates
      expect(mockSecrets.store).toHaveBeenCalled();
    });
  });

  describe('Compatibility and Format Versioning', () => {
    it('handles version 1.0 credentials', async () => {
      const credential = createTestCredential({ version: '1.0' });
      const stored = JSON.stringify(credential);
      mockSecrets.get.mockResolvedValue(stored);

      const result = await storage.retrieve('test');

      expect(result?.version).toBe('1.0');
    });

    it('stores credentials with current version format', async () => {
      const credential = createTestCredential();
      await storage.store('test', credential);

      const storeCall = mockSecrets.store.mock.calls[0];
      const stored = JSON.parse(storeCall[1]);
      expect(stored.version).toBe('1.0');
    });
  });
});
