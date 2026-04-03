/**
 * Toggle Backup Commands
 * Enable/disable cloud and local backup providers
 */

import * as vscode from 'vscode';
import { BackupTreeDataProvider } from '../../views/backupTreeDataProvider';
import { BackupManager } from '../../services/backupManager';
import { Logger } from '../../utils/logger';

const logger = new Logger('ToggleBackupCommand');

/**
 * Helper function to convert error to user-friendly message
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export class ToggleBackupCommand {
  constructor(private backupTreeProvider: BackupTreeDataProvider) {}

  registerToggleCloudBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.toggleCloudBackup', async () => {
      try {
        await this.backupTreeProvider.toggleCloudBackup();
        const config = vscode.workspace.getConfiguration('babel.backup');
        const enabled = config.get<boolean>('dropbox.enabled') ?? false;
        vscode.window.showInformationMessage(
          `Cloud backup ${enabled ? 'enabled' : 'disabled'}`
        );
      } catch (error) {
        logger.error('Failed to toggle cloud backup', { error });
        vscode.window.showErrorMessage(`Failed to toggle cloud backup: ${getErrorMessage(error)}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  registerToggleLocalBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.toggleLocalBackup', async () => {
      try {
        await this.backupTreeProvider.toggleLocalBackup();
        const config = vscode.workspace.getConfiguration('babel.backup');
        const enabled = config.get<boolean>('enabled') ?? false;
        vscode.window.showInformationMessage(
          `Local backup ${enabled ? 'enabled' : 'disabled'}`
        );
      } catch (error) {
        logger.error('Failed to toggle local backup', { error });
        vscode.window.showErrorMessage(`Failed to toggle local backup: ${getErrorMessage(error)}`);
      }
    });
    context.subscriptions.push(disposable);
  }
}

export class DeleteBackupCommand {
  constructor(private backupManager: BackupManager) {}

  registerDeleteBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand(
      'babel.deleteBackup',
      async (backupId: string) => {
        if (!backupId) {
          vscode.window.showErrorMessage('No backup selected');
          return;
        }

        try {
          const confirm = await vscode.window.showWarningMessage(
            'Delete this backup? This cannot be undone.',
            { modal: true },
            'Delete'
          );

          if (confirm === 'Delete') {
            await this.backupManager.deleteBackup(backupId);
            vscode.window.showInformationMessage('Backup deleted');
          }
        } catch (error) {
          logger.error('Failed to delete backup', { error });
          vscode.window.showErrorMessage(`Failed to delete backup: ${getErrorMessage(error)}`);
        }
      }
    );
    context.subscriptions.push(disposable);
  }
}
