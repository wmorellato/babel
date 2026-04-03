/**
 * Backup Data Collector
 * Gathers database snapshot and story files for backup
 */

import * as fs from 'fs';
import * as path from 'path';
import { BabelDatabase } from '../db/database';
import { StoryRepository } from '../db/storyRepository';
import { BackupData, BackupManifest } from '../types';
import { Logger } from '../utils/logger';
import { BackupError } from '../utils/errorHandler';
import { v4 as uuid } from 'uuid';

const logger = new Logger('BackupDataCollector');

export class BackupDataCollector {
  constructor(
    private database: BabelDatabase,
    private storyRepository: StoryRepository,
    private workspaceRoot: string,
    private databasePath?: string
  ) {}

  /**
   * Collect all data needed for a backup
   */
  async collect(): Promise<BackupData> {
    try {
      logger.info('Collecting backup data');

      // Collect database snapshot
      const databaseSnapshot = await this.collectDatabaseSnapshot();

      // Collect story files
      const storyFiles = await this.collectStoryFiles();

      // Create manifest - exclude deleted stories
      const stories = this.storyRepository.findAll(false); // false = exclude deleted
      const manifest: BackupManifest = {
        version: '1.0.0',
        createdAt: new Date(),
        backupId: uuid(),
        stories: stories.map((s) => ({
          id: s.id,
          displayName: s.displayName,
          fileCount: this.countStoryFiles(s.id),
        })),
        metadata: {
          babelVersion: '0.1.0',
          databaseVersion: '1',
        },
      };

      logger.info('Backup data collected', {
        fileCount: storyFiles.size,
        storyCount: manifest.stories.length,
      });

      return { databaseSnapshot, storyFiles, manifest };
    } catch (error) {
      throw new BackupError(`Failed to collect backup data: ${error}`);
    }
  }

  /**
   * Collect database snapshot
   */
  private async collectDatabaseSnapshot(): Promise<Buffer> {
    try {
      // Use provided database path or look in workspace-local directory
      const dbPath = this.databasePath || path.join(this.workspaceRoot, '.babel', 'babel.db');

      if (fs.existsSync(dbPath)) {
        return fs.readFileSync(dbPath);
      }

      // If database file doesn't exist, create a snapshot from memory
      // This is a simplified approach - the real implementation would
      // serialize the sql.js database
      logger.warn(`Database file not found at ${dbPath}, creating empty snapshot`);
      return Buffer.from('');
    } catch (error) {
      throw new BackupError(`Failed to collect database snapshot: ${error}`);
    }
  }

  /**
   * Collect all story files (excluding deleted stories)
   */
  private async collectStoryFiles(): Promise<Map<string, Buffer>> {
    try {
      const storyFiles = new Map<string, Buffer>();
      const stories = this.storyRepository.findAll(false); // false = exclude deleted

      for (const story of stories) {
        const storyDir = path.join(this.workspaceRoot, story.id);

        if (!fs.existsSync(storyDir)) {
          logger.warn(`Story directory not found: ${storyDir}`);
          continue;
        }

        const files = this.listFilesRecursive(storyDir);
        for (const file of files) {
          const relPath = path.relative(this.workspaceRoot, file);
          const content = fs.readFileSync(file);
          storyFiles.set(relPath, content);
        }
      }

      return storyFiles;
    } catch (error) {
      throw new BackupError(`Failed to collect story files: ${error}`);
    }
  }

  private countStoryFiles(storyId: string): number {
    try {
      const storyDir = path.join(this.workspaceRoot, storyId);
      if (!fs.existsSync(storyDir)) {
        return 0;
      }
      return this.listFilesRecursive(storyDir).length;
    } catch {
      return 0;
    }
  }

  private listFilesRecursive(dir: string): string[] {
    let files: string[] = [];
    const entries = fs.readdirSync(dir);

    for (const entry of entries) {
      // Skip .git directories
      if (entry === '.git') continue;

      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        files = files.concat(this.listFilesRecursive(fullPath));
      } else {
        files.push(fullPath);
      }
    }

    return files;
  }
}
