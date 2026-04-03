import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { registerBackupToggleCommands } from '../../../../src/core/commands/backupToggleCommands';

describe('Backup Toggle Commands', () => {
  let mockContext: any;
  let mockUpdateFn: any;
  let registeredHandlers: Record<string, any>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContext = {
      subscriptions: [],
    };

    registeredHandlers = {};
    mockUpdateFn = jest.fn().mockImplementation(() => Promise.resolve());

    // Mock vscode.workspace.getConfiguration to return an object with update method
    (vscode.workspace.getConfiguration as any).mockReturnValue({
      get: jest.fn(),
      update: mockUpdateFn,
    });

    // Mock vscode.commands.registerCommand to store handlers for later execution
    (vscode.commands.registerCommand as any).mockImplementation((commandId: string, handler: any) => {
      registeredHandlers[commandId] = handler;
      return {
        dispose: jest.fn(),
      };
    });

    // Mock vscode.commands.executeCommand to execute registered handlers
    (vscode.commands.executeCommand as any).mockImplementation(async (commandId: string, args: any) => {
      const handler = registeredHandlers[commandId];
      if (handler) {
        return handler(args);
      }
    });
  });

  describe('babel.enableBackup', () => {
    it('should enable local backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      await vscode.commands.executeCommand('babel.enableBackup', { isCloud: false });

      expect(mockUpdateFn).toHaveBeenCalledWith('enabled', true, vscode.ConfigurationTarget.Global);
    });

    it('should enable cloud backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      await vscode.commands.executeCommand('babel.enableBackup', { isCloud: true });

      expect(mockUpdateFn).toHaveBeenCalledWith('dropbox.enabled', true, vscode.ConfigurationTarget.Global);
    });
  });

  describe('babel.disableBackup', () => {
    it('should disable local backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      await vscode.commands.executeCommand('babel.disableBackup', { isCloud: false });

      expect(mockUpdateFn).toHaveBeenCalledWith('enabled', false, vscode.ConfigurationTarget.Global);
    });

    it('should disable cloud backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      await vscode.commands.executeCommand('babel.disableBackup', { isCloud: true });

      expect(mockUpdateFn).toHaveBeenCalledWith('dropbox.enabled', false, vscode.ConfigurationTarget.Global);
    });
  });

  it('should add disposables to context subscriptions', () => {
    registerBackupToggleCommands(mockContext);

    expect(mockContext.subscriptions.length).toBe(4);
  });

  it('should register tree view command variants with same behavior', async () => {
    registerBackupToggleCommands(mockContext);

    await vscode.commands.executeCommand('babel.enableBackupView', { isCloud: true });
    expect(mockUpdateFn).toHaveBeenCalledWith('dropbox.enabled', true, vscode.ConfigurationTarget.Global);

    mockUpdateFn.mockClear();
    await vscode.commands.executeCommand('babel.disableBackupView', { isCloud: false });
    expect(mockUpdateFn).toHaveBeenCalledWith('enabled', false, vscode.ConfigurationTarget.Global);
  });
});
