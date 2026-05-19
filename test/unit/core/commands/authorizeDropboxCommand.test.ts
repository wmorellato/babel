import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { AuthorizeDropboxCommand } from '../../../../src/core/commands/authorizeDropboxCommand';
import { TokenManager } from '../../../../src/services/tokenManager';

describe('AuthorizeDropboxCommand', () => {
  let command: AuthorizeDropboxCommand;
  let mockTokenManager: jest.Mocked<TokenManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokenManager = {
      acquireToken: jest.fn(),
    } as any;

    command = new AuthorizeDropboxCommand();

    // Mock VSCode API
    (vscode.env.openExternal as any) = jest.fn().mockImplementation(() => Promise.resolve(true));
    (vscode.window.showInformationMessage as any) = jest.fn().mockImplementation(() => Promise.resolve(undefined));
    (vscode.window.showErrorMessage as any) = jest.fn().mockImplementation(() => Promise.resolve(undefined));
    (vscode.workspace.getConfiguration as any) = jest.fn().mockReturnValue({
      update: jest.fn().mockImplementation(() => Promise.resolve()),
    });
  });

  it('should be constructable', () => {
    expect(command).toBeInstanceOf(AuthorizeDropboxCommand);
  });

  it('should have execute method', () => {
    expect(command).toHaveProperty('execute');
    expect(typeof command.execute).toBe('function');
  });

  describe('execute', () => {
    it('should throw error if TokenManager is not provided', async () => {
      await expect(command.execute('client-id', 'http://localhost:54831/oauth/callback', null as any)).rejects.toThrow(
        'TokenManager not initialized'
      );
    });

    // Note: Full integration testing would require mocking HTTP server and OAuth response
    // This is tested more thoroughly in integration tests
  });
});
