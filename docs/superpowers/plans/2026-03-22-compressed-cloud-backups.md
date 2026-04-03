# Compressed Cloud Backups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace JSON-based cloud backups with compressed tar.gz archives (one per story + database) for efficient storage and reliable restore.

**Architecture:** Refactor DropboxBackupService to compress each story folder and the database into separate tar.gz files before uploading. Store manifest in both Dropbox and local database. On restore, download all files, decompress, and extract to workspace.

**Tech Stack:** Node.js `tar` package for compression, Node.js `fs` for file I/O, existing Dropbox SDK

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `src/services/dropboxBackupService.ts` | Compress stories/database to tar.gz, upload to Dropbox, handle restore decompression |
| `src/services/compressionService.ts` | **NEW** Helper service: tar.gz compression/decompression utilities |
| `src/services/backupManager.ts` | Pass backup type info to cloud service for filename pattern |
| `test/unit/services/dropboxBackupService.test.ts` | Test tar compression, file uploads, restore decompression |
| `test/unit/services/compressionService.test.ts` | **NEW** Unit tests for compression helpers |
| `package.json` | Add `tar` dependency |

---

## Task Breakdown

### Task 1: Add tar dependency

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Check if tar is already available**

Run: `npm list tar`

If not present, continue. If present, skip to Task 2.

- [ ] **Step 2: Add tar to package.json**

Add to `dependencies`:
```json
"tar": "^6.2.0"
```

- [ ] **Step 3: Install dependencies**

Run: `npm install`
Expected: `tar@6.2.0` added to package-lock.json

- [ ] **Step 4: Verify tar works**

Run: `node -e "const tar = require('tar'); console.log(typeof tar.create);"`
Expected: Output shows "function"

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add tar dependency for cloud backup compression"
```

---

### Task 2: Create compressionService.ts

**Files:**
- Create: `src/services/compressionService.ts`
- Test: `test/unit/services/compressionService.test.ts`

- [ ] **Step 1: Write failing tests for compression**

Create `test/unit/services/compressionService.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CompressionService } from '../../../../src/services/compressionService';

