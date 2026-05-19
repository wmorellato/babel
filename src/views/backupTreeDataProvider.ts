/**
 * Backup Tree Data Provider
 * Displays backup history organized by provider (Local/Cloud)
 */

import * as vscode from 'vscode';
import { BackupRepository } from '../db/backupRepository';
import { BackupManager } from '../services/backupManager';
import { BabelSettings } from '../services/babelSettings';
import { Logger } from '../utils/logger';
import { ProviderGroupItem, BackupItem } from './backupTreeItem';

const logger = new Logger('BackupTreeDataProvider');

export class BackupTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private backupRepository: BackupRepository,
    private backupManager: BackupManager
  ) {
    // Subscribe to backup lifecycle events
    this.backupManager.onBackupComplete(() => this.refresh());
    this.backupManager.onRestoreComplete(() => this.refresh());
    this.backupManager.onDeleteComplete(() => this.refresh());
    this.backupManager.onCloudBackupComplete(() => this.refresh());

    // Subscribe to settings changes to update icons/buttons
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('babel.backup')) {
        this.refresh();
      }
    });
  }

  refresh(): void {
    logger.debug('Refreshing backup tree');
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      // Root: return provider groups
      if (!element) {
        const localEnabled = BabelSettings.isBackupEnabled();
        const cloudEnabled = BabelSettings.isDropboxEnabled();
        const cloudAuthorized = BabelSettings.isAuthorized();

        logger.debug('Backup tree settings read', { localEnabled, cloudEnabled, cloudAuthorized });

        const localGroup = new ProviderGroupItem(
          'Local Backups',
          localEnabled,
          false,
          undefined
        );
        localGroup.iconPath = this.getIconForLocalState(localEnabled);

        const cloudGroup = new ProviderGroupItem(
          'Cloud Backups',
          cloudEnabled,
          true,
          cloudAuthorized ? 'authorized' : 'unauthorized'
        );
        cloudGroup.iconPath = this.getIconForCloudState(cloudEnabled, cloudAuthorized);

        return [localGroup, cloudGroup];
      }

      // Provider group: return backups
      if (element instanceof ProviderGroupItem) {
        let backupPoints: any[] = [];

        if (element.isCloud) {
          // Fetch cloud backups from Dropbox
          try {
            backupPoints = await this.backupManager.getCloudBackups();
          } catch (error) {
            logger.error('Failed to fetch cloud backups', { error });
            backupPoints = [];
          }
        } else {
          // Get local backups from database
          backupPoints = this.backupRepository.findAll();
        }

        // Sort by timestamp (most recent first) and limit to 10 entries
        const recentBackups = backupPoints
          .sort((a: any, b: any) => b.timestamp.getTime() - a.timestamp.getTime())
          .slice(0, 10);

        return recentBackups.map((backup: any) => {
          const id = backup.id || '';
          const timestamp = backup.timestamp || new Date();
          const size = backup.storageSize || 0;
          const type = (backup.type as 'full' | 'incremental') || 'full';
          const isCloud = element.isCloud;

          return new BackupItem(id, timestamp, size, type, isCloud);
        });
      }

      return [];
    } catch (error) {
      logger.error(`Error getting children: ${error}`);
      return [];
    }
  }

  private getIconForCloudState(isEnabled: boolean, isAuthorized: boolean = false): vscode.ThemeIcon {
    if (isEnabled) {
      if (!isAuthorized) {
        // Amber circle for enabled but not authorized (cloud only)
        return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.yellow'));
      }
      // Green circle for enabled (and authorized if cloud)
      return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.green'));
    }
    // Red circle for disabled
    return new vscode.ThemeIcon('cloud', new vscode.ThemeColor('charts.red'));
  }

  private getIconForLocalState(isEnabled: boolean): vscode.ThemeIcon {
    if (isEnabled) {
      // Green circle for enabled (and authorized if cloud)
      return new vscode.ThemeIcon('folder-library', new vscode.ThemeColor('charts.green'));
    }
    // Red circle for disabled
    return new vscode.ThemeIcon('folder-library', new vscode.ThemeColor('charts.red'));
  }

  /**
   * Toggle cloud backup provider
   */
  async toggleCloudBackup(): Promise<void> {
    const currentState = BabelSettings.isDropboxEnabled();
    await BabelSettings.setDropboxEnabled(!currentState);
    logger.info('Cloud backup toggled', { enabled: !currentState });
    this.refresh();
  }

  /**
   * Toggle local backup provider
   */
  async toggleLocalBackup(): Promise<void> {
    const currentState = BabelSettings.isBackupEnabled();
    await BabelSettings.setBackupEnabled(!currentState);
    logger.info('Local backup toggled', { enabled: !currentState });
    this.refresh();
  }
}
