/**
 * Backup Toggle Commands
 * Enable/disable backup providers via inline tree view buttons
 */

import * as vscode from 'vscode';
import { BabelSettings } from '../../services/babelSettings';
import { Logger } from '../../utils/logger';

const logger = new Logger('BackupToggleCommands');

export function registerBackupToggleCommands(context: vscode.ExtensionContext): void {
  // Shared implementation for enable
  const enableHandler = async (treeItem: any) => {
    try {
      if (treeItem.isCloud) {
        await BabelSettings.setDropboxEnabled(true);
        logger.info('Cloud backup enabled');
      } else {
        await BabelSettings.setBackupEnabled(true);
        logger.info('Local backup enabled');
      }
    } catch (error) {
      const provider = treeItem.isCloud ? 'cloud' : 'local';
      logger.error(`Failed to enable ${provider} backup: ${error}`);
      vscode.window.showErrorMessage(`Failed to enable ${provider} backup: ${error}`);
    }
  };

  // Shared implementation for disable
  const disableHandler = async (treeItem: any) => {
    try {
      if (treeItem.isCloud) {
        await BabelSettings.setDropboxEnabled(false);
        logger.info('Cloud backup disabled');
      } else {
        await BabelSettings.setBackupEnabled(false);
        logger.info('Local backup disabled');
      }
    } catch (error) {
      const provider = treeItem.isCloud ? 'cloud' : 'local';
      logger.error(`Failed to disable ${provider} backup: ${error}`);
      vscode.window.showErrorMessage(`Failed to disable ${provider} backup: ${error}`);
    }
  };

  // babel.enableBackup command (for command palette)
  const enableDisposable = vscode.commands.registerCommand('babel.enableBackup', enableHandler);

  // babel.enableBackupView command (for tree view with short title)
  const enableViewDisposable = vscode.commands.registerCommand('babel.enableBackupView', enableHandler);

  // babel.disableBackup command (for command palette)
  const disableDisposable = vscode.commands.registerCommand('babel.disableBackup', disableHandler);

  // babel.disableBackupView command (for tree view with short title)
  const disableViewDisposable = vscode.commands.registerCommand('babel.disableBackupView', disableHandler);

  context.subscriptions.push(enableDisposable, enableViewDisposable, disableDisposable, disableViewDisposable);
}