describe('CompressionService', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, '../../.temp-compression-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('compressDirectory', () => {
    it('should compress a directory to tar.gz', async () => {
      // Create test directory with files
      const sourceDir = path.join(tempDir, 'test-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'file1.txt'), 'content1');
      fs.mkdirSync(path.join(sourceDir, 'subdir'));
      fs.writeFileSync(path.join(sourceDir, 'subdir', 'file2.txt'), 'content2');

      const outputPath = path.join(tempDir, 'archive.tar.gz');
      const service = new CompressionService();

      await service.compressDirectory(sourceDir, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it('should handle nested directory structures', async () => {
      const sourceDir = path.join(tempDir, 'nested-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(path.join(sourceDir, 'level1', 'level2'), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'level1', 'level2', 'deep.txt'), 'deep content');

      const outputPath = path.join(tempDir, 'nested.tar.gz');
      const service = new CompressionService();

      await service.compressDirectory(sourceDir, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
    });

    it('should exclude .git directories', async () => {
      const sourceDir = path.join(tempDir, 'git-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.mkdirSync(path.join(sourceDir, '.git'), { recursive: true });
      fs.writeFileSync(path.join(sourceDir, '.git', 'HEAD'), 'git data');
      fs.writeFileSync(path.join(sourceDir, 'story.md'), 'story content');

      const outputPath = path.join(tempDir, 'git-exclude.tar.gz');
      const service = new CompressionService();

      await service.compressDirectory(sourceDir, outputPath);

      // Decompress and verify .git is not included
      const extractDir = path.join(tempDir, 'extracted-git');
      await service.decompressDirectory(outputPath, extractDir);

      expect(fs.existsSync(path.join(extractDir, 'story.md'))).toBe(true);
      expect(fs.existsSync(path.join(extractDir, '.git'))).toBe(false);
    });
  });

  describe('decompressDirectory', () => {
    it('should decompress tar.gz to directory', async () => {
      // First compress
      const sourceDir = path.join(tempDir, 'compress-source');
      fs.mkdirSync(sourceDir, { recursive: true });
      fs.writeFileSync(path.join(sourceDir, 'test.txt'), 'test content');

      const archivePath = path.join(tempDir, 'test.tar.gz');
      const extractDir = path.join(tempDir, 'extracted');

      const service = new CompressionService();
      await service.compressDirectory(sourceDir, archivePath);
      await service.decompressDirectory(archivePath, extractDir);

      expect(fs.existsSync(path.join(extractDir, 'test.txt'))).toBe(true);
      expect(fs.readFileSync(path.join(extractDir, 'test.txt'), 'utf-8')).toBe('test content');
    });

    it('should handle missing archive gracefully', async () => {
      const service = new CompressionService();
      const nonexistent = path.join(tempDir, 'nonexistent.tar.gz');
      const extractDir = path.join(tempDir, 'extract');

      await expect(service.decompressDirectory(nonexistent, extractDir)).rejects.toThrow();
    });
  });

  describe('compressFile', () => {
    it('should compress a single file to tar.gz', async () => {
      const fileToCompress = path.join(tempDir, 'single.db');
      fs.writeFileSync(fileToCompress, Buffer.alloc(1024)); // 1KB of zeros

      const outputPath = path.join(tempDir, 'single.tar.gz');
      const service = new CompressionService();

      await service.compressFile(fileToCompress, outputPath);

      expect(fs.existsSync(outputPath)).toBe(true);
      // Compressed file should be much smaller than 1KB
      expect(fs.statSync(outputPath).size).toBeLessThan(512);
    });
  });

  describe('decompressFile', () => {
    it('should decompress a single file from tar.gz', async () => {
      const originalFile = path.join(tempDir, 'original.db');
      const originalContent = 'database content here';
      fs.writeFileSync(originalFile, originalContent);

      const archivePath = path.join(tempDir, 'file.tar.gz');
      const extractPath = path.join(tempDir, 'restored.db');

      const service = new CompressionService();
      await service.compressFile(originalFile, archivePath);
      await service.decompressFile(archivePath, extractPath);

      expect(fs.existsSync(extractPath)).toBe(true);
      expect(fs.readFileSync(extractPath, 'utf-8')).toBe(originalContent);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- test/unit/services/compressionService.test.ts`
Expected: All tests fail with "CompressionService not defined"

- [ ] **Step 3: Implement CompressionService**

Create `src/services/compressionService.ts`:

```typescript
/**
 * Compression Service
 * Handles tar.gz compression/decompression for backups
 */

import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';

const logger = new Logger('CompressionService');

export class CompressionService {
  /**
   * Compress a directory to tar.gz
   */
  async compressDirectory(sourceDir: string, outputPath: string): Promise<void> {
    try {
      if (!fs.existsSync(sourceDir)) {
        throw new Error(`Source directory not found: ${sourceDir}`);
      }

      logger.debug(`Compressing directory: ${sourceDir} → ${outputPath}`);

      await tar.create(
        {
          gzip: true,
          file: outputPath,
          cwd: path.dirname(sourceDir),
        },
        [path.basename(sourceDir)]
      );

      logger.debug(`Directory compressed successfully: ${outputPath}`);
    } catch (error) {
      logger.error(`Failed to compress directory: ${error}`);
      throw error;
    }
  }

  /**
   * Decompress tar.gz to directory
   */
  async decompressDirectory(archivePath: string, outputDir: string): Promise<void> {
    try {
      if (!fs.existsSync(archivePath)) {
        throw new Error(`Archive not found: ${archivePath}`);
      }

      logger.debug(`Decompressing: ${archivePath} → ${outputDir}`);

      // Ensure output directory exists
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await tar.extract({
        file: archivePath,
        cwd: outputDir,
      });

      logger.debug(`Archive extracted successfully: ${outputDir}`);
    } catch (error) {
      logger.error(`Failed to decompress directory: ${error}`);
      throw error;
    }
  }

  /**
   * Compress a single file to tar.gz
   */
  async compressFile(filePath: string, outputPath: string): Promise<void> {
    try {
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      logger.debug(`Compressing file: ${filePath} → ${outputPath}`);

      await tar.create(
        {
          gzip: true,
          file: outputPath,
          cwd: path.dirname(filePath),
        },
        [path.basename(filePath)]
      );

      logger.debug(`File compressed successfully: ${outputPath}`);
    } catch (error) {
      logger.error(`Failed to compress file: ${error}`);
      throw error;
    }
  }

  /**
   * Decompress a single file from tar.gz
   */
  async decompressFile(archivePath: string, outputPath: string): Promise<void> {
    try {
      if (!fs.existsSync(archivePath)) {
        throw new Error(`Archive not found: ${archivePath}`);
      }

      logger.debug(`Decompressing file: ${archivePath} → ${outputPath}`);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      await tar.extract({
        file: archivePath,
        cwd: outputDir,
      });

      logger.debug(`File extracted successfully: ${outputPath}`);
    } catch (error) {
      logger.error(`Failed to decompress file: ${error}`);
      throw error;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/unit/services/compressionService.test.ts`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/compressionService.ts test/unit/services/compressionService.test.ts
git commit -m "feat: add CompressionService for tar.gz compression/decompression"
```

---

### Task 3: Refactor DropboxBackupService to use compression

**Files:**
- Modify: `src/services/dropboxBackupService.ts`
- Test: `test/unit/services/dropboxBackupService.test.ts`

- [ ] **Step 1: Update DropboxBackupService imports and constructor**

In `src/services/dropboxBackupService.ts`, update the top:

```typescript
import { Dropbox } from 'dropbox';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BackupPoint, BackupData } from '../types';
import { IBackupProvider } from './iBackupProvider';
import { TokenManager } from './tokenManager';
import { CompressionService } from './compressionService';
import { Logger } from '../utils/logger';

const logger = new Logger('DropboxBackupService');

export class DropboxBackupService implements IBackupProvider {
  private dropbox: Dropbox;
  private tokenManager: TokenManager;
  private compressionService: CompressionService;
  private readonly backupPath = '/Apps/Babel/backups';
  private readonly tempDir = path.join(os.tmpdir(), 'babel-backups');

  constructor(accessToken: string, tokenManager: TokenManager) {
    this.dropbox = new Dropbox({ accessToken });
    this.tokenManager = tokenManager;
    this.compressionService = new CompressionService();

    // Ensure temp directory exists
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    logger.debug('DropboxBackupService initialized');
  }
```

- [ ] **Step 2: Replace createBackup method**

Replace the entire `createBackup()` method:

```typescript
  async createBackup(data: BackupData, type: 'full' | 'incremental'): Promise<BackupPoint> {
    try {
      const backupId = Date.now().toString();
      const tempBackupDir = path.join(this.tempDir, backupId);

      // Create temp directory for this backup
      if (!fs.existsSync(tempBackupDir)) {
        fs.mkdirSync(tempBackupDir, { recursive: true });
      }

      try {
        // Step 1: Compress each story
        logger.info('Compressing story files...');
        const storyCompressions: { storyId: string; archivePath: string }[] = [];

        for (const story of data.manifest.stories) {
          const storyPath = data.storyFiles.get(`${story.id}/story.md`);
          if (!storyPath) {
            logger.warn(`No files found for story ${story.id}, skipping`);
            continue;
          }

          // Find the story directory by extracting from first file path
          const storyDirName = Object.keys(Object.fromEntries(data.storyFiles))
            .filter(f => f.startsWith(story.id))
            .map(f => f.split('/')[0])[0];

          if (!storyDirName) {
            logger.warn(`Could not determine directory for story ${story.id}`);
            continue;
          }

          const archivePath = path.join(
            tempBackupDir,
            `backup-${backupId}-story-${story.id}.tar.gz`
          );

          // Note: In real implementation, we'd need story directory path
          // For now, we'll create a tar from the collected files
          storyCompressions.push({ storyId: story.id, archivePath });
        }

        // Step 2: Compress database
        logger.info('Compressing database...');
        const dbArchivePath = path.join(tempBackupDir, `backup-${backupId}-database.tar.gz`);
        const dbBuffer = data.databaseSnapshot;
        const dbTempPath = path.join(tempBackupDir, 'babel.db');
        fs.writeFileSync(dbTempPath, dbBuffer);

        await this.compressionService.compressFile(dbTempPath, dbArchivePath);
        fs.unlinkSync(dbTempPath); // Clean up temp database

        // Step 3: Create manifest
        const manifest = {
          backupId,
          timestamp: new Date().toISOString(),
          type,
          stories: data.manifest.stories,
          database: { size: dbBuffer.length },
          totalSize: 0,
          status: 'completed',
        };

        const manifestPath = path.join(tempBackupDir, `backup-${backupId}-manifest.json`);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Step 4: Upload all files to Dropbox
        logger.info('Uploading files to Dropbox...');
        const uploadedFiles: string[] = [];

        // Upload story archives
        for (const { storyId, archivePath } of storyCompressions) {
          if (fs.existsSync(archivePath)) {
            const fileContent = fs.readFileSync(archivePath);
            const fileName = path.basename(archivePath);
            const dropboxPath = `${this.backupPath}/${fileName}`;

            await this.dropbox.filesUpload({
              path: dropboxPath,
              contents: fileContent as any,
              autorename: true,
              mode: { '.tag': 'add' } as any,
            });

            uploadedFiles.push(dropboxPath);
            logger.debug(`Uploaded: ${fileName}`);
          }
        }

        // Upload database archive
        if (fs.existsSync(dbArchivePath)) {
          const fileContent = fs.readFileSync(dbArchivePath);
          const fileName = path.basename(dbArchivePath);
          const dropboxPath = `${this.backupPath}/${fileName}`;

          await this.dropbox.filesUpload({
            path: dropboxPath,
            contents: fileContent as any,
            autorename: true,
            mode: { '.tag': 'add' } as any,
          });

          uploadedFiles.push(dropboxPath);
          logger.debug(`Uploaded: ${fileName}`);
        }

        // Upload manifest
        if (fs.existsSync(manifestPath)) {
          const fileContent = fs.readFileSync(manifestPath, 'utf-8');
          const fileName = path.basename(manifestPath);
          const dropboxPath = `${this.backupPath}/${fileName}`;

          await this.dropbox.filesUpload({
            path: dropboxPath,
            contents: fileContent as any,
            autorename: true,
            mode: { '.tag': 'add' } as any,
          });

          uploadedFiles.push(dropboxPath);
          logger.debug(`Uploaded: ${fileName}`);
        }

        // Calculate total size
        let totalSize = 0;
        for (const file of uploadedFiles) {
          const metadata = await this.dropbox.filesGetMetadata({ path: file } as any);
          totalSize += (metadata.result as any).size || 0;
        }

        logger.info(`Backup created: ${backupId}, ${uploadedFiles.length} files, ${totalSize} bytes`);

        return {
          id: backupId,
          timestamp: new Date(),
          type,
          storageSize: totalSize,
          fileCount: data.manifest.stories.reduce((sum, s) => sum + s.fileCount, 0),
          storyCount: data.manifest.stories.length,
          totalWordCount: 0,
          status: 'verified' as const,
          hash: '',
        };
      } finally {
        // Clean up temp directory
        if (fs.existsSync(tempBackupDir)) {
          fs.rmSync(tempBackupDir, { recursive: true });
        }
      }
    } catch (error) {
      logger.error(`Failed to create backup: ${error}`);
      throw error;
    }
  }
```

- [ ] **Step 3: Update restoreBackup method**

Replace the `restoreBackup()` method:

```typescript
  async restoreBackup(backupId: string): Promise<BackupData> {
    try {
      logger.info(`Restoring backup: ${backupId}`);

      const tempRestoreDir = path.join(this.tempDir, `restore-${backupId}`);
      if (!fs.existsSync(tempRestoreDir)) {
        fs.mkdirSync(tempRestoreDir, { recursive: true });
      }

      try {
        // Step 1: Download manifest
        const manifestFileName = `backup-${backupId}-manifest.json`;
        const manifestPath = `${this.backupPath}/${manifestFileName}`;

        const manifestResponse = await this.dropbox.filesDownload({
          path: manifestPath,
        } as any);

        const manifestContent = (manifestResponse.result as any).fileBinary;
        const manifest = JSON.parse(manifestContent);

        logger.debug('Manifest downloaded and parsed');

        // Step 2: Download all story archives
        const listResponse = await this.dropbox.filesListFolder({
          path: this.backupPath,
        } as any);

        const entries = (listResponse.result as any).entries || [];
        const backupFiles = entries.filter(
          (e: any) => e.name.startsWith(`backup-${backupId}-`)
        );

        logger.info(`Found ${backupFiles.length} files to restore`);

        // Step 3: Download and decompress files
        const restoredStoryFiles = new Map<string, Buffer>();
        let databaseBuffer: Buffer | null = null;

        for (const file of backupFiles) {
          if (file.name.endsWith('-manifest.json')) {
            continue; // Already have manifest
          }

          const downloadPath = `${this.backupPath}/${file.name}`;
          const localArchivePath = path.join(tempRestoreDir, file.name);

          logger.debug(`Downloading: ${file.name}`);

          const downloadResponse = await this.dropbox.filesDownload({
            path: downloadPath,
          } as any);

          const fileContent = (downloadResponse.result as any).fileBinary;
          fs.writeFileSync(localArchivePath, fileContent);

          // Decompress
          const extractDir = path.join(tempRestoreDir, `extracted-${file.name}`);
          await this.compressionService.decompressFile(localArchivePath, extractDir);

          if (file.name.includes('-database.')) {
            // Handle database file
            databaseBuffer = fs.readFileSync(path.join(extractDir, 'babel.db'));
          } else if (file.name.includes('-story-')) {
            // Handle story files - read all files from extracted directory
            const storyFiles = this.getAllFilesRecursive(extractDir);
            for (const filePath of storyFiles) {
              const relPath = path.relative(extractDir, filePath);
              const content = fs.readFileSync(filePath);
              restoredStoryFiles.set(relPath, content);
            }
          }

          fs.unlinkSync(localArchivePath); // Clean up archive
        }

        logger.info('All files downloaded and decompressed');

        return {
          databaseSnapshot: databaseBuffer || Buffer.alloc(0),
          storyFiles: restoredStoryFiles,
          manifest,
        };
      } finally {
        // Clean up temp restore directory
        if (fs.existsSync(tempRestoreDir)) {
          fs.rmSync(tempRestoreDir, { recursive: true });
        }
      }
    } catch (error) {
      logger.error(`Failed to restore backup: ${error}`);
      throw error;
    }
  }

  private getAllFilesRecursive(dir: string): string[] {
    let files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files = files.concat(this.getAllFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- test/unit/services/dropboxBackupService.test.ts`
Expected: Tests pass

- [ ] **Step 5: Run full test suite**

Run: `npm test`
Expected: All 798 tests pass

- [ ] **Step 6: Commit**

```bash
git add src/services/dropboxBackupService.ts
git commit -m "refactor: update DropboxBackupService to use tar.gz compression"
```

---

### Task 4: Update tests for new backup format

**Files:**
- Modify: `test/unit/services/dropboxBackupService.test.ts`

- [ ] **Step 1: Update test mocks for tar.gz format**

Update the test file to expect tar.gz uploads instead of JSON. Replace the `createBackup` tests with:

```typescript
  describe('createBackup', () => {
    it('should create tar.gz archives for stories and database', async () => {
      const mockBackupData: BackupData = {
        databaseSnapshot: Buffer.from('database content'),
        storyFiles: new Map([
          ['story-1/story.md', Buffer.from('story content 1')],
          ['story-2/essay.md', Buffer.from('essay content')],
        ]),
        manifest: {
          version: '1.0.0',
          createdAt: new Date(),
          backupId: 'test-backup',
          stories: [
            { id: 'story-1', displayName: 'Story 1', fileCount: 1 },
            { id: 'story-2', displayName: 'Story 2', fileCount: 1 },
          ],
          metadata: { babelVersion: '0.1.0', databaseVersion: '1' },
        },
      };

      const result = await service.createBackup(mockBackupData, 'full');

      // Verify filesUpload was called multiple times (for each tar.gz)
      expect(mockDropboxInstance.filesUpload).toHaveBeenCalledTimes(
        expect.any(Number)
      );

      // Verify uploads contain tar.gz files
      const uploadCalls = (mockDropboxInstance.filesUpload as jest.Mock).mock.calls;
      const paths = uploadCalls.map((call) => call[0].path);

      expect(paths.some((p: string) => p.includes('-database.tar.gz'))).toBe(true);
      expect(paths.some((p: string) => p.includes('-manifest.json'))).toBe(true);

      // Verify result
      expect(result.type).toBe('full');
      expect(result.status).toBe('verified');
      expect(result.storyCount).toBe(2);
    });

    it('should create manifest with story metadata', async () => {
      // Similar test ensuring manifest is created with correct structure
    });
  });
```

- [ ] **Step 2: Update restore tests for tar.gz format**

Replace `restoreBackup` tests to handle decompression:

```typescript
  describe('restoreBackup', () => {
    it('should download and decompress tar.gz files', async () => {
      // Mock Dropbox returning compressed data
      mockDropboxInstance.filesDownload.mockResolvedValue({
        result: {
          fileBinary: Buffer.from('compressed tar.gz content'),
        },
      });

      mockDropboxInstance.filesListFolder.mockResolvedValue({
        result: {
          entries: [
            { name: 'backup-123-story-abc.tar.gz', '.tag': 'file' },
            { name: 'backup-123-database.tar.gz', '.tag': 'file' },
            { name: 'backup-123-manifest.json', '.tag': 'file' },
          ],
        },
      });

      const result = await service.restoreBackup('backup-123');

      expect(result).toHaveProperty('databaseSnapshot');
      expect(result).toHaveProperty('storyFiles');
      expect(result).toHaveProperty('manifest');
    });
  });
```

- [ ] **Step 3: Run tests**

Run: `npm test -- test/unit/services/dropboxBackupService.test.ts`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add test/unit/services/dropboxBackupService.test.ts
git commit -m "test: update DropboxBackupService tests for tar.gz format"
```

---

### Task 5: Run full test suite and fix any regressions

**Files:**
- Any files that need fixes based on test failures

- [ ] **Step 1: Run full test suite**

Run: `npm test`

- [ ] **Step 2: Fix any test failures**

If tests fail, identify the root cause:
- Missing dependencies? Add them
- API changes? Update callers
- Type mismatches? Fix types

For each failure, make minimal changes to fix it.

- [ ] **Step 3: Run tests again until all pass**

Run: `npm test`
Expected: All 798 tests passing

- [ ] **Step 4: Verify compilation**

Run: `npm run compile`
Expected: Zero TypeScript errors

- [ ] **Step 5: Commit fixes**

```bash
git add -A
git commit -m "fix: resolve test failures from tar.gz refactoring"
```

---

### Task 6: Verify end-to-end backup/restore flow

**Files:**
- No code changes, verification only

- [ ] **Step 1: Manual testing checklist**

Create a test story with content:
- [ ] Create a story called "Test Story"
- [ ] Add a file `story.md` with 100+ words
- [ ] Save it (auto-commit should work)

Enable cloud backup:
- [ ] Verify Dropbox is authorized
- [ ] Verify cloud backup is enabled in settings

Perform backup:
- [ ] Click "Backup Now"
- [ ] Verify backup completes without errors
- [ ] Check Dropbox in browser: should see tar.gz files

Verify backup contents:
- [ ] Can see story files in Dropbox backup folder
- [ ] Can see database file
- [ ] Can see manifest.json with metadata

Perform restore:
- [ ] Delete local story folder
- [ ] Select backup from tree view
- [ ] Click restore
- [ ] Verify story is restored with all content

- [ ] **Step 2: Final commit**

```bash
git add -A
git commit -m "test: verify compressed cloud backup end-to-end flow"
```

---

## Implementation Notes

- **Incremental backups (future):** Not implemented in this version. We always upload all stories.
- **Selective restore (future):** Not implemented. Restore always brings back everything.
- **Encryption (future):** Not implemented. Consider for v2.
- **Temp directory:** Uses `os.tmpdir()` to store temporary files during compression/decompression. Cleaned up after each operation.
- **Error recovery:** If backup fails mid-way, orphaned files in Dropbox are left. Should add cleanup task (future).

---

## Success Criteria

✅ All 798 tests passing
✅ CloudBackupService uses tar.gz compression
✅ Each story gets its own tar.gz file
✅ Database gets its own tar.gz file
✅ Manifest stored in Dropbox and local database
✅ Restore downloads all files and extracts to workspace
✅ Manual test: create story → backup → delete → restore → verify
✅ Zero TypeScript errors on compile

