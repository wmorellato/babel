/**
 * LocalBackupService Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { LocalBackupService } from '../../../src/services/localBackupService';
import { BackupData, BackupManifest } from '../../../src/types';

describe('LocalBackupService', () => {
  let tempDir: string;
  let service: LocalBackupService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-test-'));
    service = new LocalBackupService(tempDir);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('createBackup', () => {
    it('should create a full backup with metadata', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-1',
        stories: [
          { id: 'story-1', displayName: 'Story 1', fileCount: 1 },
        ],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('fake db'),
        storyFiles: new Map([
          ['story-1/story.md', Buffer.from('# Story 1\n\nContent')],
        ]),
        manifest,
      };

      const backup = await service.createBackup(data, 'full');

      expect(backup.id).toBeDefined();
      expect(backup.type).toBe('full');
      expect(backup.status).toBe('pending');
      expect(backup.hash).toBeDefined();
      expect(backup.storageSize).toBeGreaterThan(0);
      expect(backup.fileCount).toBe(1);
      expect(backup.storyCount).toBe(1);
      expect(backup.timestamp).toBeInstanceOf(Date);
    });

    it('should create an incremental backup', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-2',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('incremental db'),
        storyFiles: new Map(),
        manifest,
      };

      const backup = await service.createBackup(data, 'incremental');

      expect(backup.type).toBe('incremental');
    });

    it('should store backup files on disk', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-3',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('db content'),
        storyFiles: new Map([
          ['story.md', Buffer.from('content')],
        ]),
        manifest,
      };

      const backup = await service.createBackup(data, 'full');
      const backupPath = path.join(tempDir, backup.id);

      expect(fs.existsSync(backupPath)).toBe(true);
      expect(fs.existsSync(path.join(backupPath, 'database.db'))).toBe(true);
      expect(fs.existsSync(path.join(backupPath, 'manifest.json'))).toBe(true);
      expect(fs.existsSync(path.join(backupPath, 'files', 'story.md'))).toBe(true);
    });
  });

  describe('restoreBackup', () => {
    it('should restore backup data', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-4',
        stories: [
          { id: 'story-1', displayName: 'Test Story', fileCount: 1 },
        ],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const originalData: BackupData = {
        databaseSnapshot: Buffer.from('original db'),
        storyFiles: new Map([
          ['story.md', Buffer.from('original content')],
        ]),
        manifest,
      };

      const backup = await service.createBackup(originalData, 'full');
      const restoredData = await service.restoreBackup(backup.id);

      expect(restoredData.databaseSnapshot).toEqual(originalData.databaseSnapshot);
      expect(restoredData.storyFiles.get('story.md')).toEqual(originalData.storyFiles.get('story.md'));
      expect(restoredData.manifest.backupId).toBe('test-backup-4');
    });

    it('should throw error for non-existent backup', async () => {
      await expect(service.restoreBackup('non-existent')).rejects.toThrow('Backup not found');
    });
  });

  describe('deleteBackup', () => {
    it('should delete backup directory', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-5',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('db'),
        storyFiles: new Map(),
        manifest,
      };

      const backup = await service.createBackup(data, 'full');
      const backupPath = path.join(tempDir, backup.id);

      expect(fs.existsSync(backupPath)).toBe(true);

      service.deleteBackup(backup.id);

      expect(fs.existsSync(backupPath)).toBe(false);
    });
  });

  describe('verifyBackup', () => {
    it('should verify valid backup', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-6',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('db'),
        storyFiles: new Map(),
        manifest,
      };

      const backup = await service.createBackup(data, 'full');
      const isValid = await service.verifyBackup(backup.id);

      expect(isValid).toBe(true);
    });

    it('should detect invalid backup', async () => {
      const isValid = await service.verifyBackup('non-existent');
      expect(isValid).toBe(false);
    });
  });

  describe('listBackups', () => {
    it('should list all backups', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-7',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('db'),
        storyFiles: new Map(),
        manifest,
      };

      const backup1 = await service.createBackup(data, 'full');
      const backup2 = await service.createBackup(data, 'full');

      const backups = await service.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups).toContain(backup1.id);
      expect(backups).toContain(backup2.id);
    });
  });

  describe('getStorageUsage', () => {
    it('should calculate storage usage', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-8',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('a'.repeat(1000)),
        storyFiles: new Map([
          ['story.md', Buffer.from('b'.repeat(500))],
        ]),
        manifest,
      };

      const backup = await service.createBackup(data, 'full');
      const usage = await service.getStorageUsage();

      expect(usage).toBeGreaterThan(0);
    });
  });

  describe('cleanOldBackups', () => {
    it('should clean backups older than retention days', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: 'test-backup-9',
        stories: [],
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      const data: BackupData = {
        databaseSnapshot: Buffer.from('db'),
        storyFiles: new Map(),
        manifest,
      };

      const backup1 = await service.createBackup(data, 'full');

      // Create old backup entry
      const oldBackup = { ...backup1 };
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 40);
      oldBackup.timestamp = oldDate;

      const metadata = new Map<string, typeof backup1>([
        [backup1.id, backup1],
        ['old-id', oldBackup],
      ]);

      const deleted = await service.cleanOldBackups(30, metadata);

      // Only old backup should be marked for deletion
      expect(deleted).toContain('old-id');
      expect(deleted).not.toContain(backup1.id);
    });
  });
});
