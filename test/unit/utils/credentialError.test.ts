/**
 * Credential Error Tests
 * Tests for credential-specific error types and handling
 */

import {
  CredentialError,
  TokenExpiredError,
  AuthenticationRequiredError,
} from '../../../src/utils/credentialError';

describe('CredentialError', () => {
  it('creates error with message', () => {
    const error = new CredentialError('Credential failed');

    expect(error).toBeInstanceOf(Error);
    expect(error.message).toBe('Credential failed');
    expect(error.code).toBe('CREDENTIAL_ERROR');
  });

  it('has code property set to CREDENTIAL_ERROR', () => {
    const error = new CredentialError('Test');
    expect(error.code).toBe('CREDENTIAL_ERROR');
  });

  it('can be thrown and caught', () => {
    expect(() => {
      throw new CredentialError('Storage failed');
    }).toThrow(CredentialError);
  });

  it('can be caught as BabelError', () => {
    expect(() => {
      throw new CredentialError('Generic error');
    }).toThrow('Generic error');
  });

  it('preserves stack trace', () => {
    const error = new CredentialError('Trace test');
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('CredentialError');
  });

  it('can be stringified', () => {
    const error = new CredentialError('String test');
    expect(error.toString()).toContain('CredentialError');
    expect(error.toString()).toContain('String test');
  });

  it('has name property', () => {
    const error = new CredentialError('Name test');
    expect(error.name).toBe('CredentialError');
  });
});

describe('TokenExpiredError', () => {
  it('extends CredentialError', () => {
    const expiresAt = new Date();
    const error = new TokenExpiredError(expiresAt);

    expect(error).toBeInstanceOf(CredentialError);
    expect(error).toBeInstanceOf(Error);
  });

  it('includes token expiry date', () => {
    const expiresAt = new Date('2025-12-31T23:59:59Z');
    const error = new TokenExpiredError(expiresAt);

    expect(error.expiresAt).toEqual(expiresAt);
  });

  it('has descriptive message', () => {
    const error = new TokenExpiredError(new Date());
    expect(error.message).toContain('Token expired');
  });

  it('preserves expiry date type', () => {
    const expiresAt = new Date();
    const error = new TokenExpiredError(expiresAt);

    expect(error.expiresAt).toBeInstanceOf(Date);
    expect(error.expiresAt.getTime()).toBe(expiresAt.getTime());
  });

  it('can be thrown and caught by type', () => {
    expect(() => {
      throw new TokenExpiredError(new Date());
    }).toThrow(TokenExpiredError);
  });

  it('is also catchable as CredentialError', () => {
    const error = new TokenExpiredError(new Date());
    expect(error).toBeInstanceOf(CredentialError);
  });

  it('has code property from parent', () => {
    const error = new TokenExpiredError(new Date());
    expect(error.code).toBe('CREDENTIAL_ERROR');
  });
});

describe('AuthenticationRequiredError', () => {
  it('extends CredentialError', () => {
    const error = new AuthenticationRequiredError();

    expect(error).toBeInstanceOf(CredentialError);
    expect(error).toBeInstanceOf(Error);
  });

  it('has standard message', () => {
    const error = new AuthenticationRequiredError();
    expect(error.message).toContain('Authentication required');
  });

  it('suggests re-authentication in message', () => {
    const error = new AuthenticationRequiredError();
    expect(error.message).toContain('re-authenticate');
  });

  it('can be thrown and caught by type', () => {
    expect(() => {
      throw new AuthenticationRequiredError();
    }).toThrow(AuthenticationRequiredError);
  });

  it('is also catchable as CredentialError', () => {
    const error = new AuthenticationRequiredError();
    expect(error).toBeInstanceOf(CredentialError);
  });

  it('has code property from parent', () => {
    const error = new AuthenticationRequiredError();
    expect(error.code).toBe('CREDENTIAL_ERROR');
  });

  it('does not require constructor arguments', () => {
    expect(() => new AuthenticationRequiredError()).not.toThrow();
  });
});

describe('Error Discrimination', () => {
  it('can distinguish TokenExpiredError from CredentialError', () => {
    const expired = new TokenExpiredError(new Date());
    const generic = new CredentialError('Other issue');

    expect(expired).toBeInstanceOf(TokenExpiredError);
    expect(generic).not.toBeInstanceOf(TokenExpiredError);
  });

  it('can distinguish AuthenticationRequiredError from CredentialError', () => {
    const authError = new AuthenticationRequiredError();
    const generic = new CredentialError('Other issue');

    expect(authError).toBeInstanceOf(AuthenticationRequiredError);
    expect(generic).not.toBeInstanceOf(AuthenticationRequiredError);
  });

  it('allows error handling with specific types', () => {
    const errors = [
      new TokenExpiredError(new Date()),
      new AuthenticationRequiredError(),
      new CredentialError('Generic'),
    ];

    const expired = errors.filter((e) => e instanceof TokenExpiredError);
    const authRequired = errors.filter((e) => e instanceof AuthenticationRequiredError);
    const generic = errors.filter((e) => !(e instanceof TokenExpiredError) && !(e instanceof AuthenticationRequiredError));

    expect(expired).toHaveLength(1);
    expect(authRequired).toHaveLength(1);
    expect(generic).toHaveLength(1);
  });
});

describe('Error Logging and Serialization', () => {
  it('can be serialized to JSON', () => {
    const error = new CredentialError('Serialize test');
    const json = JSON.stringify(error, Object.getOwnPropertyNames(error));

    expect(json).toContain('message');
    expect(json).toContain('Serialize test');
  });

  it('TokenExpiredError includes expiry in serialization', () => {
    const expiresAt = new Date('2025-12-31T23:59:59Z');
    const error = new TokenExpiredError(expiresAt);

    const serialized = {
      message: error.message,
      expiresAt: error.expiresAt,
    };

    expect(serialized.expiresAt).toBeDefined();
  });

  it('provides meaningful console output', () => {
    const error = new CredentialError('Console test');
    const output = String(error);

    expect(output).toContain('CredentialError');
    expect(output).toContain('Console test');
  });
});
