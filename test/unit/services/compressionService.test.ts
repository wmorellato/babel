import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import { CompressionService } from '../../../src/services/compressionService';

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
