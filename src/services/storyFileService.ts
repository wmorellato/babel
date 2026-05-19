/**
 * Story File Service
 * Handles file creation and deletion with Git integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitRepository } from '../git/gitRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('StoryFileService');

const INVALID_FILENAME_CHARS = /[<>:"\\/|?*]/;
const CHAPTER_PATTERN = /^chapter\d+\.md$/i;
const CHAPTERS_FOLDER = 'chapters';

export class StoryFileService {
  constructor(
    private gitRepository: GitRepository,
    private workspaceRoot: string
  ) {}

  /**
   * Check if workspace is a git repository
   */
  private isGitRepository(): boolean {
    try {
      const gitPath = path.join(this.workspaceRoot, '.git');
      return fs.existsSync(gitPath);
    } catch {
      return false;
    }
  }

  /**
   * Attempt to commit to git, but don't fail if not a git repo
   */
  private async tryCommit(message: string): Promise<void> {
    if (!this.isGitRepository()) {
      logger.debug('Not a git repository, skipping commit');
      return;
    }

    try {
      await this.gitRepository.commit(message);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.warn(`Git commit failed (non-fatal): ${msg}`);
      // Don't throw - file creation succeeded, git is optional
    }
  }

  /**
   * Check if file exists in story folder
   */
  async fileExists(storyId: string, fileName: string): Promise<boolean> {
    const filePath = path.join(this.workspaceRoot, storyId, fileName);
    return fs.existsSync(filePath);
  }

  /**
   * Create empty markdown file in story folder
   * @throws Error if validation fails or file operation fails
   */
  async createFile(
    storyId: string,
    fileName: string
  ): Promise<{ filePath: string }> {
    // Validate filename
    if (!fileName || fileName.trim().length === 0) {
      throw new Error('Filename cannot be empty');
    }

    if (!fileName.endsWith('.md')) {
      throw new Error('Filename must end with .md');
    }

    if (INVALID_FILENAME_CHARS.test(fileName)) {
      throw new Error('Filename contains invalid characters');
    }

    const storyPath = path.join(this.workspaceRoot, storyId);
    const filePath = path.join(storyPath, fileName);

    // Check if already exists
    if (await this.fileExists(storyId, fileName)) {
      throw new Error(`File '${fileName}' already exists in this story`);
    }

    // Create file
    try {
      fs.writeFileSync(filePath, '');
      logger.debug(`Created file: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create file: ${message}`);
      throw new Error(`Failed to create file: ${message}`);
    }

    // Commit to Git (optional - don't fail if not a git repo)
    await this.tryCommit(`feat: add file ${fileName}`);

    return { filePath };
  }

  /**
   * Get count of existing chapter files in chapters folder
   */
  async getChapterCount(storyId: string): Promise<number> {
    const chaptersPath = path.join(this.workspaceRoot, storyId, CHAPTERS_FOLDER);

    if (!fs.existsSync(chaptersPath)) {
      return 0;
    }

    try {
      const files = fs.readdirSync(chaptersPath);
      const chapterCount = files.filter((f) => CHAPTER_PATTERN.test(f)).length;
      return chapterCount;
    } catch (error) {
      logger.error(`Failed to count chapters: ${error}`);
      return 0;
    }
  }

  /**
   * Create chapter file with markdown heading in chapters folder
   * Converts user-friendly name to filename (lowercase, spaces→hyphens)
   * @throws Error if validation fails or file operation fails
   */
  async createChapter(
    storyId: string,
    chapterName: string
  ): Promise<{ filePath: string }> {
    // Convert name to filename
    const fileName = chapterName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .concat('.md');

    const chaptersPath = path.join(this.workspaceRoot, storyId, CHAPTERS_FOLDER);
    const filePath = path.join(chaptersPath, fileName);

    // Check if already exists
    if (fs.existsSync(filePath)) {
      throw new Error(`File '${fileName}' already exists in this story`);
    }

    // Ensure chapters folder exists
    try {
      if (!fs.existsSync(chaptersPath)) {
        fs.mkdirSync(chaptersPath, { recursive: true });
        logger.debug(`Created chapters folder: ${chaptersPath}`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create chapters folder: ${message}`);
      throw new Error(`Failed to create chapters folder: ${message}`);
    }

    // Create file with markdown heading
    const content = `# ${chapterName}\n`;

    try {
      fs.writeFileSync(filePath, content);
      logger.debug(`Created chapter: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create chapter: ${message}`);
      throw new Error(`Failed to create chapter: ${message}`);
    }

    // Commit to Git (optional - don't fail if not a git repo)
    await this.tryCommit(`feat: add chapter ${chapterName}`);

    return { filePath };
  }

  /**
   * Delete file from disk and commit deletion
   * @throws Error if file not found, outside story folder, or commit fails
   */
  async deleteFile(storyId: string, filePath: string): Promise<void> {
    const storyPath = path.join(this.workspaceRoot, storyId);

    // Security check: ensure file is within story folder
    const normalizedFilePath = path.normalize(filePath);
    const normalizedStoryPath = path.normalize(storyPath);

    if (!normalizedFilePath.startsWith(normalizedStoryPath)) {
      throw new Error('Cannot delete files outside story folder');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    // Delete file
    try {
      fs.unlinkSync(filePath);
      logger.debug(`Deleted file: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete file: ${message}`);
      throw new Error(`Failed to delete file: ${message}`);
    }

    // Extract filename for commit message
    const fileName = path.basename(filePath);

    // Commit to Git (optional - don't fail if not a git repo)
    await this.tryCommit(`refactor: remove file ${fileName}`);
  }
}
