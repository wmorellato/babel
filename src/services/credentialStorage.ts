/**
 * Credential Storage Abstraction
 * Defines the contract for secure credential storage implementations
 */

import * as vscode from 'vscode';

/**
 * Stored credential format with version tracking
 */
export interface StoredCredential {
  /** Format version for future compatibility */
  version: '1.0';

  /** Credential type (oauth2, api-key, etc.) */
  type: string;

  /** Provider name (google, microsoft, github, etc.) */
  provider: string;

  /** OAuth2 access token or API key */
  accessToken: string;

  /** OAuth2 refresh token (optional, for long-lived credentials) */
  refreshToken?: string;

  /** Token expiration time (optional) */
  expiresAt?: Date;

  /** OAuth2 scopes or permission list (optional) */
  scope?: string[];

  /** Provider-specific metadata (optional) */
  metadata?: Record<string, string>;
}

/**
 * Credential storage interface
 * Implemented by secure storage backends (VSCode, local encrypted, etc.)
 */
export interface ICredentialStorage {
  /**
   * Store a credential securely
   * @param key - Storage key (e.g., 'google-drive', 'microsoft-onedrive')
   * @param credential - Credential to store
   */
  store(key: string, credential: StoredCredential): Promise<void>;

  /**
   * Retrieve a stored credential
   * @param key - Storage key
   * @returns Credential or null if not found
   */
  retrieve(key: string): Promise<StoredCredential | null>;

  /**
   * Delete a stored credential
   * @param key - Storage key
   */
  delete(key: string): Promise<void>;

  /**
   * List all stored credential keys
   * @returns Array of keys
   */
  list(): Promise<string[]>;

  /**
   * Check if migration from legacy storage is needed
   * @returns true if legacy tokens exist
   */
  isMigrationNeeded(): Promise<boolean>;

  /**
   * Migrate credential from legacy storage to secure storage
   * @param sourceKey - Legacy key
   * @param targetKey - New secure key
   */
  migrateFromLegacy(sourceKey: string, targetKey: string): Promise<void>;
}

/**
 * VSCode SecretStorage implementation
 * Uses OS-native encryption (Keychain, Credential Manager, Secret Service)
 */
export class VSCodeSecretStorage implements ICredentialStorage {
  private keyIndexKey = 'babel:_keys';

  constructor(private secrets: vscode.SecretStorage) {}

  async store(key: string, credential: StoredCredential): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    const serialized = this.serializeCredential(credential);

    await this.secrets.store(prefixedKey, serialized);
    await this.updateKeyIndex(key, 'add');
  }

  async retrieve(key: string): Promise<StoredCredential | null> {
    const prefixedKey = this.prefixKey(key);
    const serialized = await this.secrets.get(prefixedKey);

    if (!serialized) {
      return null;
    }

    return this.deserializeCredential(serialized);
  }

  async delete(key: string): Promise<void> {
    const prefixedKey = this.prefixKey(key);
    await this.secrets.delete(prefixedKey);
    await this.updateKeyIndex(key, 'remove');
  }

  async list(): Promise<string[]> {
    const indexSerialized = await this.secrets.get(this.keyIndexKey);

    if (!indexSerialized) {
      return [];
    }

    try {
      return JSON.parse(indexSerialized);
    } catch {
      return [];
    }
  }

  async isMigrationNeeded(): Promise<boolean> {
    return false; // VSCode native storage, no migration needed
  }

  async migrateFromLegacy(sourceKey: string, targetKey: string): Promise<void> {
    const sourcePrefixedKey = this.prefixKey(sourceKey);
    const serialized = await this.secrets.get(sourcePrefixedKey);

    if (!serialized) {
      return;
    }

    const targetPrefixedKey = this.prefixKey(targetKey);
    await this.secrets.store(targetPrefixedKey, serialized);
    await this.updateKeyIndex(targetKey, 'add');
  }

  /**
   * Serialize credential to JSON string for storage
   */
  private serializeCredential(credential: StoredCredential): string {
    return JSON.stringify(credential, (key, value) => {
      // Convert Date objects to ISO strings
      if (value instanceof Date) {
        return value.toISOString();
      }
      return value;
    });
  }

  /**
   * Deserialize JSON string to credential object
   */
  private deserializeCredential(serialized: string): StoredCredential {
    const parsed = JSON.parse(serialized);

    // Convert ISO strings back to Date objects
    if (parsed.expiresAt && typeof parsed.expiresAt === 'string') {
      parsed.expiresAt = new Date(parsed.expiresAt);
    }

    return parsed as StoredCredential;
  }

  /**
   * Add babel: prefix to key for namespacing
   */
  private prefixKey(key: string): string {
    return `babel:${key}`;
  }

  /**
   * Update key index for list() operations
   */
  private async updateKeyIndex(key: string, operation: 'add' | 'remove'): Promise<void> {
    const indexSerialized = await this.secrets.get(this.keyIndexKey);
    let keys: string[] = [];

    if (indexSerialized) {
      try {
        keys = JSON.parse(indexSerialized);
      } catch {
        keys = [];
      }
    }

    if (operation === 'add') {
      if (!keys.includes(key)) {
        keys.push(key);
      }
    } else if (operation === 'remove') {
      keys = keys.filter((k) => k !== key);
    }

    await this.secrets.store(this.keyIndexKey, JSON.stringify(keys));
  }
}
