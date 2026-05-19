/**
 * Compression Service
 * Handles tar.gz compression/decompression for backups
 */

import * as tar from 'tar';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../utils/logger';
import { BackupError } from '../utils/errorHandler';

const logger = new Logger('CompressionService');

export class CompressionService {
  /**
   * Compress a directory to tar.gz
   */
  async compressDirectory(sourceDir: string, outputPath: string): Promise<void> {
    try {
      if (!fs.existsSync(sourceDir)) {
        throw new BackupError(`Source directory not found: ${sourceDir}`);
      }

      logger.debug(`Compressing directory: ${sourceDir} → ${outputPath}`);

      // Get all items in the directory to compress their contents (not the directory itself)
      const items = fs.readdirSync(sourceDir);

      // Filter out .git directories
      const filesToCompress = items.filter((item) => item !== '.git');

      if (filesToCompress.length === 0) {
        throw new BackupError('No files to compress (or only .git directory exists)');
      }

      await tar.create(
        {
          gzip: true,
          file: outputPath,
          cwd: sourceDir,
        },
        filesToCompress
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
        throw new BackupError(`Archive not found: ${archivePath}`);
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
        throw new BackupError(`File not found: ${filePath}`);
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
        throw new BackupError(`Archive not found: ${archivePath}`);
      }

      logger.debug(`Decompressing file: ${archivePath} → ${outputPath}`);

      // Ensure output directory exists
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Extract to a temporary location first
      const tempExtractDir = path.join(outputDir, '.tar-extract-temp');
      if (!fs.existsSync(tempExtractDir)) {
        fs.mkdirSync(tempExtractDir, { recursive: true });
      }

      try {
        // Extract to temporary location
        await tar.extract({
          file: archivePath,
          cwd: tempExtractDir,
        });

        // Find and move the extracted file to the final location
        const extractedItems = fs.readdirSync(tempExtractDir);
        if (extractedItems.length === 0) {
          throw new BackupError('No files found in archive');
        }

        // For a single file archive, there should be exactly one item
        const extractedItem = path.join(tempExtractDir, extractedItems[0]);
        fs.renameSync(extractedItem, outputPath);

        logger.debug(`File extracted successfully: ${outputPath}`);
      } finally {
        // Always clean up temp directory
        if (fs.existsSync(tempExtractDir)) {
          fs.rmSync(tempExtractDir, { recursive: true });
        }
      }
    } catch (error) {
      logger.error(`Failed to decompress file: ${error}`);
      throw error;
    }
  }
}
