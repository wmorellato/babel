/**
 * Dropbox Backup Service
 * Implements cloud backup to Dropbox using OAuth2 tokens
 */

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

  async createBackup(data: BackupData, type: 'full' | 'incremental'): Promise<BackupPoint> {
    try {
      const backupId = Date.now().toString();
      const tempBackupDir = path.join(this.tempDir, backupId);

      // Create temp directory for this backup
      if (!fs.existsSync(tempBackupDir)) {
        fs.mkdirSync(tempBackupDir, { recursive: true });
      }

      try {
        // Step 1: Compress story files
        logger.info('Compressing story files...');
        const storyArchivePaths: { storyId: string; archivePath: string }[] = [];

        // Group files by story ID
        const storiesByFolder = new Map<string, Map<string, Buffer>>();
        for (const [filePath, content] of data.storyFiles) {
          const parts = filePath.split(path.sep);
          const storyId = parts[0];

          if (!storiesByFolder.has(storyId)) {
            storiesByFolder.set(storyId, new Map());
          }
          storiesByFolder.get(storyId)!.set(filePath, content);
        }

        // Compress each story folder
        for (const [storyId, files] of storiesByFolder) {
          const storyTempDir = path.join(tempBackupDir, `story-${storyId}-temp`);
          fs.mkdirSync(storyTempDir, { recursive: true });

          // Write story files to temp directory
          for (const [filePath, content] of files) {
            const fullPath = path.join(storyTempDir, filePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
              fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, content);
          }

          // Compress the story directory
          const archivePath = path.join(tempBackupDir, `backup-${backupId}-story-${storyId}.tar.gz`);
          await this.compressionService.compressDirectory(storyTempDir, archivePath);

          // Clean up temp story directory
          fs.rmSync(storyTempDir, { recursive: true });

          storyArchivePaths.push({ storyId, archivePath });
          logger.debug(`Story ${storyId} compressed`);
        }

        // Step 2: Compress database
        logger.info('Compressing database...');
        const dbArchivePath = path.join(tempBackupDir, `backup-${backupId}-database.tar.gz`);
        const dbTempPath = path.join(tempBackupDir, 'babel.db');
        fs.writeFileSync(dbTempPath, data.databaseSnapshot);

        await this.compressionService.compressFile(dbTempPath, dbArchivePath);
        fs.unlinkSync(dbTempPath); // Clean up temp database

        // Step 3: Create manifest
        const manifest = {
          backupId,
          timestamp: new Date().toISOString(),
          type,
          stories: data.manifest.stories,
          database: { size: data.databaseSnapshot.length },
          totalSize: 0,
          status: 'completed',
        };

        const manifestPath = path.join(tempBackupDir, `backup-${backupId}-manifest.json`);
        fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

        // Step 4: Upload all files to Dropbox
        logger.info('Uploading files to Dropbox...');
        const uploadedFiles: string[] = [];

        // Upload story archives
        for (const { storyId, archivePath } of storyArchivePaths) {
          if (fs.existsSync(archivePath)) {
            const fileContent = fs.readFileSync(archivePath);
            const fileName = path.basename(archivePath);
            const dropboxPath = `${this.backupPath}/${fileName}`;

            await this.dropbox.filesUpload({
              path: dropboxPath,
              contents: fileContent as any,
              mode: { '.tag': 'overwrite' } as any,
            });

            uploadedFiles.push(dropboxPath);
            logger.debug(`Uploaded story ${storyId}: ${fileName}`);
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

        // Step 2: Download all backup files
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

          if (file.name.includes('-database.')) {
            // Handle database file
            await this.compressionService.decompressFile(localArchivePath, extractDir);
            databaseBuffer = fs.readFileSync(path.join(extractDir, 'babel.db'));
          } else if (file.name.includes('-story-')) {
            // Handle story files - read all files from extracted directory
            await this.compressionService.decompressDirectory(localArchivePath, extractDir);
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

  async deleteBackup(backupId: string): Promise<void> {
    try {
      const filePath = `${this.backupPath}/${backupId}`;

      await this.dropbox.filesDeleteV2({
        path: filePath,
      } as any);

      logger.info(`Backup deleted: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to delete backup: ${error}`);
      throw error;
    }
  }

  async listBackups(): Promise<string[]> {
    try {
      const response = await this.dropbox.filesListFolder({
        path: this.backupPath,
      } as any);

      const entries = (response.result as any).entries || [];
      const backupIds = entries
        .filter((entry: any) => entry['.tag'] === 'file' && entry.name.startsWith('backup-'))
        .map((entry: any) => entry.name);

      logger.debug(`Listed ${backupIds.length} backups`);
      return backupIds;
    } catch (error) {
      logger.error(`Failed to list backups: ${error}`);
      throw error;
    }
  }

  /**
   * List backups with metadata from Dropbox
   * Groups files by backupId to return one entry per backup operation
   */
  async listBackupsWithMetadata(): Promise<BackupPoint[]> {
    try {
      const response = await this.dropbox.filesListFolder({
        path: this.backupPath,
      } as any);

      const entries = (response.result as any).entries || [];

      // Group files by backupId
      const backupsByIdMap = new Map<string, { manifestEntry: any; files: any[] }>();

      for (const entry of entries) {
        if (entry['.tag'] !== 'file' || !entry.name.startsWith('backup-')) {
          continue;
        }

        // Extract backupId from filename: backup-{backupId}-{component}
        const parts = entry.name.match(/^backup-(\d+)-.+/);
        if (!parts) continue;

        const backupId = parts[1];
        if (!backupsByIdMap.has(backupId)) {
          backupsByIdMap.set(backupId, { manifestEntry: null, files: [] });
        }

        const backup = backupsByIdMap.get(backupId)!;
        backup.files.push(entry);

        // Track manifest entry for metadata
        if (entry.name.endsWith('-manifest.json')) {
          backup.manifestEntry = entry;
        }
      }

      // Convert to BackupPoint array (one per unique backupId)
      const backups: BackupPoint[] = Array.from(backupsByIdMap.entries())
        .map(([backupId, { manifestEntry, files }]) => {
          // Parse type from manifest filename if available
          const type = (manifestEntry?.name.includes('full') ? 'full' : 'incremental') as 'full' | 'incremental';
          const timestamp = manifestEntry ? new Date(parseInt(backupId)) : new Date();

          // Calculate total size of all files in this backup
          const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

          return {
            id: backupId,
            timestamp,
            type,
            storageSize: totalSize,
            fileCount: 0,
            storyCount: 0,
            totalWordCount: 0,
            status: 'verified' as const,
            hash: '',
          };
        })
        .sort((a: BackupPoint, b: BackupPoint) => b.timestamp.getTime() - a.timestamp.getTime());

      logger.debug(`Listed ${backups.length} backups with metadata`);
      return backups;
    } catch (error) {
      logger.error(`Failed to list backups with metadata: ${error}`);
      return [];
    }
  }

  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const filePath = `${this.backupPath}/${backupId}`;

      const response = await this.dropbox.filesGetMetadata({
        path: filePath,
      } as any);

      const isFile = (response.result as any)['.tag'] === 'file';
      const size = (response.result as any).size || 0;

      logger.debug(`Backup verified: ${filePath}, size: ${size}`);
      return isFile && size > 0;
    } catch (error) {
      logger.error(`Failed to verify backup: ${error}`);
      return false;
    }
  }

  async getStorageUsage(): Promise<number> {
    try {
      const response = await this.dropbox.usersGetSpaceUsage();
      const used = (response.result as any).used || 0;

      logger.debug(`Storage usage: ${used} bytes`);
      return used;
    } catch (error) {
      logger.error(`Failed to get storage usage: ${error}`);
      return 0;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.dropbox.usersGetCurrentAccount();
      logger.debug('Dropbox account available');
      return true;
    } catch (error) {
      logger.debug('Dropbox account not available');
      return false;
    }
  }

  async cleanupOldBackups(
    retentionDays: number,
    backupMetadata: Map<string, BackupPoint>
  ): Promise<string[]> {
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const deletedIds: string[] = [];

      for (const [backupId, metadata] of backupMetadata) {
        if (metadata.timestamp.getTime() < cutoffTime) {
          await this.deleteBackup(backupId);
          deletedIds.push(backupId);
        }
      }

      logger.info(`Cleaned up ${deletedIds.length} old backups`);
      return deletedIds;
    } catch (error) {
      logger.error(`Failed to cleanup old backups: ${error}`);
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
}
