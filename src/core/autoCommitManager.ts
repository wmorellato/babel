/**
 * Auto-Commit Manager
 * Central service for managing per-story auto-commit handlers
 */

import * as path from 'path';
import * as fs from 'fs';
import { StoryRepository } from '../db/storyRepository';
import { AutoCommitHandler, AutoCommitConfig } from './autoCommitHandler';
import { GitRepository } from '../git/gitRepository';
import { StoryWordCountService } from './storyWordCountService';
import { Logger } from '../utils/logger';

const logger = new Logger('AutoCommitManager');

export class AutoCommitManager {
  private handlerMap: Map<string, AutoCommitHandler> = new Map();

  constructor(
    private storyRepository: StoryRepository,
    private workspaceRoot: string,
    private config?: AutoCommitConfig
  ) {}

  /**
   * Idempotent guard chain to ensure handler exists and is watching
   * @param storyId - The story ID
   */
  async ensureHandler(storyId: string): Promise<void> {
    // If handler already exists, nothing to do
    if (this.handlerMap.has(storyId)) {
      return;
    }

    // Verify story exists in DB
    const story = this.storyRepository.findById(storyId);
    if (!story) {
      logger.warn(`Story not found in database: ${storyId}`);
      return;
    }

    // Verify story directory exists
    const storyDir = path.join(this.workspaceRoot, storyId);
    if (!fs.existsSync(storyDir)) {
      logger.warn(`Story directory does not exist: ${storyDir}`);
      return;
    }

    // Verify git repository exists in story directory
    const gitDir = path.join(storyDir, '.git');
    if (!fs.existsSync(gitDir)) {
      logger.warn(`Git repository not found in story directory: ${gitDir}`);
      return;
    }

    // Create git repository and word count service
    const gitRepository = new GitRepository(storyDir);
    const wordCountService = new StoryWordCountService(this.storyRepository, this.workspaceRoot);

    // Create handler with callback to update word count
    const handler = new AutoCommitHandler(
      gitRepository,
      this.config,
      storyId,
      async (id: string) => {
        await wordCountService.updateWordCount(id);
      }
    );

    // Initialize handler with current word count from database
    handler.setWordCount(story.currentWordCount ?? 0);

    // Start watching
    await handler.watch(storyDir);

    // Store in map
    this.handlerMap.set(storyId, handler);
    logger.info(`Auto-commit handler created and watching for story: ${storyId}`);
  }

  /**
   * Dispose all handlers
   */
  disposeAll(): void {
    this.handlerMap.forEach((handler, storyId) => {
      handler.stopWatching();
      logger.info(`Auto-commit handler stopped for story: ${storyId}`);
    });
    this.handlerMap.clear();
    logger.info('All auto-commit handlers disposed');
  }

  /**
   * Get handler for a specific story
   * @param storyId - The story ID
   * @returns The handler or undefined if not found
   */
  getHandler(storyId: string): AutoCommitHandler | undefined {
    return this.handlerMap.get(storyId);
  }

  /**
   * Get all active handlers
   */
  getAllHandlers(): AutoCommitHandler[] {
    return Array.from(this.handlerMap.values());
  }

  /**
   * Check if handler exists for story
   * @param storyId - The story ID
   */
  hasHandler(storyId: string): boolean {
    return this.handlerMap.has(storyId);
  }
}
