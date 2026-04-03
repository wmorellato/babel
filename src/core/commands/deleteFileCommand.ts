/**
 * Delete File Command
 * Prompts user for confirmation and deletes file from story folder
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { Logger } from '../../utils/logger';

const logger = new Logger('DeleteFileCommand');

export class DeleteFileCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('DeleteFileCommand');
  }

  /**
   * Execute command to delete a file from a story
   * @param storyId ID of the story containing the file
   * @param filePath Path to the file to delete
   * @returns Command result with success status and message
   */
  async execute(storyId: string, filePath: string): Promise<CommandResult> {
    try {
      const fileName = path.basename(filePath);

      // Show confirmation dialog
      const choice = await this.vscodeWindow.showWarningMessage(
        `Delete '${fileName}'? This will be committed to Git.`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      // User cancelled
      if (!choice || choice === 'Cancel') {
        return { success: true, message: 'Cancelled' };
      }

      // Delete file
      await this.storyFileService.deleteFile(storyId, filePath);

      // Refresh tree view
      this.treeDataProvider.refresh();

      logger.info(`File deleted: ${fileName}`);

      return {
        success: true,
        message: `File '${fileName}' deleted`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete file: ${message}`);

      // Refresh tree anyway to sync state
      this.treeDataProvider.refresh();

      await this.vscodeWindow.showErrorMessage(
        `Failed to delete file: ${message}`
      );

      return {
        success: false,
        message: `Failed to delete file: ${message}`,
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
   * Register the command with VSCode
   */
  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.deleteFile',
      async (fileItem: any) => {
        const command = new DeleteFileCommand(storyFileService, treeDataProvider);
        return command.execute(fileItem.storyId, fileItem.filePath);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('DeleteFileCommand registered');
  }
}
