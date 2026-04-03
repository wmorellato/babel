/**
 * Backup Manager
 * Orchestrates backup scheduling and coordination
 */

import * as path from 'path';
import * as os from 'os';
import * as vscode from 'vscode';
import { BackupConfig, BackupPoint, BackupData } from '../types';
import { BackupRepository } from '../db/backupRepository';
import { LocalBackupService } from './localBackupService';
import { TokenManager } from './tokenManager';
import { BabelSettings } from './babelSettings';
import { DropboxBackupService } from './dropboxBackupService';
import { IBackupProvider } from './iBackupProvider';
import { Logger } from '../utils/logger';
import { BackupError } from '../utils/errorHandler';

const logger = new Logger('BackupManager');

interface BackupOptions {
  type: 'full' | 'incremental';
  onProgress?: (message: string) => void;
}

export class BackupManager {
  private config: BackupConfig;
  private backupRepository: BackupRepository;
  private localBackupService: LocalBackupService;
  private cloudBackupService?: IBackupProvider;
  private cloudBackupInitialized: boolean = false;
  private scheduledBackupId: NodeJS.Timeout | null = null;
  private lastBackupTime: Map<string, Date> = new Map();
  private onScheduledBackup?: () => Promise<void>;

  // Event emitters for lifecycle events
  private onBackupCompleteEmitter = new vscode.EventEmitter<BackupPoint>();
  private onRestoreCompleteEmitter = new vscode.EventEmitter<BackupData>();
  private onDeleteCompleteEmitter = new vscode.EventEmitter<string>();
  private onCloudBackupCompleteEmitter = new vscode.EventEmitter<BackupPoint>();

  // Public event properties
  readonly onBackupComplete = this.onBackupCompleteEmitter.event;
  readonly onRestoreComplete = this.onRestoreCompleteEmitter.event;
  readonly onDeleteComplete = this.onDeleteCompleteEmitter.event;
  readonly onCloudBackupComplete = this.onCloudBackupCompleteEmitter.event;

  constructor(
    config: BackupConfig,
    backupRepository: BackupRepository,
    onScheduledBackup?: () => Promise<void>,
    private tokenManager?: TokenManager
  ) {
    this.config = this.resolveConfig(config);
    this.backupRepository = backupRepository;
    this.onScheduledBackup = onScheduledBackup;

    // Ensure backup directory exists
    const backupDir = this.expandPath(this.config.localPath);
    this.localBackupService = new LocalBackupService(backupDir);

    this.setupScheduling();
  }

  /**
   * Initialize cloud backup service if Dropbox is enabled
   */
  private async initializeCloudBackup(): Promise<void> {
    if (!BabelSettings.isDropboxEnabled() || !this.tokenManager) {
      return;
    }

    try {
      const clientId = BabelSettings.getBackupSetting<string>('dropbox.clientId');

      if (!clientId) {
        logger.debug('Dropbox clientId not configured, skipping cloud backup');
        return;
      }

      // Get access token from TokenManager
      const accessToken = await this.tokenManager.getValidToken('dropbox');

      if (!accessToken) {
        logger.debug('Dropbox access token not available');
        return;
      }

      const service = new DropboxBackupService(accessToken, this.tokenManager);

      // Test if credentials available
      if (await service.isAvailable()) {
        this.cloudBackupService = service;
        logger.info('Dropbox cloud backup initialized');
      }
    } catch (error) {
      logger.error('Failed to initialize Dropbox backup', { error });
    }
  }

  /**
   * Create a backup
   */
  async backup(data: BackupData, options: BackupOptions = { type: 'full' }): Promise<BackupPoint> {
    try {
      options.onProgress?.('Preparing backup...');

      // Initialize cloud backup on first use if not already done
      if (!this.cloudBackupInitialized) {
        await this.initializeCloudBackup();
        this.cloudBackupInitialized = true;
      }

      // Create backup
      const backup = await this.localBackupService.createBackup(data, options.type);
      options.onProgress?.('Storing backup metadata...');

      // Persist metadata
      this.backupRepository.create(backup);
      this.lastBackupTime.set(data.manifest.backupId, new Date());

      // Fire backup complete event
      this.onBackupCompleteEmitter.fire(backup);

      // Also backup to cloud if available (non-blocking)
      if (this.cloudBackupService && (await this.cloudBackupService.isAvailable())) {
        (async () => {
          try {
            await this.cloudBackupService!.createBackup(data, options.type);
            logger.info('Cloud backup completed for backup ' + backup.id);
            // Notify listeners that cloud backup is complete
            this.onCloudBackupCompleteEmitter.fire(backup);
          } catch (error) {
            logger.warn(`Cloud backup failed (local backup succeeded): ${error}`);
          }
        })(); // Fire and forget
      }

      options.onProgress?.('Backup completed');
      return backup;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BackupError(`Failed to backup: ${errorMessage}`);
    }
  }

  /**
   * Restore from a backup
   */
  async restore(backupId: string): Promise<BackupData> {
    try {
      const backup = this.backupRepository.findById(backupId);
      if (!backup) {
        throw new BackupError(`Backup not found: ${backupId}`);
      }

      if (backup.status === 'corrupted') {
        throw new BackupError(`Cannot restore from corrupted backup: ${backupId}`);
      }

      const restoredData = await this.localBackupService.restoreBackup(backupId);

      // Fire restore complete event
      this.onRestoreCompleteEmitter.fire(restoredData);

      return restoredData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BackupError(`Failed to restore: ${errorMessage}`);
    }
  }

