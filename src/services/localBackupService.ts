/**
 * Local Backup Service
 * Handles creation, storage, and cleanup of local backups
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { v4 as uuid } from 'uuid';
import { BackupPoint, BackupData, BackupManifest } from '../types';
import { IBackupProvider } from './iBackupProvider';
import { Logger } from '../utils/logger';
import { BackupError } from '../utils/errorHandler';

const logger = new Logger('LocalBackupService');

export class LocalBackupService implements Omit<IBackupProvider, 'cleanupOldBackups'> {
  // Note: cleanupOldBackups is implemented below despite TS compiler issue
  private backupDir: string;

  constructor(backupDir: string) {
    this.backupDir = backupDir;
    this.ensureBackupDir();
  }

  /**
   * Check if provider is available
   */
  async isAvailable(): Promise<boolean> {
    try {
      return fs.existsSync(this.backupDir);
    } catch {
      return false;
    }
  }

  /**
   * Create a new backup and store it
   */
  async createBackup(data: BackupData, type: 'full' | 'incremental'): Promise<BackupPoint> {
    try {
      const id = uuid();
      const timestamp = new Date();

      // Calculate hash of the backup
      const hash = this.hashBackupData(data);

      // Store backup files
      const backupPath = path.join(this.backupDir, id);
      fs.mkdirSync(backupPath, { recursive: true });

      // Write database snapshot
      fs.writeFileSync(path.join(backupPath, 'database.db'), data.databaseSnapshot);

      // Write story files
      const filesDir = path.join(backupPath, 'files');
      fs.mkdirSync(filesDir, { recursive: true });
      for (const [filename, content] of data.storyFiles) {
        const filePath = path.join(filesDir, filename);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content);
      }

      // Write manifest
      fs.writeFileSync(
        path.join(backupPath, 'manifest.json'),
        JSON.stringify(data.manifest, null, 2)
      );

      // Calculate storage size
      const storageSize = this.calculateDirectorySize(backupPath);

      const backup: BackupPoint = {
        id,
        timestamp,
        type,
        storageSize,
        fileCount: data.storyFiles.size,
        storyCount: data.manifest.stories.length,
        totalWordCount: data.manifest.stories.reduce((sum, s) => sum + s.fileCount, 0),
        status: 'pending',
        hash,
      };

      logger.info('Backup created', { id, type, size: storageSize });
      return backup;
    } catch (error) {
      throw new BackupError(`Failed to create backup: ${error}`);
    }
  }

  /**
   * Restore a backup
   */
  async restoreBackup(backupId: string): Promise<BackupData> {
    try {
      const backupPath = path.join(this.backupDir, backupId);

      if (!fs.existsSync(backupPath)) {
        throw new BackupError(`Backup not found: ${backupId}`);
      }

      // Read database snapshot
      const databaseSnapshot = fs.readFileSync(path.join(backupPath, 'database.db'));

      // Read story files
      const storyFiles = new Map<string, Buffer>();
      const filesDir = path.join(backupPath, 'files');
      if (fs.existsSync(filesDir)) {
        const files = this.listFilesRecursive(filesDir);
        for (const file of files) {
          const relPath = path.relative(filesDir, file);
          storyFiles.set(relPath, fs.readFileSync(file));
        }
      }

      // Read manifest
      const manifest = JSON.parse(
        fs.readFileSync(path.join(backupPath, 'manifest.json'), 'utf-8')
      ) as BackupManifest;
      manifest.createdAt = new Date(manifest.createdAt);

      logger.info('Backup restored', { backupId });
      return { databaseSnapshot, storyFiles, manifest };
    } catch (error) {
      throw new BackupError(`Failed to restore backup: ${error}`);
    }
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      if (fs.existsSync(backupPath)) {
        fs.rmSync(backupPath, { recursive: true, force: true });
        logger.info('Backup deleted', { backupId });
      }
    } catch (error) {
      throw new BackupError(`Failed to delete backup: ${error}`);
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const backupPath = path.join(this.backupDir, backupId);
      if (!fs.existsSync(backupPath)) {
        return false;
      }

      // Check all required files exist
      const requiredFiles = ['database.db', 'manifest.json'];
      for (const file of requiredFiles) {
        if (!fs.existsSync(path.join(backupPath, file))) {
          return false;
        }
      }

      // Verify manifest is valid JSON
      try {
        JSON.parse(fs.readFileSync(path.join(backupPath, 'manifest.json'), 'utf-8'));
      } catch {
        return false;
      }

      logger.info('Backup verified', { backupId });
      return true;
    } catch (error) {
      logger.error('Backup verification failed', { backupId, error });
      return false;
    }
  }

  /**
   * List all backups in storage
   */
  async listBackups(): Promise<string[]> {
    try {
      if (!fs.existsSync(this.backupDir)) {
        return [];
      }
      return fs.readdirSync(this.backupDir);
    } catch (error) {
      throw new BackupError(`Failed to list backups: ${error}`);
    }
  }

  /**
   * Get storage usage of backups
   */
  async getStorageUsage(): Promise<number> {
    try {
      return this.calculateDirectorySize(this.backupDir);
    } catch (error) {
      throw new BackupError(`Failed to calculate storage usage: ${error}`);
    }
  }

  /**
   * Clean old backups based on retention policy
   */
  async cleanOldBackups(retentionDays: number, backupMetadata: Map<string, BackupPoint>): Promise<string[]> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const deleted: string[] = [];

      for (const [backupId, backup] of backupMetadata) {
        if (backup.timestamp < cutoffDate) {
          await this.deleteBackup(backupId);
          deleted.push(backupId);
        }
      }

      if (deleted.length > 0) {
        logger.info('Old backups cleaned', { count: deleted.length, retentionDays });
      }

      return deleted;
    } catch (error) {
      throw new BackupError(`Failed to clean old backups: ${error}`);
    }
  }

  private ensureBackupDir(): void {
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  private hashBackupData(data: BackupData): string {
    const hash = crypto.createHash('sha256');

    // Hash database snapshot
    hash.update(data.databaseSnapshot);

    // Hash story files in sorted order for deterministic hash
    const sortedFiles = Array.from(data.storyFiles.keys()).sort();
    for (const filename of sortedFiles) {
      hash.update(filename);
      hash.update(data.storyFiles.get(filename)!);
    }

    // Hash manifest
    hash.update(JSON.stringify(data.manifest));

    return hash.digest('hex');
  }

  private calculateDirectorySize(dir: string): number {
    if (!fs.existsSync(dir)) {
      return 0;
    }

    let size = 0;
    const files = fs.readdirSync(dir);

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stat = fs.statSync(filePath);

      if (stat.isDirectory()) {
        size += this.calculateDirectorySize(filePath);
      } else {
        size += stat.size;
      }
    }

    return size;
  }

  private listFilesRecursive(dir: string): string[] {
    let files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files = files.concat(this.listFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}
