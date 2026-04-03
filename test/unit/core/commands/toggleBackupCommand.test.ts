/**
 * Toggle Backup Command Tests
 */

import { describe, it, expect, beforeEach, jest, afterEach } from '@jest/globals';
import * as vscode from 'vscode';
import { ToggleBackupCommand, DeleteBackupCommand } from '../../../../src/core/commands/toggleBackupCommand';

describe('ToggleBackupCommand', () => {
  let command: ToggleBackupCommand;
  let mockTreeProvider: any;
  let context: any;
  let mockRegisterCommand: jest.Mock<any>;
  let mockShowInformationMessage: jest.Mock<any>;
  let mockShowErrorMessage: jest.Mock<any>;
  let mockGetConfiguration: jest.Mock<any>;

  beforeEach(() => {
    mockTreeProvider = {
      toggleCloudBackup: jest.fn<any>().mockResolvedValue(undefined),
      toggleLocalBackup: jest.fn<any>().mockResolvedValue(undefined),
    };

    context = {
      subscriptions: [],
    };

    mockShowInformationMessage = jest.fn<any>().mockResolvedValue(undefined);
    mockShowErrorMessage = jest.fn<any>().mockResolvedValue(undefined);
    mockGetConfiguration = jest.fn<any>().mockReturnValue({
      get: jest.fn<any>().mockReturnValue(true),
    });

    jest.spyOn(vscode.window, 'showInformationMessage').mockImplementation(mockShowInformationMessage as any);
    jest.spyOn(vscode.window, 'showErrorMessage').mockImplementation(mockShowErrorMessage as any);
    jest.spyOn(vscode.workspace, 'getConfiguration').mockImplementation(mockGetConfiguration as any);

    mockRegisterCommand = jest.fn<any>().mockReturnValue({ dispose: jest.fn() });
    jest.spyOn(vscode.commands, 'registerCommand').mockImplementation(mockRegisterCommand as any);

    command = new ToggleBackupCommand(mockTreeProvider);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registerToggleCloudBackup', () => {
    it('should register toggle cloud backup command', () => {
      command.registerToggleCloudBackup(context);
      expect(context.subscriptions.length).toBe(1);
      expect(mockRegisterCommand).toHaveBeenCalledWith('babel.toggleCloudBackup', expect.any(Function));
    });

    it('should call toggleCloudBackup handler on command execution', async () => {
      command.registerToggleCloudBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();
      expect(mockTreeProvider.toggleCloudBackup).toHaveBeenCalled();
    });

    it('should show success message when toggle succeeds', async () => {
      command.registerToggleCloudBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Cloud backup enabled');
    });

    it('should handle config value with type safety', async () => {
      const configMock = {
        get: jest.fn<any>().mockReturnValue(undefined),
      };
      mockGetConfiguration.mockReturnValue(configMock);

      command.registerToggleCloudBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Cloud backup disabled');
    });

    it('should show error message when toggle fails', async () => {
      const testError = new Error('Toggle failed');
      mockTreeProvider.toggleCloudBackup.mockRejectedValue(testError);

      command.registerToggleCloudBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to toggle cloud backup: Toggle failed');
    });

    it('should handle non-Error objects in error message', async () => {
      mockTreeProvider.toggleCloudBackup.mockRejectedValue('String error');

      command.registerToggleCloudBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to toggle cloud backup: String error');
    });
  });

  describe('registerToggleLocalBackup', () => {
    it('should register toggle local backup command', () => {
      command.registerToggleLocalBackup(context);
      expect(context.subscriptions.length).toBe(1);
      expect(mockRegisterCommand).toHaveBeenCalledWith('babel.toggleLocalBackup', expect.any(Function));
    });

    it('should call toggleLocalBackup handler on command execution', async () => {
      command.registerToggleLocalBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();
      expect(mockTreeProvider.toggleLocalBackup).toHaveBeenCalled();
    });

    it('should show success message when toggle succeeds', async () => {
      command.registerToggleLocalBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();
      expect(mockShowInformationMessage).toHaveBeenCalledWith('Local backup enabled');
    });

    it('should handle config value with type safety', async () => {
      const configMock = {
        get: jest.fn<any>().mockReturnValue(undefined),
      };
      mockGetConfiguration.mockReturnValue(configMock);

      command.registerToggleLocalBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Local backup disabled');
    });

    it('should show error message when toggle fails', async () => {
      const testError = new Error('Toggle failed');
      mockTreeProvider.toggleLocalBackup.mockRejectedValue(testError);

      command.registerToggleLocalBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler();

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to toggle local backup: Toggle failed');
    });
  });
});

