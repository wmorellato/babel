/**
 * Backup Provider Interface
 * Defines contract for local and cloud backup implementations
 */

import { BackupPoint, BackupData } from '../types';

export interface IBackupProvider {
  /**
   * Create a new backup
   */
  createBackup(data: BackupData, type: 'full' | 'incremental'): Promise<BackupPoint>;

  /**
   * Restore a backup
   */
  restoreBackup(backupId: string): Promise<BackupData>;

  /**
   * Delete a backup
   */
  deleteBackup(backupId: string): Promise<void>;

  /**
   * Verify backup integrity
   */
  verifyBackup(backupId: string): Promise<boolean>;

  /**
   * List all backups
   */
  listBackups(): Promise<string[]>;

  /**
   * List all backups with metadata (optional for cloud providers)
   */
  listBackupsWithMetadata?(): Promise<BackupPoint[]>;

  /**
   * Get storage usage
   */
  getStorageUsage(): Promise<number>;

  /**
   * Check if provider is available/authenticated
   */
  isAvailable(): Promise<boolean>;

  /**
   * Cleanup old backups
   */
  cleanupOldBackups(retentionDays: number, backupMetadata: Map<string, BackupPoint>): Promise<string[]>;
}
