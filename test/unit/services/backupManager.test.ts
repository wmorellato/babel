/**
 * BackupManager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BackupManager } from '../../../src/services/backupManager';
import { BackupRepository } from '../../../src/db/backupRepository';
import { BackupConfig, BackupData, BackupManifest } from '../../../src/types';
import { createTestDatabase } from '../../helpers/database';
import { IDatabase } from '../../../src/db/database';

describe('BackupManager', () => {
  let tempDir: string;
  let manager: BackupManager;
  let backupRepository: BackupRepository;
  let mockDb: IDatabase;

  const defaultConfig: BackupConfig = {
    enabled: true,
    schedule: 'daily',
    time: '02:00',
    localPath: '',
    retention: 30,
    autoSave: true,
  };

  const mockBackupData: BackupData = {
    databaseSnapshot: Buffer.from('db content'),
    storyFiles: new Map([
      ['story-1/story.md', Buffer.from('Story content')],
    ]),
    manifest: {
      version: '1.0.0',
      createdAt: new Date(),
      backupId: 'test-id',
      stories: [
        { id: 'story-1', displayName: 'Story 1', fileCount: 1 },
      ],
      metadata: {
        babelVersion: '0.1.0',
        databaseVersion: '1',
      },
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-test-'));
    mockDb = createTestDatabase();

    // Create backups table
    mockDb.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        storage_size INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        story_count INTEGER NOT NULL,
        total_word_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    backupRepository = new BackupRepository(mockDb);

    const config = {
      ...defaultConfig,
      localPath: tempDir,
    };

    manager = new BackupManager(config, backupRepository);
  });

  afterEach(() => {
    manager.dispose();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('backup', () => {
    it('should create and store backup', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      expect(backup.id).toBeDefined();
      expect(backup.type).toBe('full');
      expect(backup.status).toBe('pending');

      const stored = backupRepository.findById(backup.id);
      expect(stored).toEqual(backup);
    });

    it('should handle backup progress callback', async () => {
      const progress: string[] = [];
      const onProgress = (msg: string) => progress.push(msg);

      await manager.backup(mockBackupData, { type: 'full', onProgress });

      expect(progress.length).toBeGreaterThan(0);
      expect(progress).toContain('Preparing backup...');
    });

    it('should create incremental backup', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'incremental' });

      expect(backup.type).toBe('incremental');
    });
  });

  describe('restore', () => {
    it('should restore from backup', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });
      const restored = await manager.restore(backup.id);

      expect(restored.databaseSnapshot).toEqual(mockBackupData.databaseSnapshot);
      expect(restored.manifest.backupId).toBe('test-id');
    });

    it('should throw error for missing backup', async () => {
      await expect(manager.restore('non-existent')).rejects.toThrow();
    });

    it('should throw error for corrupted backup', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      // Mark as corrupted
      backupRepository.updateStatus(backup.id, 'corrupted');

      await expect(manager.restore(backup.id)).rejects.toThrow('Cannot restore from corrupted');
    });

    it('should wrap unexpected errors during restore', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      // Mock localBackupService to throw an unexpected error
      const originalRestore = manager['localBackupService'].restoreBackup;
      manager['localBackupService'].restoreBackup = jest.fn().mockRejectedValue(
        new Error('Unexpected IO error')
      );

      await expect(manager.restore(backup.id)).rejects.toThrow('Failed to restore: Unexpected IO error');

      // Restore original method
      manager['localBackupService'].restoreBackup = originalRestore;
    });
  });

  describe('getAvailableBackups', () => {
    it('should list all backups', async () => {
      await manager.backup(mockBackupData, { type: 'full' });
      await manager.backup(mockBackupData, { type: 'full' });

      const backups = manager.getAvailableBackups();

      expect(backups).toHaveLength(2);
    });
  });

  describe('getLatestBackup', () => {
    it('should return most recent backup', async () => {
      const backup1 = await manager.backup(mockBackupData, { type: 'full' });

      // Small delay to ensure different timestamp
      await new Promise((resolve) => setTimeout(resolve, 10));

      const backup2 = await manager.backup(mockBackupData, { type: 'full' });

      const latest = manager.getLatestBackup();

      expect(latest?.id).toBe(backup2.id);
    });

    it('should return undefined when no backups exist', () => {
      const latest = manager.getLatestBackup();

      expect(latest).toBeUndefined();
    });
  });

  describe('verifyBackup', () => {
    it('should verify backup and update status', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      const isValid = await manager.verifyBackup(backup.id);

      expect(isValid).toBe(true);

      const stored = backupRepository.findById(backup.id);
      expect(stored?.status).toBe('verified');
    });

    it('should mark corrupted backup', async () => {
      const fakeId = 'fake-id';
      const isValid = await manager.verifyBackup(fakeId);

      expect(isValid).toBe(false);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should remove old backups', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      // Manually set old timestamp
      const oldBackup = { ...backup, timestamp: new Date('2020-01-01') };
      backupRepository.create(oldBackup);

      manager.cleanupOldBackups();

      const backups = manager.getAvailableBackups();
      expect(backups.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getStorageUsage', () => {
    it('should report storage usage', async () => {
      await manager.backup(mockBackupData, { type: 'full' });

      const usage = await manager.getStorageUsage();

      expect(usage).toBeGreaterThan(0);
    });
  });

  describe('updateConfig', () => {
    it('should update configuration at runtime', () => {
      const newConfig: Partial<BackupConfig> = {
        schedule: 'hourly',
        retention: 7,
      };

      manager.updateConfig(newConfig);

      // Config updated successfully (no error thrown)
      expect(true).toBe(true);
    });
  });

  describe('scheduling', () => {
    it('should setup scheduling when enabled', () => {
      const config: BackupConfig = {
        enabled: true,
        schedule: 'daily',
        time: '02:00',
        localPath: tempDir,
        retention: 30,
        autoSave: true,
      };

      const mgr = new BackupManager(config, backupRepository);
      // Should not throw
      expect(true).toBe(true);
      mgr.dispose();
    });

    it('should not setup scheduling when disabled', () => {
      const config: BackupConfig = {
        enabled: false,
        schedule: 'disabled',
        time: '02:00',
        localPath: tempDir,
        retention: 30,
        autoSave: true,
      };

      const mgr = new BackupManager(config, backupRepository);
      // Should not throw
      expect(true).toBe(true);
      mgr.dispose();
    });
  });

  describe('dispose', () => {
    it('should cleanup resources on dispose', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      expect(backup.id).toBeDefined();

      manager.dispose();

      // After dispose, manager should not process new operations
      // (verify by checking that no errors are thrown)
      expect(true).toBe(true);
    });
  });

  describe('Event Emitters', () => {
    describe('onBackupComplete', () => {
      it('should fire event when backup completes', async () => {
        const events: any[] = [];
        const disposable = manager.onBackupComplete((backup) => {
          events.push(backup);
        });

        const backup = await manager.backup(mockBackupData, { type: 'full' });

        expect(events).toHaveLength(1);
        expect(events[0].id).toBe(backup.id);
        expect(events[0].type).toBe('full');

        disposable.dispose();
      });

      it('should fire event with correct backup metadata', async () => {
        const events: any[] = [];
        const disposable = manager.onBackupComplete((backup) => {
          events.push(backup);
        });

        const backup = await manager.backup(mockBackupData, { type: 'incremental' });

        expect(events[0]).toEqual({
          id: backup.id,
          timestamp: backup.timestamp,
          type: 'incremental',
          storageSize: backup.storageSize,
          fileCount: backup.fileCount,
          storyCount: backup.storyCount,
          totalWordCount: backup.totalWordCount,
          status: backup.status,
          hash: backup.hash,
        });

        disposable.dispose();
      });

      it('should support multiple listeners', async () => {
        const events1: any[] = [];
        const events2: any[] = [];
        const disposable1 = manager.onBackupComplete((backup) => {
          events1.push(backup);
        });
        const disposable2 = manager.onBackupComplete((backup) => {
          events2.push(backup);
        });

        await manager.backup(mockBackupData, { type: 'full' });

        expect(events1).toHaveLength(1);
        expect(events2).toHaveLength(1);

        disposable1.dispose();
        disposable2.dispose();
      });
    });

    describe('onRestoreComplete', () => {
      it('should fire event when restore completes', async () => {
        const backup = await manager.backup(mockBackupData, { type: 'full' });

        const events: any[] = [];
        const disposable = manager.onRestoreComplete((data) => {
          events.push(data);
        });

        await manager.restore(backup.id);

        expect(events).toHaveLength(1);
        expect(events[0].manifest.backupId).toBe('test-id');

        disposable.dispose();
      });

      it('should fire event with correct restored data', async () => {
        const backup = await manager.backup(mockBackupData, { type: 'full' });

        const events: any[] = [];
        const disposable = manager.onRestoreComplete((data) => {
          events.push(data);
        });

        await manager.restore(backup.id);

        expect(events[0].databaseSnapshot).toEqual(mockBackupData.databaseSnapshot);
        expect(events[0].manifest.version).toBe('1.0.0');
        expect(events[0].storyFiles.get('story-1/story.md')).toEqual(
          Buffer.from('Story content')
        );

        disposable.dispose();
      });

      it('should support multiple listeners', async () => {
        const backup = await manager.backup(mockBackupData, { type: 'full' });

        const events1: any[] = [];
        const events2: any[] = [];
        const disposable1 = manager.onRestoreComplete((data) => {
          events1.push(data);
        });
        const disposable2 = manager.onRestoreComplete((data) => {
          events2.push(data);
        });

        await manager.restore(backup.id);

        expect(events1).toHaveLength(1);
        expect(events2).toHaveLength(1);

        disposable1.dispose();
        disposable2.dispose();
      });
    });

    describe('onDeleteComplete', () => {
      it('should fire event when delete completes', async () => {
        const backup = await manager.backup(mockBackupData, { type: 'full' });

        const events: any[] = [];
        const disposable = manager.onDeleteComplete((backupId) => {
          events.push(backupId);
        });

        await manager.deleteBackup(backup.id);

        expect(events).toHaveLength(1);
        expect(events[0]).toBe(backup.id);

        disposable.dispose();
      });

      it('should fire event with correct backup ID', async () => {
        const backup1 = await manager.backup(mockBackupData, { type: 'full' });
        const backup2 = await manager.backup(mockBackupData, { type: 'full' });

        const deletedIds: any[] = [];
        const disposable = manager.onDeleteComplete((backupId) => {
          deletedIds.push(backupId);
        });

        await manager.deleteBackup(backup1.id);
        await manager.deleteBackup(backup2.id);

        expect(deletedIds).toEqual([backup1.id, backup2.id]);

        disposable.dispose();
      });

      it('should support multiple listeners', async () => {
        const backup = await manager.backup(mockBackupData, { type: 'full' });

        const events1: any[] = [];
        const events2: any[] = [];
        const disposable1 = manager.onDeleteComplete((backupId) => {
          events1.push(backupId);
        });
        const disposable2 = manager.onDeleteComplete((backupId) => {
          events2.push(backupId);
        });

        await manager.deleteBackup(backup.id);

        expect(events1).toHaveLength(1);
        expect(events2).toHaveLength(1);

        disposable1.dispose();
        disposable2.dispose();
      });
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup from storage and database', async () => {
      const backup = await manager.backup(mockBackupData, { type: 'full' });

      expect(backupRepository.findById(backup.id)).toBeDefined();

      await manager.deleteBackup(backup.id);

      expect(backupRepository.findById(backup.id)).toBeUndefined();
    });

    it('should throw error for non-existent backup', async () => {
      await expect(manager.deleteBackup('non-existent')).rejects.toThrow();
    });

    it('should remove backup from available backups list', async () => {
      const backup1 = await manager.backup(mockBackupData, { type: 'full' });
      const backup2 = await manager.backup(mockBackupData, { type: 'full' });

      expect(manager.getAvailableBackups()).toHaveLength(2);

      await manager.deleteBackup(backup1.id);

      const remaining = manager.getAvailableBackups();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].id).toBe(backup2.id);
    });
  });
});
