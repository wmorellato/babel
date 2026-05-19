/**
 * Token Manager
 * Manages token lifecycle: acquisition, refresh, expiry detection, and revocation
 */

import { ICredentialStorage, StoredCredential } from './credentialStorage';
import { CredentialError } from '../utils/credentialError';
import { Logger } from '../utils/logger';

const logger = new Logger('TokenManager');

/**
 * Refresh handler callback
 * Called when token needs to be refreshed
 * @param refreshToken - Current refresh token
 * @returns New token data
 */
export type RefreshHandler = (refreshToken: string) => Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}>;

/**
 * Token Manager
 * Handles token lifecycle management with automatic refresh and expiry detection
 */
export class TokenManager {
  private refreshPromises: Map<string, Promise<void>> = new Map();
  private readonly refreshBufferSeconds: number;

  constructor(
    private storage: ICredentialStorage,
    refreshBufferSeconds: number = 300
  ) {
    this.refreshBufferSeconds = refreshBufferSeconds;
  }

  /**
   * Acquire new token credentials
   * @param key - Storage key for the credential
   * @param accessToken - OAuth2 access token or API key
   * @param refreshToken - Optional OAuth2 refresh token
   * @param expiresAt - Optional token expiration time
   */
  async acquireToken(
    key: string,
    accessToken: string,
    refreshToken?: string,
    expiresAt?: Date
  ): Promise<void> {
    const credential: StoredCredential = {
      version: '1.0',
      type: 'oauth2',
      provider: key.split('-')[0], // Extract provider from key
      accessToken,
      refreshToken,
      expiresAt,
      metadata: {
        acquiredAt: Date.now().toString(),
      },
    };

    await this.storage.store(key, credential);
    logger.debug(`Token acquired for key: ${key}`);
  }

  /**
   * Get a valid access token, auto-refreshing if expired.
   * Returns null if no token exists, or if it is expired and refresh fails.
   * @param key - Credential key
   * @param refreshHandler - Optional handler to exchange a refresh token for a new access token
   * @returns Access token or null
   */
  async getValidToken(key: string, refreshHandler?: RefreshHandler): Promise<string | null> {
    const credential = await this.storage.retrieve(key);

    if (!credential) {
      return null;
    }

    if (this.isExpired(credential)) {
      if (!credential.refreshToken || !refreshHandler) {
        logger.warn(`Token expired and cannot be refreshed: ${key}`);
        return null;
      }
      try {
        await this.refreshToken(key, refreshHandler);
        const refreshed = await this.storage.retrieve(key);
        return refreshed?.accessToken ?? null;
      } catch (error) {
        logger.warn(`Token refresh failed for: ${key}`);
        return null;
      }
    }

    return credential.accessToken;
  }

  /**
   * Check if token is past its expiry time
   * @param key - Credential key
   * @returns true if expired
   */
  async isTokenExpired(key: string): Promise<boolean> {
    const credential = await this.storage.retrieve(key);

    if (!credential) {
      return false;
    }

    return this.isExpired(credential);
  }

  /**
   * Check if token is near expiry (within refresh buffer)
   * @param key - Credential key
   * @returns true if near expiry
   */
  async isTokenNearExpiry(key: string): Promise<boolean> {
    const credential = await this.storage.retrieve(key);

    if (!credential) {
      return false;
    }

    return this.isNearExpiry(credential);
  }

  /**
   * Refresh an access token using a refresh token
   * Implements concurrent refresh protection (only one refresh per key at a time)
   * @param key - Credential key
   * @param refreshHandler - Callback to exchange refresh token for new access token
   */
  async refreshToken(key: string, refreshHandler: RefreshHandler): Promise<void> {
    const credential = await this.storage.retrieve(key);

    if (!credential) {
      throw new CredentialError(`Credential not found: ${key}`);
    }

    if (!credential.refreshToken) {
      throw new CredentialError(`No refresh token available for: ${key}`);
    }

    // Check if refresh already in progress for this key
    const existingRefresh = this.refreshPromises.get(key);
    if (existingRefresh) {
      logger.debug(`Refresh already in progress for: ${key}`);
      return existingRefresh;
    }

    // Create refresh promise and store it
    const refreshPromise = (async () => {
      try {
        logger.debug(`Refreshing token for: ${key}`);

        // Call refresh handler
        const newTokenData = await refreshHandler(credential.refreshToken!);

        // Update credential with new tokens
        const updated: StoredCredential = {
          ...credential,
          accessToken: newTokenData.accessToken,
          refreshToken: newTokenData.refreshToken ?? credential.refreshToken,
          expiresAt: newTokenData.expiresAt,
          metadata: {
            ...credential.metadata,
            refreshedAt: Date.now().toString(),
          },
        };

        await this.storage.store(key, updated);
        logger.debug(`Token refreshed for: ${key}`);
      } catch (error) {
        logger.error(`Failed to refresh token for: ${key}`, error as Error);
        throw error;
      } finally {
        // Remove from in-progress map
        this.refreshPromises.delete(key);
      }
    })();

    this.refreshPromises.set(key, refreshPromise);

    return refreshPromise;
  }

  /**
   * Revoke a token (delete from storage)
   * @param key - Credential key
   */
  async revokeToken(key: string): Promise<void> {
    await this.storage.delete(key);
    this.refreshPromises.delete(key); // Clear any in-progress refresh
    logger.debug(`Token revoked for: ${key}`);
  }

  /**
   * Check if a credential is expired
   * @private
   */
  private isExpired(credential: StoredCredential): boolean {
    if (!credential.expiresAt) {
      return false; // No expiry means never expires
    }

    return credential.expiresAt.getTime() < Date.now();
  }

  /**
   * Check if a credential is near expiry (within refresh buffer)
   * @private
   */
  private isNearExpiry(credential: StoredCredential): boolean {
    if (!credential.expiresAt) {
      return false; // No expiry means never expires
    }

    const bufferMs = this.refreshBufferSeconds * 1000;
    const expiryThreshold = credential.expiresAt.getTime() - bufferMs;

    return Date.now() > expiryThreshold;
  }
}
