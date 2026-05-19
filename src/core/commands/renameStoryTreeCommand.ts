/**
 * Rename Story Tree Command
 * Rename a story from the tree context menu
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';

export class RenameStoryTreeCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private refreshCallback: () => void;

  constructor(storyRepository: StoryRepository, refreshCallback: () => void) {
    super('RenameStoryTreeCommand');
    this.storyRepository = storyRepository;
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

      const newName = await vscode.window.showInputBox({
        title: 'Rename Story',
        prompt: 'Enter new story name',
        value: story.displayName,
        validateInput: (value: string) => {
          if (!value.trim()) {
            return 'Story name cannot be empty';
          }
          return null;
        },
      });

      if (!newName) {
        return {
          success: false,
          message: 'Rename cancelled',
        };
      }

      // Update story in database
      this.storyRepository.update({
        ...story,
        displayName: newName.trim(),
        updatedAt: new Date(),
      });

      // Refresh tree
      this.refreshCallback();

      this.showInfo(`Story renamed to "${newName.trim()}"`);
      this.logger.info(`Story renamed: ${storyId} -> ${newName.trim()}`);

      return {
        success: true,
        message: `Story renamed to "${newName.trim()}"`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to rename story: ${message}`);
      return {
        success: false,
        message: `Failed to rename story: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }
}
