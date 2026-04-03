/**
 * Credential-Specific Error Types
 * Used for credential storage, OAuth2, and token management
 */

import { BabelError } from './errorHandler';

/**
 * Base credential error
 * Used for all credential storage and OAuth2 related failures
 */
export class CredentialError extends BabelError {
  name = 'CredentialError';

  constructor(message: string) {
    super(message, 'CREDENTIAL_ERROR');
    Object.setPrototypeOf(this, CredentialError.prototype);
  }
}

/**
 * Token expiration error
 * Indicates an OAuth2 token has expired
 */
export class TokenExpiredError extends CredentialError {
  name = 'TokenExpiredError';

  constructor(public readonly expiresAt: Date) {
    super('Token expired');
    Object.setPrototypeOf(this, TokenExpiredError.prototype);
  }
}

/**
 * Authentication required error
 * Indicates the user needs to re-authenticate
 */
export class AuthenticationRequiredError extends CredentialError {
  name = 'AuthenticationRequiredError';

  constructor() {
    super('Authentication required - please re-authenticate');
    Object.setPrototypeOf(this, AuthenticationRequiredError.prototype);
  }
}
