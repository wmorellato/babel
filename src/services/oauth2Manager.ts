/**
 * OAuth2 Manager
 * Abstracts OAuth2 authorization flow for multiple providers
 */

import { CredentialError } from '../utils/credentialError';
import { Logger } from '../utils/logger';

const logger = new Logger('OAuth2Manager');

/**
 * OAuth2 configuration
 */
export interface OAuth2Config {
  clientId: string;
  redirectUri: string;
}

/**
 * Token data returned from OAuth2 flow
 */
export interface OAuth2Token {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: Date;
}

/**
 * Google API client interface
 * @internal
 */
interface GoogleAPIClient {
  OAuth2: any;
}

/**
 * OAuth2Client interface
 * @internal
 */
interface OAuth2ClientInstance {
  generateAuthUrl(options: any): string;
  getToken(code: string): Promise<{ tokens: any }>;
  setCredentials(credentials: any): void;
  refreshAccessToken(): Promise<{ credentials: any }>;
}

/**
 * OAuth2 Manager
 * Handles OAuth2 authorization code flow and token refresh
 */
export class OAuth2Manager {
  private oauth2Client: OAuth2ClientInstance;

  constructor(
    private config: OAuth2Config,
    private google: GoogleAPIClient
  ) {
    this.oauth2Client = new google.OAuth2(
      config.clientId,
      config.redirectUri
    );
  }

  /**
   * Generate OAuth2 authorization URL
   * @param scopes - Array of OAuth2 scopes to request
   * @returns Authorization URL for user to visit
   */
  generateAuthorizationUrl(scopes: string[]): string {
    return this.oauth2Client.generateAuthUrl({
      access_type: 'offline', // Request refresh token
      scope: scopes,
    });
  }

  /**
   * Exchange authorization code for access and refresh tokens
   * @param code - Authorization code from OAuth2 provider
   * @returns Token data with access token, optional refresh token, and expiry
   * @throws CredentialError if code exchange fails
   */
  async handleAuthorizationCode(code: string): Promise<OAuth2Token> {
    try {
      if (!code) {
        throw new Error('Authorization code is required');
      }

      const { tokens } = await this.oauth2Client.getToken(code);

      return this.parseTokenResponse(tokens);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to handle authorization code: ${message}`);
      throw new CredentialError(`OAuth2 authorization failed: ${message}`);
    }
  }

  /**
   * Refresh access token using refresh token
   * @param refreshToken - OAuth2 refresh token
   * @returns New token data with fresh access token
   * @throws CredentialError if refresh fails
   */
  async refreshAccessToken(refreshToken: string): Promise<OAuth2Token> {
    try {
      // Set refresh token on the client
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      // Request new access token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      return this.parseTokenResponse(credentials);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to refresh access token: ${message}`);
      throw new CredentialError(`OAuth2 token refresh failed: ${message}`);
    }
  }

  /**
   * Parse token response and extract relevant fields
   * @private
   */
  private parseTokenResponse(tokenData: any): OAuth2Token {
    const token: OAuth2Token = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
    };

    // Calculate expiry time if expires_in provided
    if (tokenData.expires_in) {
      const expiresInMs = tokenData.expires_in * 1000;
      token.expiresAt = new Date(Date.now() + expiresInMs);
    }

    return token;
  }
}
