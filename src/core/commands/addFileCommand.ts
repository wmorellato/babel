/**
 * Add File Command
 * Prompts user for filename and creates it in story folder
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { Logger } from '../../utils/logger';

const logger = new Logger('AddFileCommand');

export class AddFileCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('AddFileCommand');
  }

  /**
   * Execute command to add a new file to a story
   * @param storyId ID of the story to add file to
   * @returns Command result with success status and message
   */
  async execute(storyId: string): Promise<CommandResult> {
    try {
      // Prompt for filename
      const fileName = await this.vscodeWindow.showInputBox({
        prompt: 'File name (including .md)?',
        validateInput: (value: string) => this.validateFileName(value),
      });

      // User cancelled
      if (fileName === undefined) {
        return { success: true, message: 'Cancelled' };
      }

      // Create file
      const result = await this.storyFileService.createFile(storyId, fileName);

      // Refresh tree view
      this.treeDataProvider.refresh();

      // Open file in editor
      const fileUri = vscode.Uri.file(result.filePath);
      await this.vscodeWindow.showTextDocument(fileUri);

      logger.info(`File created: ${fileName}`);

      return {
        success: true,
        message: `File '${fileName}' created`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create file: ${message}`);

      await this.vscodeWindow.showErrorMessage(
        `Failed to create file: ${message}`
      );

      return {
        success: false,
        message: `Failed to create file: ${message}`,
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
   * Validate filename
   * @param value The filename to validate
   * @returns Error message if invalid, undefined if valid
   */
  private validateFileName(value: string): string | undefined {
    if (!value || value.trim().length === 0) {
      return 'Filename cannot be empty';
    }

    if (!value.endsWith('.md')) {
      return 'Filename must end with .md';
    }

    if (/[<>:"\\/|?*]/.test(value)) {
      return 'Filename contains invalid characters: < > : " / \\ | ? *';
    }

    return undefined;
  }

  /**
   * Register the command with VSCode
   */
  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.addFile',
      async (storyItem: any) => {
        const command = new AddFileCommand(storyFileService, treeDataProvider);
        return command.execute(storyItem.storyId);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('AddFileCommand registered');
  }
}
