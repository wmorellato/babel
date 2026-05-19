/**
 * Error handler utility tests
 */

import {
  BabelError,
  DatabaseError,
  GitError,
  ValidationError,
  handleError,
} from '../../../src/utils/errorHandler';

describe('Error Handling', () => {
  describe('BabelError', () => {
    it('should create error with message and code', () => {
      const error = new BabelError('test message', 'TEST_CODE');

      expect(error.message).toBe('test message');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('BabelError');
    });

    it('should use default code if not provided', () => {
      const error = new BabelError('test message');

      expect(error.code).toBe('UNKNOWN_ERROR');
    });
  });

  describe('DatabaseError', () => {
    it('should create database error with correct code', () => {
      const error = new DatabaseError('db failed');

      expect(error.message).toBe('db failed');
      expect(error.code).toBe('DATABASE_ERROR');
      expect(error.name).toBe('DatabaseError');
    });
  });

  describe('GitError', () => {
    it('should create git error with correct code', () => {
      const error = new GitError('git failed');

      expect(error.message).toBe('git failed');
      expect(error.code).toBe('GIT_ERROR');
      expect(error.name).toBe('GitError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with correct code', () => {
      const error = new ValidationError('invalid input');

      expect(error.message).toBe('invalid input');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.name).toBe('ValidationError');
    });
  });

  describe('handleError', () => {
    it('should rethrow BabelError as-is', () => {
      const originalError = new DatabaseError('original error');

      expect(() => {
        handleError(originalError, 'context');
      }).toThrow(originalError);
    });

    it('should wrap Error with context', () => {
      const originalError = new Error('original error');

      expect(() => {
        handleError(originalError, 'my context');
      }).toThrow(new BabelError('my context: original error'));
    });

    it('should handle unknown errors', () => {
      expect(() => {
        handleError('unknown', 'context');
      }).toThrow(new BabelError('context: Unknown error'));
    });
  });
});
