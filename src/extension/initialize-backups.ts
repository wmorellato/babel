import * as vscode from 'vscode';
import * as path from 'path';
import * as os from 'os';
import { BackupManager } from '../services/backupManager';
import { BackupRepository } from '../db/backupRepository';
import { BackupTreeDataProvider } from '../views/backupTreeDataProvider';
import { BackupDataCollector } from '../services/backupDataCollector';
import { RestoreService } from '../services/restoreService';
import { DropboxConnectivityChecker } from '../services/dropboxConnectivityChecker';
import { ToggleBackupCommand, DeleteBackupCommand } from '../core/commands/toggleBackupCommand';
import { OpenBackupFolderCommand } from '../core/commands/openBackupFolderCommand';
import { ExtensionDependencies } from './types';

/**
 * Initialize backup management.
 *
 * - Creates BackupManager with resolved config and scheduled backup handler
 * - Sets up BackupTreeDataProvider
 * - Checks Dropbox connectivity on startup
 * - Registers backup commands: toggle, delete, openFolder, backupNow, restoreBackup
 */
export async function initializeBackups(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const {
    context,
    database,
    storyRepository,
    backupDataCollector,
    tokenManager,
    workspacePath,
    treeDataProvider,
    logger,
  } = deps;

  const disposables: vscode.Disposable[] = [];

  const backupRepository = new BackupRepository(database.getDb());
  const config = vscode.workspace.getConfiguration('babel.backup');

  // Resolve backup path (expand ${userHome})
  let localPath = config.get<string>('localPath') || `${os.homedir()}/.babel-backups`;
  if (localPath.includes('${userHome}')) {
    localPath = localPath.replace('${userHome}', os.homedir());
  }

  const backupConfig = {
    enabled: config.get<boolean>('enabled') ?? true,
    schedule: (config.get<string>('schedule') as 'disabled' | 'hourly' | 'daily' | 'weekly') || 'daily',
    time: config.get<string>('time') || '02:00',
    localPath,
    retention: config.get<number>('retention') ?? 30,
    autoSave: config.get<boolean>('autoSave') ?? true,
  };

  // Create scheduled backup handler closure — references backupManager set below
  let backupManager: BackupManager | null = null;

  const scheduleBackupHandler = async () => {
    try {
      if (!backupManager || !backupDataCollector) {
        logger.warn('Scheduled backup handler: missing dependencies');
        return;
      }

      logger.info('Scheduled backup starting');
      const backupData = await backupDataCollector.collect();
      logger.debug('Backup data collected', {
        fileCount: backupData.storyFiles.size,
        dbSize: backupData.databaseSnapshot.length,
      });

      const backup = await backupManager.backup(backupData, {
        type: 'full',
        onProgress: (msg) => logger.debug(msg),
      });

      logger.info('Scheduled backup completed successfully', { id: backup.id });
      await vscode.window.showInformationMessage(
        `Backup created (${(backup.storageSize / 1024 / 1024).toFixed(1)} MB)`
      );
    } catch (error) {
      logger.error('Scheduled backup failed', { error });
      await vscode.window.showErrorMessage(`Backup failed: ${error}`);
    }
  };

  backupManager = new BackupManager(
    backupConfig,
    backupRepository,
    scheduleBackupHandler,
    tokenManager
  );
  disposables.push(new vscode.Disposable(() => backupManager?.dispose()));

  logger.info('Backup manager initialized', {
    enabled: backupConfig.enabled,
    schedule: backupConfig.schedule,
  });

  // Backup tree view
  const treeBackupRepository = new BackupRepository(database.getDb());
  const backupTreeDataProvider = new BackupTreeDataProvider(treeBackupRepository, backupManager);

  const backupViewRegistration = vscode.window.registerTreeDataProvider('babelBackups', backupTreeDataProvider);
  context.subscriptions.push(backupViewRegistration);
  logger.info('Backup tree view initialized');

  // Check Dropbox connectivity on startup
  if (tokenManager) {
    const connectivityChecker = new DropboxConnectivityChecker(tokenManager);
    try {
      await connectivityChecker.checkAndUpdateStatus(() => {
        backupTreeDataProvider.refresh();
      });
    } catch (error) {
      logger.warn('Connectivity check error', { error });
    }
  }

  // Register backup toggle/delete/open commands
  try {
    const toggleBackupCommand = new ToggleBackupCommand(backupTreeDataProvider);
    toggleBackupCommand.registerToggleCloudBackup(context);
    toggleBackupCommand.registerToggleLocalBackup(context);

    const deleteBackupCommand = new DeleteBackupCommand(backupManager);
    deleteBackupCommand.registerDeleteBackup(context);

    OpenBackupFolderCommand.register(context, backupConfig.localPath);

    logger.info('Backup commands registered successfully');
  } catch (error) {
    logger.error('Failed to register backup commands', { error });
  }

  // babel.backupNow - Create backup immediately
  const backupNowDisposable = vscode.commands.registerCommand('babel.backupNow', async () => {
    try {
      if (!backupManager || !backupDataCollector) {
        await vscode.window.showErrorMessage('Backup manager not initialized');
        return;
      }

      logger.info('Manual backup command triggered');
      const data = await backupDataCollector.collect();
      logger.debug('Backup data collected for manual backup');

      const backup = await backupManager.backup(data, {
        type: 'full',
        onProgress: (msg) => logger.debug(msg),
      });

      logger.info('Manual backup created successfully', { id: backup.id, size: backup.storageSize });
      await vscode.window.showInformationMessage(
        `Backup created (${(backup.storageSize / 1024 / 1024).toFixed(1)} MB)`
      );
    } catch (error) {
      logger.error('Failed to create backup', { error });
      await vscode.window.showErrorMessage(`Backup failed: ${error}`);
    }
  });
  context.subscriptions.push(backupNowDisposable);

  // babel.restoreBackup - Restore from backup
  const restoreDisposable = vscode.commands.registerCommand('babel.restoreBackup', async () => {
    try {
      if (!backupManager) {
        vscode.window.showErrorMessage('Backup manager not initialized');
        return;
      }

      const backups = backupManager.getAvailableBackups();

      if (!backups || backups.length === 0) {
        vscode.window.showInformationMessage('No backups available');
        return;
      }

      const items = backups.map((b) => ({
        label: `${b.timestamp.toLocaleString()} (${(b.storageSize / 1024 / 1024).toFixed(2)} MB)`,
        description: `${b.type} backup - ${b.storyCount} stories`,
        detail: b.id,
        backup: b,
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a backup to restore',
      });

      if (!selected) return;

      const confirm = await vscode.window.showWarningMessage(
        'Restore from backup? Current files will be replaced.',
        { modal: true },
        'Restore'
      );

      if (confirm !== 'Restore') return;

      vscode.window.showInformationMessage('Restoring backup...');

      const backupData = await backupManager.restore(selected.backup.id);

      if (!workspacePath) {
        vscode.window.showErrorMessage('Babel requires a workspace folder to be open');
        return;
      }

      const babelDir = path.join(workspacePath, '.babel');
      const backupDatabasePath = path.join(babelDir, 'babel.db');

      await RestoreService.restore(backupData, {
        backupId: selected.backup.id,
        databasePath: backupDatabasePath,
        workspaceRoot: workspacePath,
        onProgress: (msg) => logger.debug(msg),
      });

      vscode.window.showInformationMessage('Backup restored successfully');
      logger.info('Backup restored', { id: selected.backup.id });

      treeDataProvider?.refresh();
    } catch (error) {
      logger.error('Failed to restore backup', { error });
      vscode.window.showErrorMessage(`Restore failed: ${error}`);
    }
  });
  context.subscriptions.push(restoreDisposable);

  return vscode.Disposable.from(...disposables);
}
