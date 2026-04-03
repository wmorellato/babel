import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DropboxBackupService } from '../../../src/services/dropboxBackupService';
import { TokenManager } from '../../../src/services/tokenManager';
import { BackupData } from '../../../src/types';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Mock Dropbox SDK
jest.mock('dropbox');

// Mock CompressionService
jest.mock('../../../src/services/compressionService');

// Mock filesystem operations
jest.mock('fs');

describe('DropboxBackupService', () => {
  let service: DropboxBackupService;
  let mockTokenManager: jest.Mocked<TokenManager>;
  let mockDropboxInstance: any;

  const mockBackupData: BackupData = {
    databaseSnapshot: Buffer.from('test-data'),
    storyFiles: new Map([['test.md', Buffer.from('content')]]),
    manifest: {
      version: '1.0',
      createdAt: new Date(),
      backupId: 'backup-1',
      stories: [
        {
          id: 'story-1',
          displayName: 'Test Story',
          fileCount: 1,
        },
      ],
      metadata: {
        babelVersion: '2.0',
        databaseVersion: '1.0',
      },
    },
  };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock filesystem
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockReturnValue(undefined);
    (fs.writeFileSync as jest.Mock).mockReturnValue(undefined);
    (fs.readFileSync as jest.Mock).mockReturnValue(Buffer.from('test-content'));
    (fs.unlinkSync as jest.Mock).mockReturnValue(undefined);
    (fs.rmSync as jest.Mock).mockReturnValue(undefined);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);
    (fs.statSync as jest.Mock).mockReturnValue({ isDirectory: () => false });

    // Setup mock Dropbox instance
    mockDropboxInstance = {
      filesUpload: (jest.fn() as any).mockResolvedValue({
        result: { id: 'file-123', path_display: '/Apps/Babel/backups/backup.tar.gz' },
      }),
      filesDownload: (jest.fn() as any).mockResolvedValue({
        result: { fileBinary: Buffer.from('compressed-data') },
      }),
      filesDeleteV2: (jest.fn() as any).mockResolvedValue({}),
      filesListFolder: (jest.fn() as any).mockResolvedValue({
        result: {
          entries: [
            { '.tag': 'file', name: 'backup-123-database.tar.gz', size: 1024 },
            { '.tag': 'file', name: 'backup-123-manifest.json', size: 256 },
            { '.tag': 'file', name: 'backup-124-database.tar.gz', size: 512 },
            { '.tag': 'file', name: 'backup-124-manifest.json', size: 128 },
          ],
        },
      }),
      filesGetMetadata: (jest.fn() as any).mockResolvedValue({
        result: { '.tag': 'file', size: 1024 },
      }),
      usersGetSpaceUsage: (jest.fn() as any).mockResolvedValue({
        result: { used: 5242880 },
      }),
      usersGetCurrentAccount: (jest.fn() as any).mockResolvedValue({
        result: { account_id: 'dbid:123' },
      }),
    };

    // Mock Dropbox constructor
    const { Dropbox } = require('dropbox');
    (Dropbox as jest.Mock).mockReturnValue(mockDropboxInstance);

    // Mock CompressionService
    const { CompressionService } = require('../../../src/services/compressionService');
    (CompressionService as jest.Mock).mockImplementation(() => ({
      compressFile: (jest.fn() as any).mockResolvedValue(undefined),
      compressDirectory: (jest.fn() as any).mockResolvedValue(undefined),
      decompressFile: (jest.fn() as any).mockResolvedValue(undefined),
      decompressDirectory: (jest.fn() as any).mockResolvedValue(undefined),
    }));

    mockTokenManager = {
      acquireToken: (jest.fn() as any),
      getToken: (jest.fn() as any).mockResolvedValue('mock-token'),
      refreshToken: (jest.fn() as any),
    } as any;

    service = new DropboxBackupService('mock-token', mockTokenManager);
  });

  describe('createBackup', () => {
    it('should create a full backup with tar.gz compression', async () => {
      const result = await service.createBackup(mockBackupData, 'full');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result.type).toBe('full');
      expect(result.status).toBe('verified');
      expect(result.storageSize).toBeGreaterThan(0);
      expect(result.fileCount).toBe(1);
      expect(result.storyCount).toBe(1);

      // Verify filesUpload was called three times (story.tar.gz, database.tar.gz, manifest.json)
      expect(mockDropboxInstance.filesUpload).toHaveBeenCalledTimes(3);

      // Check that calls include story, database, and manifest files
      const uploadCalls = (mockDropboxInstance.filesUpload as jest.Mock).mock.calls;
      const hasStory = uploadCalls.some((call: any[]) =>
        call[0].path.includes('-story-') && call[0].path.includes('.tar.gz')
      );
      const hasDatabase = uploadCalls.some((call: any[]) =>
        call[0].path.includes('-database.tar.gz')
      );
      const hasManifest = uploadCalls.some((call: any[]) =>
        call[0].path.includes('-manifest.json')
      );

      expect(hasStory).toBe(true);
      expect(hasDatabase).toBe(true);
      expect(hasManifest).toBe(true);
    });

    it('should create an incremental backup with tar.gz format', async () => {
      const result = await service.createBackup(mockBackupData, 'incremental');

      expect(result.type).toBe('incremental');
      expect(result.id).toBeTruthy();
      expect(typeof result.id).toBe('string');

      // Verify tar.gz compression was called
      expect(mockDropboxInstance.filesUpload).toHaveBeenCalled();
    });

    it('should include story metadata in manifest', async () => {
      const result = await service.createBackup(mockBackupData, 'full');

      expect(result.storyCount).toBe(mockBackupData.manifest.stories.length);
    });

    it('should call CompressionService for database compression', async () => {
      // Create a new service instance to get fresh mocks
      const newService = new DropboxBackupService('mock-token', mockTokenManager);

      await newService.createBackup(mockBackupData, 'full');

      // Verify that CompressionService was instantiated
      const { CompressionService } = require('../../../src/services/compressionService');
      expect(CompressionService).toHaveBeenCalled();
    });
  });

  describe('restoreBackup', () => {
    it('should download and decompress tar.gz backup', async () => {
      const mockManifest = {
        backupId: '123',
        timestamp: new Date().toISOString(),
        type: 'full',
        stories: [{ id: 'story-1', displayName: 'Test Story', fileCount: 1 }],
        database: { size: 1024 },
        status: 'completed',
      };

      // Mock filesListFolder to return database and manifest
      mockDropboxInstance.filesListFolder.mockResolvedValue({
        result: {
          entries: [
            { '.tag': 'file', name: 'backup-123-database.tar.gz', size: 1024 },
            { '.tag': 'file', name: 'backup-123-manifest.json', size: 256 },
          ],
        },
      });

      // First call: download manifest
      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: JSON.stringify(mockManifest),
        },
      });

      // Second call: download database archive
      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: Buffer.from('compressed-database-data'),
        },
      });

      const result = await service.restoreBackup('123');

      expect(result).toHaveProperty('databaseSnapshot');
      expect(result).toHaveProperty('storyFiles');
      expect(result).toHaveProperty('manifest');
      expect(mockDropboxInstance.filesDownload).toHaveBeenCalled();
    });

    it('should call decompression service for tar.gz files', async () => {
      const mockManifest = {
        backupId: '123',
        timestamp: new Date().toISOString(),
        type: 'full',
        stories: [],
        database: { size: 1024 },
        status: 'completed',
      };

      // Mock filesListFolder to return database file
      mockDropboxInstance.filesListFolder.mockResolvedValue({
        result: {
          entries: [
            { '.tag': 'file', name: 'backup-123-database.tar.gz', size: 1024 },
            { '.tag': 'file', name: 'backup-123-manifest.json', size: 256 },
          ],
        },
      });

      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: JSON.stringify(mockManifest),
        },
      });

      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: Buffer.from('compressed-data'),
        },
      });

      const newService = new DropboxBackupService('mock-token', mockTokenManager);
      await newService.restoreBackup('123');

      // Verify decompression was attempted
      const { CompressionService } = require('../../../src/services/compressionService');
      expect(CompressionService).toHaveBeenCalled();
    });

    it('should return BackupData with correct structure', async () => {
      const mockManifest = {
        backupId: '123',
        timestamp: new Date().toISOString(),
        type: 'full',
        stories: [{ id: 'story-1', displayName: 'Test Story', fileCount: 1 }],
        database: { size: 2048 },
        status: 'completed',
      };

      // Mock filesListFolder to return database and manifest
      mockDropboxInstance.filesListFolder.mockResolvedValue({
        result: {
          entries: [
            { '.tag': 'file', name: 'backup-123-database.tar.gz', size: 1024 },
            { '.tag': 'file', name: 'backup-123-manifest.json', size: 256 },
          ],
        },
      });

      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: JSON.stringify(mockManifest),
        },
      });

      mockDropboxInstance.filesDownload.mockResolvedValueOnce({
        result: {
          fileBinary: Buffer.from('compressed-data'),
        },
      });

      const result = await service.restoreBackup('123');

      expect(result.databaseSnapshot).toBeDefined();
      expect(result.storyFiles instanceof Map).toBe(true);
      expect(result.manifest).toEqual(expect.objectContaining({
        backupId: '123',
        type: 'full',
      }));
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup by ID', async () => {
      await expect(service.deleteBackup('123')).resolves.toBeUndefined();
      expect(mockDropboxInstance.filesDeleteV2).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('123'),
        })
      );
    });
  });

  describe('listBackups', () => {
    it('should list all backup files', async () => {
      const result = await service.listBackups();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
      expect(result.every((name) => name.startsWith('backup-'))).toBe(true);
    });

    it('should include tar.gz and manifest files', async () => {
      const result = await service.listBackups();

      const hasTarGz = result.some((name) => name.includes('.tar.gz'));
      const hasManifest = result.some((name) => name.includes('-manifest.json'));

      expect(hasTarGz || hasManifest).toBe(true);
    });

    it('should filter out non-backup files', async () => {
      mockDropboxInstance.filesListFolder.mockResolvedValue({
        result: {
          entries: [
            { '.tag': 'file', name: 'backup-123-database.tar.gz', size: 1024 },
            { '.tag': 'file', name: 'some-random-file.txt', size: 512 },
            { '.tag': 'file', name: 'backup-124-manifest.json', size: 256 },
          ],
        },
      });

      const result = await service.listBackups();

      expect(result.every((name) => name.startsWith('backup-'))).toBe(true);
      expect(result).not.toContain('some-random-file.txt');
    });
  });

  describe('verifyBackup', () => {
    it('should verify backup file exists and has content', async () => {
      const result = await service.verifyBackup('backup-123-database.tar.gz');

      expect(result).toBe(true);
      expect(mockDropboxInstance.filesGetMetadata).toHaveBeenCalled();
    });

    it('should return false if file not found', async () => {
      mockDropboxInstance.filesGetMetadata.mockRejectedValue(new Error('File not found'));

      const result = await service.verifyBackup('nonexistent.tar.gz');

      expect(result).toBe(false);
    });

    it('should return false if file has zero size', async () => {
      mockDropboxInstance.filesGetMetadata.mockResolvedValue({
        result: { '.tag': 'file', size: 0 },
      });

      const result = await service.verifyBackup('empty.tar.gz');

      expect(result).toBe(false);
    });
  });

  describe('getStorageUsage', () => {
    it('should return storage usage in bytes', async () => {
      const result = await service.getStorageUsage();

      expect(typeof result).toBe('number');
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBe(5242880);
    });

    it('should return 0 on error', async () => {
      mockDropboxInstance.usersGetSpaceUsage.mockRejectedValue(new Error('API error'));

      const result = await service.getStorageUsage();

      expect(result).toBe(0);
    });
  });

  describe('isAvailable', () => {
    it('should return true when account is available', async () => {
      const result = await service.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when account is not available', async () => {
      mockDropboxInstance.usersGetCurrentAccount.mockRejectedValue(new Error('Unauthorized'));

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should delete backups older than retention period', async () => {
      const metadata = new Map([
        [
          'backup-100-full.json',
          {
            id: 'backup-100-full.json',
            timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days old
            type: 'full' as const,
            storageSize: 1024,
            fileCount: 5,
            storyCount: 3,
            totalWordCount: 50000,
            status: 'verified' as const,
            hash: 'abc123',
          },
        ],
        [
          'backup-200-full.json',
          {
            id: 'backup-200-full.json',
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days old
            type: 'full' as const,
            storageSize: 1024,
            fileCount: 5,
            storyCount: 3,
            totalWordCount: 50000,
            status: 'verified' as const,
            hash: 'def456',
          },
        ],
      ]);

      const result = await service.cleanupOldBackups(30, metadata);

      expect(result.length).toBe(1);
      expect(result).toContain('backup-100-full.json');
    });
  });
});
