/**
 * Error handling utilities
 */

export class BabelError extends Error {
  constructor(message: string, public code: string = 'UNKNOWN_ERROR') {
    super(message);
    this.name = 'BabelError';
  }
}

export class DatabaseError extends BabelError {
  constructor(message: string) {
    super(message, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

export class GitError extends BabelError {
  constructor(message: string) {
    super(message, 'GIT_ERROR');
    this.name = 'GitError';
  }
}

export class ValidationError extends BabelError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class BackupError extends BabelError {
  constructor(message: string) {
    super(message, 'BACKUP_ERROR');
    this.name = 'BackupError';
  }
}

export function handleError(error: unknown, context: string): never {
  if (error instanceof BabelError) {
    throw error;
  }

  if (error instanceof Error) {
    throw new BabelError(`${context}: ${error.message}`);
  }

  throw new BabelError(`${context}: Unknown error`);
}
