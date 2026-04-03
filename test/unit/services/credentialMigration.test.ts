/**
 * Credential Migration Tests
 * Tests migration from legacy plaintext tokens to secure storage
 */

import { CredentialMigration } from '../../../src/services/credentialMigration';
import { ICredentialStorage, StoredCredential } from '../../../src/services/credentialStorage';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Mock credential storage
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

describe('CredentialMigration', () => {
  let tempDir: string;
  let storage: MockStorage;
  let migration: CredentialMigration;

  beforeEach(() => {
    // Create temporary directory for test files
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-migration-'));
    storage = new MockStorage();
    migration = new CredentialMigration(storage);
  });

  afterEach(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  const createLegacyTokenFile = (filePath: string, token: any): void => {
    fs.writeFileSync(filePath, JSON.stringify(token));
  };

  const createValidLegacyToken = (): any => ({
    version: '1.0',
    type: 'oauth2',
    provider: 'google',
    access_token: 'legacy_access_123',
    refresh_token: 'legacy_refresh_456',
    expires_at: new Date(Date.now() + 3600000).toISOString(),
    scope: ['https://www.googleapis.com/auth/drive.file'],
  });

  describe('detectLegacyTokens()', () => {
    it('detects existing legacy token file', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      const exists = await migration.detectLegacyTokens(tokenPath);

      expect(exists).toBe(true);
    });

    it('returns false when legacy file does not exist', async () => {
      const tokenPath = path.join(tempDir, 'non-existent.json');

      const exists = await migration.detectLegacyTokens(tokenPath);

      expect(exists).toBe(false);
    });

    it('returns false for empty path', async () => {
      const exists = await migration.detectLegacyTokens('');

      expect(exists).toBe(false);
    });

    it('handles inaccessible files gracefully', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      // Make file unreadable (Unix only)
      if (process.platform !== 'win32') {
        fs.chmodSync(tokenPath, 0o000);

        const exists = await migration.detectLegacyTokens(tokenPath);

        // Restore permissions for cleanup
        fs.chmodSync(tokenPath, 0o644);

        expect(exists).toBe(false);
      }
    });

    it('detects file even if directory path is different', async () => {
      const tokenPath = path.join(tempDir, 'subdir', 'tokens.json');
      fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      const exists = await migration.detectLegacyTokens(tokenPath);

      expect(exists).toBe(true);
    });
  });

  describe('validateTokenFormat()', () => {
    it('accepts valid legacy token format', async () => {
      const token = createValidLegacyToken();

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(true);
    });

    it('rejects token without access_token', async () => {
      const token = createValidLegacyToken();
      delete token.access_token;

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(false);
    });

    it('rejects token without type', async () => {
      const token = createValidLegacyToken();
      delete token.type;

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(false);
    });

    it('rejects token without provider', async () => {
      const token = createValidLegacyToken();
      delete token.provider;

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(false);
    });

    it('accepts token without refresh_token', async () => {
      const token = createValidLegacyToken();
      delete token.refresh_token;

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(true); // Refresh token is optional
    });

    it('accepts token without expires_at', async () => {
      const token = createValidLegacyToken();
      delete token.expires_at;

      const isValid = await migration.validateTokenFormat(token);

      expect(isValid).toBe(true); // Expiry is optional
    });

    it('rejects null token', async () => {
      const isValid = await migration.validateTokenFormat(null);

      expect(isValid).toBe(false);
    });

    it('rejects non-object token', async () => {
      const isValid = await migration.validateTokenFormat('not-an-object');

      expect(isValid).toBe(false);
    });

    it('rejects empty object', async () => {
      const isValid = await migration.validateTokenFormat({});

      expect(isValid).toBe(false);
    });
  });

  describe('migrateTokensToSecureStorage()', () => {
    it('migrates valid legacy token to storage', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const legacyToken = createValidLegacyToken();
      createLegacyTokenFile(tokenPath, legacyToken);

      await migration.migrateTokensToSecureStorage(tokenPath, 'google-drive');

      const migrated = await storage.retrieve('google-drive');
      expect(migrated).not.toBeNull();
      expect(migrated?.accessToken).toBe('legacy_access_123');
    });

    it('converts legacy token format to StoredCredential format', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const legacyToken = createValidLegacyToken();
      createLegacyTokenFile(tokenPath, legacyToken);

      await migration.migrateTokensToSecureStorage(tokenPath, 'google-drive');

      const migrated = await storage.retrieve('google-drive');
      expect(migrated?.version).toBe('1.0');
      expect(migrated?.type).toBe('oauth2');
      expect(migrated?.provider).toBe('google');
      expect(migrated?.accessToken).toBe('legacy_access_123');
      expect(migrated?.refreshToken).toBe('legacy_refresh_456');
    });

    it('converts expires_at to Date object', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const expiresAt = new Date('2026-12-31T23:59:59Z');
      const legacyToken = createValidLegacyToken();
      legacyToken.expires_at = expiresAt.toISOString();
      createLegacyTokenFile(tokenPath, legacyToken);

      await migration.migrateTokensToSecureStorage(tokenPath, 'test-key');

      const migrated = await storage.retrieve('test-key');
      expect(migrated?.expiresAt).toBeInstanceOf(Date);
      expect(migrated?.expiresAt?.toISOString()).toBe(expiresAt.toISOString());
    });

    it('backups legacy file after migration', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      const backupPath = await migration.migrateTokensToSecureStorage(
        tokenPath,
        'google-drive'
      );

      expect(fs.existsSync(backupPath)).toBe(true);
      expect(backupPath).toContain('.backup');
    });

    it('creates backup file with content', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const legacyToken = createValidLegacyToken();
      createLegacyTokenFile(tokenPath, legacyToken);

      const backupPath = await migration.migrateTokensToSecureStorage(
        tokenPath,
        'google-drive'
      );

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      const backupToken = JSON.parse(backupContent);
      expect(backupToken.access_token).toBe('legacy_access_123');
    });

    it('throws error for invalid token format', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, { invalid: 'token' });

      await expect(
        migration.migrateTokensToSecureStorage(tokenPath, 'google-drive')
      ).rejects.toThrow();
    });

    it('throws error for non-existent file', async () => {
      const tokenPath = path.join(tempDir, 'non-existent.json');

      await expect(
        migration.migrateTokensToSecureStorage(tokenPath, 'google-drive')
      ).rejects.toThrow();
    });

    it('throws error for malformed JSON', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      fs.writeFileSync(tokenPath, 'invalid json {');

      await expect(
        migration.migrateTokensToSecureStorage(tokenPath, 'google-drive')
      ).rejects.toThrow();
    });

    it('handles token without optional fields', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const minimalToken = {
        type: 'oauth2',
        provider: 'google',
        access_token: 'access_only',
      };
      createLegacyTokenFile(tokenPath, minimalToken);

      await migration.migrateTokensToSecureStorage(tokenPath, 'minimal');

      const migrated = await storage.retrieve('minimal');
      expect(migrated?.accessToken).toBe('access_only');
      expect(migrated?.refreshToken).toBeUndefined();
      expect(migrated?.expiresAt).toBeUndefined();
    });

    it('stores with custom key name', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      await migration.migrateTokensToSecureStorage(tokenPath, 'custom-key-name');

      const migrated = await storage.retrieve('custom-key-name');
      expect(migrated).not.toBeNull();
    });
  });

  describe('createBackup()', () => {
    it('creates backup file with .backup extension', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      const backupPath = await migration.createBackup(tokenPath);

      expect(backupPath).toContain('.backup');
      expect(fs.existsSync(backupPath)).toBe(true);
    });

    it('backup contains original file content', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const originalToken = createValidLegacyToken();
      createLegacyTokenFile(tokenPath, originalToken);

      const backupPath = await migration.createBackup(tokenPath);

      const backupContent = fs.readFileSync(backupPath, 'utf-8');
      const backupToken = JSON.parse(backupContent);
      expect(backupToken).toEqual(originalToken);
    });

    it('creates multiple backups with unique names', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      const backup1 = await migration.createBackup(tokenPath);
      // Wait a bit to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));
      const backup2 = await migration.createBackup(tokenPath);

      expect(backup1).not.toBe(backup2);
      expect(fs.existsSync(backup1)).toBe(true);
      expect(fs.existsSync(backup2)).toBe(true);
    });

    it('throws error if file does not exist', async () => {
      const tokenPath = path.join(tempDir, 'non-existent.json');

      await expect(migration.createBackup(tokenPath)).rejects.toThrow();
    });
  });

  describe('Integration Tests', () => {
    it('full migration workflow succeeds', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      const legacyToken = createValidLegacyToken();
      createLegacyTokenFile(tokenPath, legacyToken);

      // Detect
      const exists = await migration.detectLegacyTokens(tokenPath);
      expect(exists).toBe(true);

      // Validate
      const isValid = await migration.validateTokenFormat(legacyToken);
      expect(isValid).toBe(true);

      // Migrate
      const backupPath = await migration.migrateTokensToSecureStorage(
        tokenPath,
        'google-drive'
      );
      expect(fs.existsSync(backupPath)).toBe(true);

      // Verify migration
      const migrated = await storage.retrieve('google-drive');
      expect(migrated?.accessToken).toBe('legacy_access_123');
    });

    it('handles multiple legacy tokens', async () => {
      const googleTokenPath = path.join(tempDir, 'google-tokens.json');
      const oneDriveTokenPath = path.join(tempDir, 'onedrive-tokens.json');

      createLegacyTokenFile(googleTokenPath, createValidLegacyToken());
      const oneDriveToken = createValidLegacyToken();
      oneDriveToken.provider = 'microsoft';
      createLegacyTokenFile(oneDriveTokenPath, oneDriveToken);

      await migration.migrateTokensToSecureStorage(googleTokenPath, 'google-drive');
      await migration.migrateTokensToSecureStorage(oneDriveTokenPath, 'onedrive');

      const google = await storage.retrieve('google-drive');
      const oneDrive = await storage.retrieve('onedrive');

      expect(google?.provider).toBe('google');
      expect(oneDrive?.provider).toBe('microsoft');
    });
  });

  describe('Error Recovery', () => {
    it('handles corrupted backup gracefully', async () => {
      const tokenPath = path.join(tempDir, 'tokens.json');
      createLegacyTokenFile(tokenPath, createValidLegacyToken());

      // Create a spy on createBackup to force it to fail
      const originalCreateBackup = migration.createBackup.bind(migration);
      migration.createBackup = jest.fn().mockRejectedValue(new Error('Backup failed'));

      // Migration should fail if backup fails (backup is required)
      await expect(
        migration.migrateTokensToSecureStorage(tokenPath, 'google-drive')
      ).rejects.toThrow();
    });
  });
});
