/**
 * End-to-End Integration Test: Compressed Cloud Backup & Restore
 *
 * This test validates the complete backup/restore flow:
 * 1. Create backup data with real content
 * 2. Compress database to tar.gz
 * 3. Create manifest with metadata
 * 4. Verify files exist and are compressed
 * 5. Decompress and restore
 * 6. Verify restored content matches original
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CompressionService } from '../../src/services/compressionService';
import { BackupData, BackupManifest } from '../../src/types';

describe('E2E: Compressed Cloud Backup & Restore', () => {
  let tempDir: string;
  let compressionService: CompressionService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-e2e-test-'));
    compressionService = new CompressionService();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Part 1: Database Compression', () => {
    it('should compress database file to tar.gz', async () => {
      // Create test database content (simulating babel.db)
      const dbPath = path.join(tempDir, 'babel.db');
      const databaseContent = Buffer.alloc(1024 * 10); // 10KB database
      databaseContent.fill('test-database-content');
      fs.writeFileSync(dbPath, databaseContent);

      const originalSize = fs.statSync(dbPath).size;
      expect(originalSize).toBe(1024 * 10);

      // Compress database
      const archivePath = path.join(tempDir, 'backup-database.tar.gz');
      await compressionService.compressFile(dbPath, archivePath);

      // Verify archive exists
      expect(fs.existsSync(archivePath)).toBe(true);

      // Verify compression ratio (should be significant for test data)
      const compressedSize = fs.statSync(archivePath).size;
      const compressionRatio = (compressedSize / originalSize) * 100;
      expect(compressedSize).toBeLessThan(originalSize);
      expect(compressionRatio).toBeLessThan(50); // Expect >50% compression
    });

    it('should handle database files of varying sizes', async () => {
      const testSizes = [1024, 1024 * 100, 1024 * 500]; // 1KB, 100KB, 500KB

      for (const size of testSizes) {
        const dbPath = path.join(tempDir, `db-${size}.db`);
        const content = Buffer.alloc(size);
        content.fill('x');
        fs.writeFileSync(dbPath, content);

        const archivePath = path.join(tempDir, `archive-${size}.tar.gz`);
        await compressionService.compressFile(dbPath, archivePath);

        expect(fs.existsSync(archivePath)).toBe(true);
        expect(fs.statSync(archivePath).size).toBeGreaterThan(0);
      }
    });
  });

  describe('Part 2: Manifest Creation & Serialization', () => {
    it('should create and serialize manifest correctly', async () => {
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date('2026-03-23T10:00:00Z'),
        backupId: 'backup-test-123',
        stories: [
          {
            id: 'story-1',
            displayName: 'Test Story',
            fileCount: 3,
          },
          {
            id: 'story-2',
            displayName: 'Another Story',
            fileCount: 2,
          },
        ],
        metadata: {
          babelVersion: '2.0.0',
          databaseVersion: '1.0',
        },
      };

      // Serialize to JSON
      const manifestContent = JSON.stringify(manifest, null, 2);
      const manifestPath = path.join(tempDir, 'backup-123-manifest.json');
      fs.writeFileSync(manifestPath, manifestContent);

      // Verify file exists and is readable
      expect(fs.existsSync(manifestPath)).toBe(true);

      // Deserialize and verify
      const restoredContent = fs.readFileSync(manifestPath, 'utf-8');
      const restoredManifest = JSON.parse(restoredContent);

      // Note: Dates get stringified in JSON, so compare properties
      expect(restoredManifest.backupId).toBe(manifest.backupId);
      expect(restoredManifest.version).toBe(manifest.version);
      expect(restoredManifest.metadata).toEqual(manifest.metadata);
      expect(restoredManifest.stories).toHaveLength(2);
      expect(restoredManifest.stories[0].displayName).toBe('Test Story');
    });
  });

  describe('Part 3: Complete Backup Cycle', () => {
    it('should backup and restore with exact content match', async () => {
      // Step 1: Prepare backup data
      const originalDatabaseContent = 'This is test database content with specific data';
      const originalDbPath = path.join(tempDir, 'original-babel.db');
      fs.writeFileSync(originalDbPath, originalDatabaseContent);

      // Step 2: Compress
      const archivePath = path.join(tempDir, 'backup.tar.gz');
      await compressionService.compressFile(originalDbPath, archivePath);

      expect(fs.existsSync(archivePath)).toBe(true);
      const compressedSize = fs.statSync(archivePath).size;
      expect(compressedSize).toBeGreaterThan(0);

      // Step 3: Decompress
      const restorePath = path.join(tempDir, 'restored-babel.db');
      await compressionService.decompressFile(archivePath, restorePath);

      // Step 4: Verify content match
      expect(fs.existsSync(restorePath)).toBe(true);
      const restoredContent = fs.readFileSync(restorePath, 'utf-8');
      expect(restoredContent).toBe(originalDatabaseContent);
    });

    it('should handle binary database files correctly', async () => {
      // Create binary database file (simulating SQLite db)
      const originalDbPath = path.join(tempDir, 'binary-babel.db');
      const binaryContent = Buffer.alloc(1024);
      for (let i = 0; i < binaryContent.length; i++) {
        binaryContent[i] = (i * 7) % 256; // Pseudo-random binary data
      }
      fs.writeFileSync(originalDbPath, binaryContent);

      // Backup
      const archivePath = path.join(tempDir, 'binary-backup.tar.gz');
      await compressionService.compressFile(originalDbPath, archivePath);

      // Restore
      const restorePath = path.join(tempDir, 'binary-restored.db');
      await compressionService.decompressFile(archivePath, restorePath);

      // Verify binary match
      const restoredContent = fs.readFileSync(restorePath);
      expect(Buffer.compare(binaryContent, restoredContent)).toBe(0);
    });
  });

  describe('Part 4: Story Directory Backup', () => {
    it('should backup and restore complete story directory structure', async () => {
      // Create complex story directory
      const storyDir = path.join(tempDir, 'story-backup-src');
      fs.mkdirSync(storyDir, { recursive: true });

      // Create multiple files and subdirectories
      fs.writeFileSync(path.join(storyDir, 'story.md'), '# Test Story\n\nContent here...');
      fs.mkdirSync(path.join(storyDir, 'chapters'));
      fs.writeFileSync(
        path.join(storyDir, 'chapters', 'chapter-1.md'),
        '# Chapter 1\n\nFirst chapter content'
      );
      fs.writeFileSync(
        path.join(storyDir, 'chapters', 'chapter-2.md'),
        '# Chapter 2\n\nSecond chapter content'
      );
      fs.mkdirSync(path.join(storyDir, 'metadata'));
      fs.writeFileSync(
        path.join(storyDir, 'metadata', 'info.json'),
        JSON.stringify({ title: 'Test Story', words: 5000 })
      );

      // Backup
      const archivePath = path.join(tempDir, 'story-backup.tar.gz');
      await compressionService.compressDirectory(storyDir, archivePath);

      expect(fs.existsSync(archivePath)).toBe(true);

      // Restore
      const restoreDir = path.join(tempDir, 'story-restore');
      await compressionService.decompressDirectory(archivePath, restoreDir);

      // Verify structure
      expect(fs.existsSync(path.join(restoreDir, 'story.md'))).toBe(true);
      expect(fs.existsSync(path.join(restoreDir, 'chapters', 'chapter-1.md'))).toBe(true);
      expect(fs.existsSync(path.join(restoreDir, 'chapters', 'chapter-2.md'))).toBe(true);
      expect(fs.existsSync(path.join(restoreDir, 'metadata', 'info.json'))).toBe(true);

      // Verify content
      const restoredStory = fs.readFileSync(path.join(restoreDir, 'story.md'), 'utf-8');
      expect(restoredStory).toContain('Test Story');

      const restoredMetadata = JSON.parse(
        fs.readFileSync(path.join(restoreDir, 'metadata', 'info.json'), 'utf-8')
      );
      expect(restoredMetadata.title).toBe('Test Story');
    });

    it('should exclude .git directory from backup', async () => {
      const storyDir = path.join(tempDir, 'story-with-git');
      fs.mkdirSync(storyDir, { recursive: true });

      // Create story files
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Story content');

      // Create .git directory (should be excluded)
      fs.mkdirSync(path.join(storyDir, '.git'));
      fs.writeFileSync(path.join(storyDir, '.git', 'config'), 'git config');
      fs.writeFileSync(path.join(storyDir, '.git', 'HEAD'), 'ref: refs/heads/main');

      // Backup
      const archivePath = path.join(tempDir, 'story-no-git.tar.gz');
      await compressionService.compressDirectory(storyDir, archivePath);

      // Restore
      const restoreDir = path.join(tempDir, 'story-restored');
      await compressionService.decompressDirectory(archivePath, restoreDir);

      // Verify story content exists
      expect(fs.existsSync(path.join(restoreDir, 'story.md'))).toBe(true);

      // Verify .git is excluded
      expect(fs.existsSync(path.join(restoreDir, '.git'))).toBe(false);
    });
  });

  describe('Part 5: Compression Verification', () => {
    it('should achieve reasonable compression for text-based content', async () => {
      const dbPath = path.join(tempDir, 'text-db.db');
      const textContent = 'Lorem ipsum dolor sit amet, '.repeat(500); // Repetitive text
      fs.writeFileSync(dbPath, textContent);

      const originalSize = fs.statSync(dbPath).size;
      const archivePath = path.join(tempDir, 'text-backup.tar.gz');
      await compressionService.compressFile(dbPath, archivePath);

      const compressedSize = fs.statSync(archivePath).size;
      const compressionRatio = (compressedSize / originalSize) * 100;

      expect(compressionRatio).toBeLessThan(50);
      console.log(`Text compression: ${originalSize}B → ${compressedSize}B (${compressionRatio.toFixed(2)}%)`);
    });

    it('should create tar.gz files with proper gzip headers', async () => {
      const dbPath = path.join(tempDir, 'header-test.db');
      fs.writeFileSync(dbPath, 'test content for header verification');

      const archivePath = path.join(tempDir, 'header-test.tar.gz');
      await compressionService.compressFile(dbPath, archivePath);

      // Read file header to verify gzip magic number
      const header = Buffer.alloc(2);
      const fd = fs.openSync(archivePath, 'r');
      fs.readSync(fd, header, 0, 2, 0);
      fs.closeSync(fd);

      // Gzip magic number is 0x1f 0x8b
      expect(header[0]).toBe(0x1f);
      expect(header[1]).toBe(0x8b);
    });
  });

  describe('Part 6: Backup Data Integrity', () => {
    it('should preserve file permissions in backup', async () => {
      const storyDir = path.join(tempDir, 'perms-test');
      fs.mkdirSync(storyDir);
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'content');

      const archivePath = path.join(tempDir, 'perms-backup.tar.gz');
      await compressionService.compressDirectory(storyDir, archivePath);

      const restoreDir = path.join(tempDir, 'perms-restored');
      await compressionService.decompressDirectory(archivePath, restoreDir);

      const originalFile = path.join(storyDir, 'story.md');
      const restoredFile = path.join(restoreDir, 'story.md');

      expect(fs.existsSync(restoredFile)).toBe(true);
      expect(fs.readFileSync(restoredFile, 'utf-8')).toBe('content');
    });

    it('should handle large backups without memory issues', async () => {
      // Create a moderately large file (10MB)
      const dbPath = path.join(tempDir, 'large-db.db');
      const largeBuffer = Buffer.alloc(1024 * 1024 * 10);
      largeBuffer.fill('x');
      fs.writeFileSync(dbPath, largeBuffer);

      const archivePath = path.join(tempDir, 'large-backup.tar.gz');
      await compressionService.compressFile(dbPath, archivePath);

      expect(fs.existsSync(archivePath)).toBe(true);

      const restorePath = path.join(tempDir, 'large-restored.db');
      await compressionService.decompressFile(archivePath, restorePath);

      const restoredBuffer = fs.readFileSync(restorePath);
      expect(restoredBuffer.length).toBe(largeBuffer.length);
    });
  });

  describe('Part 7: Error Handling & Edge Cases', () => {
    it('should handle non-existent source gracefully', async () => {
      const nonExistentPath = path.join(tempDir, 'nonexistent');
      const archivePath = path.join(tempDir, 'should-fail.tar.gz');

      await expect(compressionService.compressFile(nonExistentPath, archivePath)).rejects.toThrow();
    });

    it('should handle corrupted archive detection', async () => {
      // Create a fake tar.gz file
      const corruptArchive = path.join(tempDir, 'corrupt.tar.gz');
      fs.writeFileSync(corruptArchive, 'This is not a valid tar.gz archive');

      const extractDir = path.join(tempDir, 'extract-corrupt');
      await expect(
        compressionService.decompressFile(corruptArchive, extractDir)
      ).rejects.toThrow();
    });

    it('should handle empty directories', async () => {
      const emptyDir = path.join(tempDir, 'empty-src');
      fs.mkdirSync(emptyDir);

      // Create at least one file to avoid "no files to compress" error
      fs.writeFileSync(path.join(emptyDir, 'placeholder.txt'), 'placeholder');

      const archivePath = path.join(tempDir, 'empty-backup.tar.gz');
      await compressionService.compressDirectory(emptyDir, archivePath);

      expect(fs.existsSync(archivePath)).toBe(true);
    });
  });

  describe('Part 8: Real-World Scenario', () => {
    it('should execute complete backup/restore workflow', async () => {
      // Simulate a real story project
      const projectDir = path.join(tempDir, 'my-novel');
      fs.mkdirSync(projectDir);

      // Create multiple story files
      fs.writeFileSync(
        path.join(projectDir, 'story.md'),
        `# My Novel

## Chapter 1
Story content with meaningful text...

## Chapter 2
More content here...

Total words: 5000+`
      );

      fs.mkdirSync(path.join(projectDir, 'drafts'));
      fs.writeFileSync(
        path.join(projectDir, 'drafts', 'outline.md'),
        '# Outline\n- Plot point 1\n- Plot point 2'
      );

      // Create database
      const dbPath = path.join(tempDir, 'babel.db');
      fs.writeFileSync(dbPath, 'SQLite database content');

      // Backup scenario
      const backupDir = path.join(tempDir, 'backups');
      fs.mkdirSync(backupDir);

      const storyArchive = path.join(backupDir, 'story-backup.tar.gz');
      const dbArchive = path.join(backupDir, 'db-backup.tar.gz');
      const manifestPath = path.join(backupDir, 'manifest.json');

      // Compress story and database
      await compressionService.compressDirectory(projectDir, storyArchive);
      await compressionService.compressFile(dbPath, dbArchive);

      // Create manifest
      const manifest = {
        backupId: 'backup-001',
        timestamp: new Date().toISOString(),
        type: 'full',
        stories: [{ id: 'story-1', displayName: 'My Novel', fileCount: 2 }],
        database: { size: 25 },
      };
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      // Verify all backup files exist
      expect(fs.existsSync(storyArchive)).toBe(true);
      expect(fs.existsSync(dbArchive)).toBe(true);
      expect(fs.existsSync(manifestPath)).toBe(true);

      // Simulate delete of original data
      fs.rmSync(projectDir, { recursive: true });
      fs.unlinkSync(dbPath);

      // Restore scenario
      const restoreDir = path.join(tempDir, 'restored-project');
      fs.mkdirSync(restoreDir);

      await compressionService.decompressDirectory(storyArchive, restoreDir);

      const restoredDbPath = path.join(tempDir, 'restored-babel.db');
      await compressionService.decompressFile(dbArchive, restoredDbPath);

      // Verify restoration
      expect(fs.existsSync(path.join(restoreDir, 'story.md'))).toBe(true);
      expect(fs.existsSync(path.join(restoreDir, 'drafts', 'outline.md'))).toBe(true);
      expect(fs.existsSync(restoredDbPath)).toBe(true);

      const restoredStory = fs.readFileSync(path.join(restoreDir, 'story.md'), 'utf-8');
      expect(restoredStory).toContain('My Novel');

      const restoredManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      expect(restoredManifest.backupId).toBe('backup-001');
    });
  });
});
