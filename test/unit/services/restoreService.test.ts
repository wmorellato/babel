/**
 * RestoreService Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { RestoreService } from '../../../src/services/restoreService';
import { BackupData, BackupManifest } from '../../../src/types';

describe('RestoreService', () => {
  let tempDir: string;
  let databasePath: string;
  let workspaceRoot: string;

  const mockBackupData: BackupData = {
    databaseSnapshot: Buffer.from('restored db content'),
    storyFiles: new Map([
      ['story-1/story.md', Buffer.from('# Story 1\n\nRestored content')],
      ['story-2/essay.md', Buffer.from('Essay content')],
    ]),
    manifest: {
      version: '1.0.0',
      createdAt: new Date(),
      backupId: 'backup-123',
      stories: [
        { id: 'story-1', displayName: 'Story 1', fileCount: 1 },
        { id: 'story-2', displayName: 'Story 2', fileCount: 1 },
      ],
      metadata: {
        babelVersion: '0.1.0',
        databaseVersion: '1',
      },
    },
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-test-'));
    databasePath = path.join(tempDir, 'babel.db');
    workspaceRoot = path.join(tempDir, 'workspace');
    fs.mkdirSync(workspaceRoot, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('restore', () => {
    it('should restore database and files', async () => {
      const restoreOptions = {
        backupId: 'backup-123',
        databasePath,
        workspaceRoot,
      };

      await RestoreService.restore(mockBackupData, restoreOptions);

      // Verify database restored
      expect(fs.existsSync(databasePath)).toBe(true);
      const restoredDb = fs.readFileSync(databasePath);
      expect(restoredDb).toEqual(mockBackupData.databaseSnapshot);

      // Verify story files restored
      expect(fs.existsSync(path.join(workspaceRoot, 'story-1', 'story.md'))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, 'story-2', 'essay.md'))).toBe(true);

      const content1 = fs.readFileSync(path.join(workspaceRoot, 'story-1', 'story.md'));
      expect(content1).toEqual(Buffer.from('# Story 1\n\nRestored content'));
    });

    it('should handle progress callback', async () => {
      const progress: string[] = [];
      const onProgress = (msg: string) => progress.push(msg);

      const restoreOptions = {
        backupId: 'backup-123',
        databasePath,
        workspaceRoot,
        onProgress,
      };

      await RestoreService.restore(mockBackupData, restoreOptions);

      expect(progress).toContain('Validating backup...');
      expect(progress).toContain('Restoring database...');
      expect(progress).toContain('Restoring story files...');
    });

    it('should create pre-restore backups', async () => {
      // Create existing files to backup
      fs.writeFileSync(databasePath, Buffer.from('old db'));
      const storyPath = path.join(workspaceRoot, 'existing', 'story.md');
      fs.mkdirSync(path.dirname(storyPath), { recursive: true });
      fs.writeFileSync(storyPath, 'old content');

      const restoreOptions = {
        backupId: 'backup-123',
        databasePath,
        workspaceRoot,
      };

      await RestoreService.restore(mockBackupData, restoreOptions);

      // Verify pre-restore backup created
      const preRestoreDb = databasePath + '.pre-restore';
      expect(fs.existsSync(preRestoreDb)).toBe(true);
      expect(fs.readFileSync(preRestoreDb)).toEqual(Buffer.from('old db'));
    });

    it('should handle empty backup data', async () => {
      const emptyData: BackupData = {
        databaseSnapshot: Buffer.from(''),
        storyFiles: new Map(),
        manifest: {
          version: '1.0.0',
          createdAt: new Date(),
          backupId: 'empty-backup',
          stories: [],
          metadata: {
            babelVersion: '0.1.0',
            databaseVersion: '1',
          },
        },
      };

      const restoreOptions = {
        backupId: 'empty-backup',
        databasePath,
        workspaceRoot,
      };

      await RestoreService.restore(emptyData, restoreOptions);

      expect(fs.existsSync(databasePath)).toBe(true);
    });

    it('should throw error for invalid backup', async () => {
      const invalidData: BackupData = {
        databaseSnapshot: Buffer.from(''),
        storyFiles: new Map(),
        manifest: null as any,
      };

      const restoreOptions = {
        backupId: 'invalid',
        databasePath,
        workspaceRoot,
      };

      await expect(RestoreService.restore(invalidData, restoreOptions)).rejects.toThrow(
        'Invalid backup data'
      );
    });
  });

  describe('backupCurrentState', () => {
    it('should backup current database and files', async () => {
      const backupDir = path.join(tempDir, 'pre-restore');
      fs.mkdirSync(backupDir, { recursive: true });

      // Create current files
      fs.writeFileSync(databasePath, 'current db');
      const storyPath = path.join(workspaceRoot, 'story', 'content.md');
      fs.mkdirSync(path.dirname(storyPath), { recursive: true });
      fs.writeFileSync(storyPath, 'current content');

      await RestoreService.backupCurrentState(databasePath, workspaceRoot, backupDir);

      expect(fs.existsSync(path.join(backupDir, 'pre-restore-database.db'))).toBe(true);
      expect(fs.existsSync(path.join(backupDir, 'pre-restore-files'))).toBe(true);
    });

    it('should handle missing current files gracefully', async () => {
      const backupDir = path.join(tempDir, 'pre-restore');
      fs.mkdirSync(backupDir, { recursive: true });

      // Should not throw
      await RestoreService.backupCurrentState('/non/existent/path.db', workspaceRoot, backupDir);

      expect(true).toBe(true);
    });
  });

  describe('listRestorePoints', () => {
    it('should list verified backups sorted by date', async () => {
      const backup1 = {
        id: 'backup-1',
        timestamp: new Date('2024-01-01'),
        type: 'full' as const,
        storageSize: 100,
        fileCount: 1,
        storyCount: 1,
        totalWordCount: 100,
        status: 'verified' as const,
        hash: 'hash1',
      };

      const backup2 = {
        id: 'backup-2',
        timestamp: new Date('2024-01-02'),
        type: 'full' as const,
        storageSize: 100,
        fileCount: 1,
        storyCount: 1,
        totalWordCount: 100,
        status: 'verified' as const,
        hash: 'hash2',
      };

      const corrupted = {
        id: 'backup-3',
        timestamp: new Date('2024-01-03'),
        type: 'full' as const,
        storageSize: 100,
        fileCount: 1,
        storyCount: 1,
        totalWordCount: 100,
        status: 'corrupted' as const,
        hash: 'hash3',
      };

      const restorePoints = await RestoreService.listRestorePoints([
        backup1,
        corrupted,
        backup2,
      ]);

      expect(restorePoints).toHaveLength(2);
      expect(restorePoints[0].id).toBe('backup-2'); // Most recent first
      expect(restorePoints[1].id).toBe('backup-1');
    });

    it('should return empty list for no verified backups', async () => {
      const corrupted = {
        id: 'backup-1',
        timestamp: new Date(),
        type: 'full' as const,
        storageSize: 100,
        fileCount: 1,
        storyCount: 1,
        totalWordCount: 100,
        status: 'corrupted' as const,
        hash: 'hash',
      };

      const restorePoints = await RestoreService.listRestorePoints([corrupted]);

      expect(restorePoints).toHaveLength(0);
    });
  });

  describe('nested directory structure', () => {
    it('should restore files with nested directory structure', async () => {
      const nestedData: BackupData = {
        databaseSnapshot: Buffer.from('db'),
        storyFiles: new Map([
          ['story-1/versions/v1.md', Buffer.from('Version 1')],
          ['story-1/versions/v2.md', Buffer.from('Version 2')],
          ['story-2/resources/image.bin', Buffer.from('image')],
        ]),
        manifest: {
          version: '1.0.0',
          createdAt: new Date(),
          backupId: 'nested-backup',
          stories: [],
          metadata: {
            babelVersion: '0.1.0',
            databaseVersion: '1',
          },
        },
      };

      const restoreOptions = {
        backupId: 'nested-backup',
        databasePath,
        workspaceRoot,
      };

      await RestoreService.restore(nestedData, restoreOptions);

      expect(fs.existsSync(path.join(workspaceRoot, 'story-1', 'versions', 'v1.md'))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, 'story-1', 'versions', 'v2.md'))).toBe(true);
      expect(fs.existsSync(path.join(workspaceRoot, 'story-2', 'resources', 'image.bin'))).toBe(true);
    });
  });
});
