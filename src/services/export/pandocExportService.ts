/**
 * Pandoc Export Service
 * Exports stories to DOCX format using pandoc and the prosegrinder/pandoc-templates
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { Logger } from '../../utils/logger';
import { StoryRepository } from '../../db/storyRepository';
import { StoryType } from '../../types';

const logger = new Logger('PandocExportService');

export interface ExportResult {
  success: boolean;
  message: string;
  filePath?: string;
}

export class PandocExportService {
  private storyRepository: StoryRepository;
  private workspacePath: string;

  constructor(storyRepository: StoryRepository, workspacePath: string) {
    this.storyRepository = storyRepository;
    this.workspacePath = workspacePath;
  }

  /**
   * Check if pandoc is installed on the system
   * @returns True if pandoc is available, false otherwise
   */
  isPandocInstalled(): boolean {
    try {
      execSync('pandoc --version', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Export a story to DOCX format using pandoc
   * @param storyId ID of the story to export
   * @param savePath Path where the DOCX file should be saved
   * @param pandocTemplatesPath Path to local pandoc-templates repository
   * @param authorMetadata Optional author metadata for the export
   * @returns ExportResult with success status and file path or error message
   */
  async exportStory(
    storyId: string,
    savePath: string,
    pandocTemplatesPath: string,
    authorMetadata?: {
      authorName?: string;
      authorByline?: string;
      address?: string;
      cityPostcode?: string;
      phone?: string;
      email?: string;
    }
  ): Promise<ExportResult> {
    try {
      logger.debug(`Exporting story: ${storyId} to ${savePath}`);

      // Check if pandoc is installed
      if (!this.isPandocInstalled()) {
        const message =
          'Pandoc is not installed. Please install pandoc from https://pandoc.org/installing.html';
        logger.error(message);
        return {
          success: false,
          message,
        };
      }

      // Validate pandoc templates path
      if (!pandocTemplatesPath || !fs.existsSync(pandocTemplatesPath)) {
        const message = `Pandoc templates path is invalid or not set: ${pandocTemplatesPath}. Please configure "babel.export.pandocTemplatesPath" in settings.`;
        logger.error(message);
        return {
          success: false,
          message,
        };
      }

      // Get story from repository
      const story = this.storyRepository.findById(storyId);
      if (!story) {
        const message = 'Story not found. Please open a valid story file.';
        logger.warn(message);
        return {
          success: false,
          message,
        };
      }

      // Get story directory path
      const storyPath = this.getStoryPath(storyId);

      // Read story content
      const storyContent = this.readStoryContent(storyPath);

      // Create markdown with frontmatter
      const markdown = this.createMarkdownWithFrontmatter(storyContent, story, authorMetadata);

      // Create temporary markdown file
      const tempMarkdownPath = path.join(path.dirname(savePath), `${storyId}-temp.md`);
      fs.writeFileSync(tempMarkdownPath, markdown, 'utf-8');

      try {
        // Determine story type for template selection
        const isShortStory = story.type === StoryType.SHORT_STORY;
        const templateScript = isShortStory ? 'md2short.sh' : 'md2long.sh';
        const scriptPath = path.join(pandocTemplatesPath, 'bin', templateScript);

        // Check if script exists
        if (!fs.existsSync(scriptPath)) {
          throw new Error(`Template script not found: ${scriptPath}`);
        }

        // Run pandoc via the template script
        const command = `bash "${scriptPath}" "${tempMarkdownPath}" -o "${savePath}"`;
        logger.debug(`Running command: ${command}`);
        execSync(command, { encoding: 'utf-8' });

        const message = `Story exported successfully to ${path.basename(savePath)}`;
        logger.info(message);

        return {
          success: true,
          message,
          filePath: savePath,
        };
      } finally {
        // Clean up temporary markdown file
        if (fs.existsSync(tempMarkdownPath)) {
          fs.unlinkSync(tempMarkdownPath);
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const message = `Failed to export story: ${errorMessage}`;
      logger.error(message, error);

      return {
        success: false,
        message,
      };
    }
  }

  /**
   * Get the story directory path
   * @param storyId ID of the story
   * @returns Full path to the story directory
   */
  private getStoryPath(storyId: string): string {
    return path.join(this.workspacePath, storyId);
  }

  /**
   * Read story content from files
   * Handles both single-file (story.md) and multi-chapter structures
   * @param storyPath Path to the story directory
   * @returns Combined story content as markdown
   */
  private readStoryContent(storyPath: string): string {
    if (!fs.existsSync(storyPath)) {
      throw new Error(`Story path not found: ${storyPath}`);
    }

    // Check for single-file story
    const storyFile = path.join(storyPath, 'story.md');
    if (fs.existsSync(storyFile)) {
      return fs.readFileSync(storyFile, 'utf-8');
    }

    // Check for multi-chapter story
    const files = fs.readdirSync(storyPath).filter((file) => {
      const lower = file.toLowerCase();
      return (
        (lower.startsWith('chapter') && lower.endsWith('.md')) ||
        (lower.endsWith('-chapter.md') && lower !== 'story.md')
      );
    });

    if (files.length === 0) {
      throw new Error('No story files found (expected story.md or chapter-*.md)');
    }

    // Sort files numerically by chapter number
    files.sort((a, b) => {
      const aNum = parseInt(a.match(/\d+/)?.[0] || '0');
      const bNum = parseInt(b.match(/\d+/)?.[0] || '0');
      return aNum - bNum;
    });

    // Read and combine all chapter files
    const contents = files.map((file) => {
      const filePath = path.join(storyPath, file);
      return fs.readFileSync(filePath, 'utf-8');
    });

    return contents.join('\n\n');
  }

  /**
   * Create markdown with YAML frontmatter for pandoc
   * @param content Story content in markdown
   * @param story Story metadata
   * @param authorMetadata Author information
   * @returns Markdown string with frontmatter
   */
  private createMarkdownWithFrontmatter(
    content: string,
    story: { displayName: string; currentWordCount?: number },
    authorMetadata?: {
      authorName?: string;
      authorByline?: string;
      address?: string;
      cityPostcode?: string;
      phone?: string;
      email?: string;
    }
  ): string {
    const frontmatter = {
      title: story.displayName,
      author: authorMetadata?.authorName || '',
      byline: authorMetadata?.authorByline || '',
      address: authorMetadata?.address || '',
      city_postcode: authorMetadata?.cityPostcode || '',
      phone: authorMetadata?.phone || '',
      email: authorMetadata?.email || '',
      word_count: story.currentWordCount || 0,
    };

    const yamlFrontmatter = Object.entries(frontmatter)
      .map(([key, value]) => `${key}: ${this.escapeYamlValue(value)}`)
      .join('\n');

    return `---\n${yamlFrontmatter}\n---\n\n${content}`;
  }

  /**
   * Escape values for YAML frontmatter
   * @param value Value to escape
   * @returns Escaped value safe for YAML
   */
  private escapeYamlValue(value: string | number): string {
    const str = String(value);
    if (str.includes(':') || str.includes('"') || str.includes("'") || str.includes('\n')) {
      return `"${str.replace(/"/g, '\\"')}"`;
    }
    return str || '""';
  }
}
