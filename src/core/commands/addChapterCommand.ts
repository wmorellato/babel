/**
 * Add Chapter Command
 * Creates a new chapter for Novel or Novella stories
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { StoryRepository } from '../../db/storyRepository';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { StoryType } from '../../types';
import { Logger } from '../../utils/logger';

const logger = new Logger('AddChapterCommand');

export class AddChapterCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private storyRepository: StoryRepository,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('AddChapterCommand');
  }

  /**
   * Execute command to add a new chapter to a story
   * @param storyId ID of the story to add chapter to
   * @returns Command result with success status and message
   */
  async execute(storyId: string): Promise<CommandResult> {
    try {
      // Verify story exists
      const story = this.storyRepository.findById(storyId);
      if (!story) {
        await this.vscodeWindow.showErrorMessage('Story not found');
        return {
          success: false,
          message: 'Story not found',
        };
      }

      // Verify story type supports chapters
      if (story.type !== StoryType.NOVEL && story.type !== StoryType.NOVELLA) {
        await this.vscodeWindow.showErrorMessage(
          'Add Chapter is only available for Novels and Novellas'
        );
        return {
          success: false,
          message: 'Add Chapter only available for Novels and Novellas',
        };
      }

      // Get chapter count and suggest next chapter number
      const chapterCount = await this.storyFileService.getChapterCount(storyId);
      const suggestedName = `Chapter ${chapterCount + 1}`;

      // Prompt for chapter name
      const chapterName = await this.vscodeWindow.showInputBox({
        prompt: 'Chapter name?',
        value: suggestedName,
        validateInput: (value: string) => this.validateChapterName(value),
      });

      // User cancelled
      if (chapterName === undefined) {
        return { success: true, message: 'Cancelled' };
      }

      // Create chapter
      const result = await this.storyFileService.createChapter(storyId, chapterName);

      // Refresh tree view
      this.treeDataProvider.refresh();

      // Open file in editor
      const fileUri = vscode.Uri.file(result.filePath);
      await this.vscodeWindow.showTextDocument(fileUri);

      logger.info(`Chapter created: ${chapterName}`);

      return {
        success: true,
        message: `Chapter '${chapterName}' created`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create chapter: ${message}`);

      await this.vscodeWindow.showErrorMessage(
        `Failed to create chapter: ${message}`
      );

      return {
        success: false,
        message: `Failed to create chapter: ${message}`,
      };
    }
  }

  /**
   * Validate prerequisites before execution
   */
  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }

  /**
   * Validate chapter name
   * @param value The chapter name to validate
   * @returns Error message if invalid, undefined if valid
   */
  private validateChapterName(value: string): string | undefined {
    if (!value || value.trim().length === 0) {
      return 'Chapter name cannot be empty';
    }

    return undefined;
  }

  /**
   * Register the command with VSCode
   */
  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    storyRepository: StoryRepository,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.addChapter',
      async (storyItem: any) => {
        const command = new AddChapterCommand(
          storyFileService,
          storyRepository,
          treeDataProvider
        );
        return command.execute(storyItem.storyId);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('AddChapterCommand registered');
  }
}
