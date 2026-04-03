/**
 * Delete Story Command
 * Soft-delete a story from the tree (rename folder to hide it)
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';

export class DeleteStoryCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private workspaceRoot: string;
  private refreshCallback: () => void;

  constructor(storyRepository: StoryRepository, workspaceRoot: string, refreshCallback: () => void) {
    super('DeleteStoryCommand');
    this.storyRepository = storyRepository;
    this.workspaceRoot = workspaceRoot;
    this.refreshCallback = refreshCallback;
  }

  async execute(treeItem: any): Promise<CommandResult> {
    try {
      const storyId = treeItem?.storyId;
      if (!storyId) {
        return {
          success: false,
          message: 'Invalid story selected',
        };
      }

      const story = this.storyRepository.findById(storyId);
      if (!story) {
        this.showError('Story not found');
        return {
          success: false,
          message: 'Story not found',
        };
      }

      // Confirm deletion
      const confirmed = await vscode.window.showWarningMessage(
        `Delete "${story.displayName}"? (Files will be hidden, not deleted)`,
        { modal: true },
        'Delete'
      );

      if (confirmed !== 'Delete') {
        return {
          success: false,
          message: 'Delete cancelled',
        };
      }

      // Soft-delete: update database
      this.storyRepository.delete(storyId);

      // Hide folder
      const oldPath = path.join(this.workspaceRoot, storyId);
      const newPath = path.join(this.workspaceRoot, `.hidden-${storyId}`);

      if (fs.existsSync(oldPath)) {
        try {
          fs.renameSync(oldPath, newPath);
          this.logger.info(`Story folder hidden: ${oldPath} -> ${newPath}`);
        } catch (renameError) {
          const errorMsg = renameError instanceof Error ? renameError.message : String(renameError);
          this.showError(`Failed to hide story folder: ${errorMsg}`);
          return {
            success: false,
            message: `Failed to hide story folder: ${errorMsg}`,
          };
        }
      } else {
        this.showInformationMessage(`Story folder not found. It may have already been deleted.`);
      }

      // Refresh tree
      this.refreshCallback();

      this.showInfo(`Story "${story.displayName}" deleted`);
      this.logger.info(`Story deleted (soft): ${storyId} (${story.displayName})`);

      return {
        success: true,
        message: `Story "${story.displayName}" deleted`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to delete story: ${message}`);
      return {
        success: false,
        message: `Failed to delete story: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }

  /**
   * Show information message
   */
  private showInformationMessage(message: string): void {
    vscode.window.showInformationMessage(`Babel: ${message}`);
    this.logger.info(message);
  }
}
