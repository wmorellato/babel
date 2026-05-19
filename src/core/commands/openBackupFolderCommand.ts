/**
 * Open Backup Folder Command
 * Opens the local backup folder in the OS file explorer
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { BackupItem } from '../../views/backupTreeItem';
import { Logger } from '../../utils/logger';

const logger = new Logger('OpenBackupFolderCommand');

export class OpenBackupFolderCommand {
  constructor(private backupDir: string) {}

  async execute(backupItem: BackupItem): Promise<void> {
    try {
      if (!backupItem || !backupItem.backupId) {
        logger.warn('No backup item provided to openBackupFolder command');
        await vscode.window.showErrorMessage('No backup selected');
        return;
      }

      const backupPath = path.join(this.backupDir, backupItem.backupId);
      logger.debug(`Opening backup folder: ${backupPath}`);

      await vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(backupPath));
    } catch (error) {
      logger.error(`Failed to open backup folder: ${error}`);
      await vscode.window.showErrorMessage(`Could not open backup folder: ${error}`);
    }
  }

  static register(context: vscode.ExtensionContext, backupDir: string): void {
    const command = new OpenBackupFolderCommand(backupDir);
    const disposable = vscode.commands.registerCommand('babel.openBackupFolder', (backupItem: BackupItem) =>
      command.execute(backupItem)
    );
    context.subscriptions.push(disposable);
    logger.info('Command registered: babel.openBackupFolder');
  }
}
