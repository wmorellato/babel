/**
 * Restore Service
 * Handles point-in-time recovery and restoration logic
 */

import * as fs from 'fs';
import * as path from 'path';
import { BackupPoint, BackupData } from '../types';
import { Logger } from '../utils/logger';
import { BackupError } from '../utils/errorHandler';

const logger = new Logger('RestoreService');

interface RestoreOptions {
  backupId: string;
  databasePath: string;
  workspaceRoot: string;
  onProgress?: (message: string) => void;
}

export class RestoreService {
  /**
   * Restore from a backup
   */
  static async restore(backupData: BackupData, options: RestoreOptions): Promise<void> {
    try {
      options.onProgress?.('Validating backup...');

      // Validate backup manifest
      if (!backupData.manifest || !backupData.databaseSnapshot) {
        throw new BackupError('Invalid backup data');
      }

      options.onProgress?.('Restoring database...');
      await this.restoreDatabase(backupData, options);

      options.onProgress?.('Restoring story files...');
      await this.restoreStoryFiles(backupData, options);

      options.onProgress?.('Restore completed successfully');
      logger.info('Backup restored', { backupId: options.backupId });
    } catch (error) {
      throw new BackupError(`Restore failed: ${error}`);
    }
  }

  /**
   * Create a backup before restore (safety)
   */
  static async backupCurrentState(
    databasePath: string,
    workspaceRoot: string,
    backupPath: string
  ): Promise<void> {
    try {
      logger.info('Creating pre-restore backup');

      // Backup current database
      if (fs.existsSync(databasePath)) {
        fs.copyFileSync(databasePath, path.join(backupPath, 'pre-restore-database.db'));
      }

      // Backup current story files
      const filesBackupDir = path.join(backupPath, 'pre-restore-files');
      if (fs.existsSync(workspaceRoot)) {
        this.copyDirectory(workspaceRoot, filesBackupDir);
      }
    } catch (error) {
      logger.warn('Failed to create pre-restore backup', { error });
    }
  }

  /**
   * List available restore points
   */
  static async listRestorePoints(backupMetadata: BackupPoint[]): Promise<BackupPoint[]> {
    return backupMetadata
      .filter((b) => b.status === 'verified')
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  private static async restoreDatabase(
    backupData: BackupData,
    options: RestoreOptions
  ): Promise<void> {
    try {
      // Backup current database first
      if (fs.existsSync(options.databasePath)) {
        const backupDbPath = options.databasePath + '.pre-restore';
        fs.copyFileSync(options.databasePath, backupDbPath);
      }

      // Write restored database
      fs.writeFileSync(options.databasePath, backupData.databaseSnapshot);

      logger.info('Database restored', { path: options.databasePath });
    } catch (error) {
      throw new BackupError(`Failed to restore database: ${error}`);
    }
  }

  private static async restoreStoryFiles(
    backupData: BackupData,
    options: RestoreOptions
  ): Promise<void> {
    try {
      // Create backup of current story files
      const currentBackupDir = path.join(
        path.dirname(options.databasePath),
        'pre-restore-stories'
      );
      if (fs.existsSync(options.workspaceRoot)) {
        this.copyDirectory(options.workspaceRoot, currentBackupDir);
      }

      // Restore story files
      for (const [filename, content] of backupData.storyFiles) {
        const filePath = path.join(options.workspaceRoot, filename);
        const fileDir = path.dirname(filePath);

        if (!fs.existsSync(fileDir)) {
          fs.mkdirSync(fileDir, { recursive: true });
        }

        fs.writeFileSync(filePath, content);
      }

      logger.info('Story files restored', {
        workspaceRoot: options.workspaceRoot,
        fileCount: backupData.storyFiles.size,
      });
    } catch (error) {
      throw new BackupError(`Failed to restore story files: ${error}`);
    }
  }

  private static copyDirectory(src: string, dest: string): void {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }

    const entries = fs.readdirSync(src);

    for (const entry of entries) {
      const srcPath = path.join(src, entry);
      const destPath = path.join(dest, entry);
      const stat = fs.statSync(srcPath);

      if (stat.isDirectory()) {
        this.copyDirectory(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }
}
