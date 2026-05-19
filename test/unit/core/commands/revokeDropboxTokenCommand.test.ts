import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { RevokeDropboxTokenCommand } from '../../../../src/core/commands/revokeDropboxTokenCommand';

// Mock vscode
jest.mock('vscode');

describe('RevokeDropboxTokenCommand', () => {
  let command: RevokeDropboxTokenCommand;
  let mockTokenManager: any;
  let mockBackupConfig: any;
  let revokeTokenFn: jest.Mock;
  let updateConfigFn: jest.Mock;
  let showInfoFn: jest.Mock;
  let showErrorFn: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock functions
    revokeTokenFn = (jest.fn() as any).mockResolvedValue(undefined);
    updateConfigFn = (jest.fn() as any).mockResolvedValue(undefined);
    showInfoFn = (jest.fn() as any).mockResolvedValue(undefined);
    showErrorFn = (jest.fn() as any).mockResolvedValue(undefined);

    // Setup mock TokenManager
    mockTokenManager = {
      revokeToken: revokeTokenFn,
      getValidToken: jest.fn(),
      acquireToken: jest.fn(),
      refreshToken: jest.fn(),
    };

    // Setup mock vscode config
    mockBackupConfig = {
      update: updateConfigFn,
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      mockBackupConfig
    );

    (vscode.window.showInformationMessage as jest.Mock) = showInfoFn;
    (vscode.window.showErrorMessage as jest.Mock) = showErrorFn;

    command = new RevokeDropboxTokenCommand(mockTokenManager);
  });

  describe('execute', () => {
    it('should revoke token and update settings', async () => {
      await command.execute();

      expect(revokeTokenFn).toHaveBeenCalledWith('dropbox');
      expect(updateConfigFn).toHaveBeenCalledWith(
        'dropbox.authorized',
        false,
        vscode.ConfigurationTarget.Global
      );
      expect(showInfoFn).toHaveBeenCalledWith(
        expect.stringContaining('Dropbox token revoked')
      );
    });

    it('should show error message on revocation failure', async () => {
      (revokeTokenFn as any).mockRejectedValue(new Error('API Error'));

      await command.execute();

      expect(showErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to revoke token')
      );
    });

    it('should handle string errors', async () => {
      (revokeTokenFn as any).mockRejectedValue('String error');

      await command.execute();

      expect(showErrorFn).toHaveBeenCalledWith(
        expect.stringContaining('String error')
      );
    });
  });

  describe('registerRevokeToken', () => {
    it('should register the command', () => {
      const mockContext = {
        subscriptions: [],
      } as any;

      command.registerRevokeToken(mockContext);

      expect(vscode.commands.registerCommand).toHaveBeenCalledWith(
        'babel.revokeDropboxToken',
        expect.any(Function)
      );
      expect(mockContext.subscriptions.length).toBe(1);
    });

    it('should execute command when registered command is called', async () => {
      const mockContext = {
        subscriptions: [],
      } as any;

      command.registerRevokeToken(mockContext);

      // Get the callback function that was registered
      const registerCall = (vscode.commands.registerCommand as jest.Mock).mock
        .calls[0];
      const commandId = registerCall[0];
      const commandCallback = registerCall[1] as any;

      expect(commandId).toBe('babel.revokeDropboxToken');

      // Call the callback
      await commandCallback();

      expect(revokeTokenFn).toHaveBeenCalledWith('dropbox');
    });
  });
});
