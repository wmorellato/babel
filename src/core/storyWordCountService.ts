/**
 * Story Word Count Service
 * Computes and persists word counts for stories
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import { StoryRepository } from '../db/storyRepository';
import { StoryType } from '../types';
import { countWordsInFiles } from '../utils/wordCounter';
import { Logger } from '../utils/logger';
import { ValidationError } from '../utils/errorHandler';

const logger = new Logger('StoryWordCountService');

export class StoryWordCountService {
  constructor(
    private storyRepository: StoryRepository,
    private workspaceRoot: string
  ) {}

  /**
   * Update the word count for a story
   * @param storyId - The story ID to update
   * @returns The computed word count
   * @throws ValidationError if story not found
   */
  async updateWordCount(storyId: string): Promise<number> {
    try {
      // Get story to determine type
      const story = this.storyRepository.findById(storyId);
      if (!story) {
        throw new ValidationError(`Story with id ${storyId} not found`);
      }

      // Resolve files to count based on story type
      const filePaths = await this.resolveStoryFiles(storyId, story.type);

      // Count words in all files
      const wordCount = await countWordsInFiles(filePaths);

      // Persist the count
      this.storyRepository.updateWordCount(storyId, wordCount);

      logger.info(`Word count updated for story ${storyId}: ${wordCount} words`);
      return wordCount;
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw new ValidationError(`Failed to update word count: ${error}`);
    }
  }

  /**
   * Resolve which files to count based on story type
   * @param storyId - The story ID
   * @param storyType - The story type
   * @returns Array of file paths to count
   */
  async resolveStoryFiles(storyId: string, storyType: StoryType): Promise<string[]> {
    const storyDir = path.join(this.workspaceRoot, storyId);

    switch (storyType) {
      case StoryType.SHORT_STORY:
        // Single-file stories
        return [path.join(storyDir, 'story.md')];

      case StoryType.ESSAY:
        // Single-file stories
        return [path.join(storyDir, 'essay.md')];

      case StoryType.NOVEL:
      case StoryType.NOVELLA:
        // Multi-file stories - count all markdown files in chapters directory
        return this.getChapterFiles(storyDir);

      default:
        throw new ValidationError(`Unknown story type: ${storyType}`);
    }
  }

  /**
   * Get all chapter files from the chapters directory
   * @param storyDir - The story directory
   * @returns Array of chapter file paths
   */
  private async getChapterFiles(storyDir: string): Promise<string[]> {
    const chaptersDir = path.join(storyDir, 'chapters');

    try {
      const files = await fs.readdir(chaptersDir);
      const markdownFiles = files
        .filter((file) => file.endsWith('.md'))
        .map((file) => path.join(chaptersDir, file))
        .sort(); // Sort for consistent ordering

      return markdownFiles;
    } catch (error) {
      // Chapters directory may not exist yet
      logger.debug(`Chapters directory not found for story: ${storyDir}`);
      return [];
    }
  }
}
