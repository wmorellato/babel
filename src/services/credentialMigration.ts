/**
 * Credential Migration
 * Migrates credentials from legacy plaintext storage to secure VSCode storage
 */

import * as fs from 'fs';
import * as path from 'path';
import { ICredentialStorage, StoredCredential } from './credentialStorage';
import { CredentialError } from '../utils/credentialError';
import { Logger } from '../utils/logger';

const logger = new Logger('CredentialMigration');

/**
 * Legacy token format from plaintext files
 * @internal
 */
interface LegacyToken {
  type: string;
  provider: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scope?: string[];
}

/**
 * Credential Migration
 * Handles detection and migration of legacy plaintext tokens to secure storage
 */
export class CredentialMigration {
  constructor(private storage: ICredentialStorage) {}

  /**
   * Detect if legacy token file exists
   * @param tokenPath - Path to legacy token file
   * @returns true if file exists and is readable
   */
  async detectLegacyTokens(tokenPath: string): Promise<boolean> {
    try {
      if (!tokenPath) {
        return false;
      }

      // Check if file exists
      if (!fs.existsSync(tokenPath)) {
        return false;
      }

      // Try to read to verify accessibility
      fs.accessSync(tokenPath, fs.constants.R_OK);
      return true;
    } catch (error) {
      logger.debug(`Legacy token file not detected: ${tokenPath}`);
      return false;
    }
  }

  /**
   * Validate legacy token format
   * @param token - Token to validate
   * @returns true if token has required fields
   */
  async validateTokenFormat(token: any): Promise<boolean> {
    // Must be an object
    if (typeof token !== 'object' || token === null) {
      return false;
    }

    // Required fields
    if (!token.type || !token.provider || !token.access_token) {
      return false;
    }

    return true;
  }

  /**
   * Migrate tokens from legacy file to secure storage
   * @param tokenPath - Path to legacy token file
   * @param storageKey - Key to store credential under
   * @returns Path to backup file
   * @throws CredentialError if migration fails
   */
  async migrateTokensToSecureStorage(
    tokenPath: string,
    storageKey: string
  ): Promise<string> {
    try {
      // Read legacy token file
      if (!fs.existsSync(tokenPath)) {
        throw new Error(`Legacy token file not found: ${tokenPath}`);
      }

      const content = fs.readFileSync(tokenPath, 'utf-8');
      let legacyToken: LegacyToken;

      try {
        legacyToken = JSON.parse(content);
      } catch {
        throw new Error(`Invalid JSON in legacy token file: ${tokenPath}`);
      }

      // Validate token format
      const isValid = await this.validateTokenFormat(legacyToken);
      if (!isValid) {
        throw new Error(`Invalid token format in: ${tokenPath}`);
      }

      // Create backup
      const backupPath = await this.createBackup(tokenPath);
      logger.info(`Legacy token backed up to: ${backupPath}`);

      // Convert to StoredCredential format
      const credential: StoredCredential = {
        version: '1.0',
        type: legacyToken.type,
        provider: legacyToken.provider,
        accessToken: legacyToken.access_token,
        refreshToken: legacyToken.refresh_token,
        scope: legacyToken.scope,
        expiresAt: legacyToken.expires_at
          ? new Date(legacyToken.expires_at)
          : undefined,
        metadata: {
          migratedAt: Date.now().toString(),
          migratedFrom: tokenPath,
        },
      };

      // Store in secure storage
      await this.storage.store(storageKey, credential);
      logger.info(`Token migrated to secure storage: ${storageKey}`);

      return backupPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to migrate tokens: ${message}`);
      throw new CredentialError(`Failed to migrate tokens: ${message}`);
    }
  }

  /**
   * Create backup of legacy token file
   * @param tokenPath - Path to legacy token file
   * @returns Path to backup file
   * @throws Error if backup fails
   */
  async createBackup(tokenPath: string): Promise<string> {
    try {
      // Read original file
      const content = fs.readFileSync(tokenPath, 'utf-8');

      // Create backup filename with timestamp
      const dir = path.dirname(tokenPath);
      const ext = path.extname(tokenPath);
      const name = path.basename(tokenPath, ext);
      const timestamp = Date.now();
      const backupPath = path.join(dir, `${name}-${timestamp}.backup${ext}`);

      // Write backup
      fs.writeFileSync(backupPath, content);

      return backupPath;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create backup: ${message}`);
    }
  }
}