  /**
   * Get list of available backups
   */
  getAvailableBackups(): BackupPoint[] {
    return this.backupRepository.findAll();
  }

  /**
   * Get cloud backups from Dropbox
   */
  async getCloudBackups(): Promise<BackupPoint[]> {
    // Initialize cloud backup service if not already done
    if (!this.cloudBackupInitialized) {
      await this.initializeCloudBackup();
      this.cloudBackupInitialized = true;
    }

    if (!this.cloudBackupService) {
      return [];
    }

    try {
      // Check if the cloud service has the method to list with metadata
      if ('listBackupsWithMetadata' in this.cloudBackupService) {
        return await (this.cloudBackupService as any).listBackupsWithMetadata();
      }
      return [];
    } catch (error) {
      logger.error('Failed to get cloud backups', { error });
      return [];
    }
  }

  /**
   * Get latest backup
   */
  getLatestBackup(): BackupPoint | undefined {
    return this.backupRepository.getLatest();
  }

  /**
   * Cleanup old backups based on retention policy
   */
  async cleanupOldBackups(): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.retention);

      const deleted = this.backupRepository.deleteOlderThan(cutoffDate);
      logger.info('Old backups cleaned', { count: deleted });
    } catch (error) {
      logger.error('Failed to cleanup old backups', { error });
    }
  }

  /**
   * Get storage usage
   */
  async getStorageUsage(): Promise<number> {
    return await this.localBackupService.getStorageUsage();
  }

  /**
   * Update config at runtime
   */
  updateConfig(newConfig: Partial<BackupConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.stopScheduling();
    this.setupScheduling();
    logger.info('Backup config updated', { config: this.config });
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    const isValid = await this.localBackupService.verifyBackup(backupId);

    if (isValid) {
      this.backupRepository.updateStatus(backupId, 'verified');
    } else {
      this.backupRepository.updateStatus(backupId, 'corrupted');
    }

    return isValid;
  }

  /**
   * Delete a backup
   */
  async deleteBackup(backupId: string): Promise<void> {
    try {
      const backup = this.backupRepository.findById(backupId);
      if (!backup) {
        throw new BackupError(`Backup not found: ${backupId}`);
      }

      // Delete from local storage
      await this.localBackupService.deleteBackup(backupId);

      // Delete from database
      this.backupRepository.delete(backupId);

      // Fire delete complete event
      this.onDeleteCompleteEmitter.fire(backupId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new BackupError(`Failed to delete backup: ${errorMessage}`);
    }
  }

  /**
   * Cleanup - stop scheduling
   */
  dispose(): void {
    this.stopScheduling();
    if ('dispose' in this.onBackupCompleteEmitter) {
      this.onBackupCompleteEmitter.dispose();
    }
    if ('dispose' in this.onRestoreCompleteEmitter) {
      this.onRestoreCompleteEmitter.dispose();
    }
    if ('dispose' in this.onDeleteCompleteEmitter) {
      this.onDeleteCompleteEmitter.dispose();
    }
    if ('dispose' in this.onCloudBackupCompleteEmitter) {
      this.onCloudBackupCompleteEmitter.dispose();
    }
    logger.info('BackupManager disposed');
  }

  private setupScheduling(): void {
    if (!this.config.enabled || this.config.schedule === 'disabled') {
      return;
    }

    // Schedule based on configuration
    const scheduleMs = this.getScheduleInterval();
    const delayMs = this.calculateDelayUntilNextRun();

    logger.info('Backup scheduling started', {
      schedule: this.config.schedule,
      time: this.config.time,
    });

    // Schedule first backup at configured time
    this.scheduledBackupId = setTimeout(async () => {
      // Run first backup
      await this.runScheduledBackup();

      // Then reschedule to run periodically
      this.scheduledBackupId = setInterval(async () => {
        await this.runScheduledBackup();
      }, scheduleMs);
    }, delayMs);
  }

  private async runScheduledBackup(): Promise<void> {
    try {
      logger.info('Running scheduled backup', { schedule: this.config.schedule });
      if (this.onScheduledBackup) {
        await this.onScheduledBackup();
      }
    } catch (error) {
      logger.error('Scheduled backup failed', { error });
    }
  }

  private stopScheduling(): void {
    if (this.scheduledBackupId) {
      clearTimeout(this.scheduledBackupId);
      clearInterval(this.scheduledBackupId);
      this.scheduledBackupId = null;
      logger.info('Backup scheduling stopped');
    }
  }

  private getScheduleInterval(): number {
    switch (this.config.schedule) {
      case 'hourly':
        return 60 * 60 * 1000;
      case 'daily':
        return 24 * 60 * 60 * 1000;
      case 'weekly':
        return 7 * 24 * 60 * 60 * 1000;
      case 'disabled':
      default:
        return 0;
    }
  }

  private calculateDelayUntilNextRun(): number {
    const [hours, minutes] = this.config.time.split(':').map(Number);
    const now = new Date();
    const nextRun = new Date(now);

    nextRun.setHours(hours, minutes, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }

    return nextRun.getTime() - now.getTime();
  }

  private resolveConfig(config: BackupConfig): BackupConfig {
    return {
      ...config,
      localPath: this.expandPath(config.localPath),
    };
  }

  private expandPath(p: string): string {
    if (p.startsWith('${userHome}')) {
      return p.replace('${userHome}', os.homedir());
    }
    if (p.startsWith('~')) {
      return path.join(os.homedir(), p.slice(1));
    }
    return p;
  }
}