describe('DeleteBackupCommand', () => {
  let command: DeleteBackupCommand;
  let mockBackupManager: any;
  let context: any;
  let mockRegisterCommand: jest.Mock<any>;
  let mockShowWarningMessage: jest.Mock<any>;
  let mockShowInformationMessage: jest.Mock<any>;
  let mockShowErrorMessage: jest.Mock<any>;

  beforeEach(() => {
    mockBackupManager = {
      deleteBackup: jest.fn<any>().mockResolvedValue(undefined),
    };

    context = {
      subscriptions: [],
    };

    mockShowWarningMessage = jest.fn<any>().mockResolvedValue('Delete');
    mockShowInformationMessage = jest.fn<any>().mockResolvedValue(undefined);
    mockShowErrorMessage = jest.fn<any>().mockResolvedValue(undefined);

    jest.spyOn(vscode.window, 'showWarningMessage').mockImplementation(mockShowWarningMessage as any);
    jest.spyOn(vscode.window, 'showInformationMessage').mockImplementation(mockShowInformationMessage as any);
    jest.spyOn(vscode.window, 'showErrorMessage').mockImplementation(mockShowErrorMessage as any);

    mockRegisterCommand = jest.fn<any>().mockReturnValue({ dispose: jest.fn() });
    jest.spyOn(vscode.commands, 'registerCommand').mockImplementation(mockRegisterCommand as any);

    command = new DeleteBackupCommand(mockBackupManager);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('registerDeleteBackup', () => {
    it('should register delete backup command', () => {
      command.registerDeleteBackup(context);
      expect(context.subscriptions.length).toBe(1);
      expect(mockRegisterCommand).toHaveBeenCalledWith('babel.deleteBackup', expect.any(Function));
    });

    it('should show error when no backup selected', async () => {
      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('');

      expect(mockShowErrorMessage).toHaveBeenCalledWith('No backup selected');
      expect(mockShowWarningMessage).not.toHaveBeenCalled();
    });

    it('should show warning message when delete handler executed', async () => {
      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockShowWarningMessage).toHaveBeenCalledWith(
        'Delete this backup? This cannot be undone.',
        { modal: true },
        'Delete'
      );
    });

    it('should call deleteBackup when user confirms deletion', async () => {
      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockBackupManager.deleteBackup).toHaveBeenCalledWith('backup-id-123');
    });

    it('should show success message after deletion', async () => {
      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockShowInformationMessage).toHaveBeenCalledWith('Backup deleted');
    });

    it('should not call deleteBackup when user cancels deletion', async () => {
      mockShowWarningMessage.mockResolvedValue(undefined);

      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockBackupManager.deleteBackup).not.toHaveBeenCalled();
      expect(mockShowInformationMessage).not.toHaveBeenCalled();
    });

    it('should handle deleteBackup errors', async () => {
      const testError = new Error('Delete failed');
      mockBackupManager.deleteBackup.mockRejectedValue(testError);

      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockShowErrorMessage).toHaveBeenCalledWith('Failed to delete backup: Delete failed');
    });

    it('should handle non-Error objects in delete error', async () => {
      mockBackupManager.deleteBackup.mockRejectedValue({ code: 'ERROR_CODE' });

      command.registerDeleteBackup(context);
      const handler = mockRegisterCommand.mock.calls[0][1] as any;
      await handler('backup-id-123');

      expect(mockShowErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to delete backup:')
      );
    });
  });
});
