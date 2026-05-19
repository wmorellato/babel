/**
 * Rename Story Command
 * Prompts user to select a story and rename it
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

export class RenameStoryCommand extends CommandHandler {
  private storyRepository: StoryRepository;

  constructor(storyRepository: StoryRepository) {
    super('RenameStoryCommand');
    this.storyRepository = storyRepository;
  }

  async execute(...args: unknown[]): Promise<CommandResult> {
    try {
      const valid = await this.validatePrerequisites();
      if (!valid) {
        return {
          success: false,
          message: 'No workspace folder open',
        };
      }

      // Step 1: Get list of stories
      const stories = this.storyRepository.findAll();

      if (!stories || stories.length === 0) {
        return {
          success: false,
          message: 'No stories found',
        };
      }

      // Convert stories to QuickPickItems
      const storyItems: StoryItem[] = stories.map((story) => ({
        label: story.displayName,
        storyId: story.id,
        description: story.type,
      }));

      // Step 2: Prompt user to select story
      const selectedStory = await vscode.window.showQuickPick(storyItems, {
        title: 'Rename Story',
        placeHolder: 'Select a story to rename...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 3: Prompt for new name
      const newName = await vscode.window.showInputBox({
        title: 'Rename Story',
        prompt: 'Enter new story name',
        value: selectedStory.label,
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

      if (!newName.trim()) {
        return {
          success: false,
          message: 'Story name cannot be empty',
        };
      }

      // Step 4: Rename the story
      const story = this.storyRepository.findById(selectedStory.storyId);
      if (!story) {
        return {
          success: false,
          message: 'Story not found',
        };
      }

      this.storyRepository.update({
        id: story.id,
        displayName: newName.trim(),
        type: story.type,
        createdAt: story.createdAt,
        updatedAt: new Date(),
      });

      const updated = this.storyRepository.findById(selectedStory.storyId);
      if (!updated) {
        return {
          success: false,
          message: 'Failed to verify rename',
        };
      }

      this.showInfo(`Story renamed to "${updated.displayName}"`);
      this.logger.info(`Story renamed: ${selectedStory.storyId} → "${updated.displayName}"`);

      return {
        success: true,
        message: `Story renamed to "${updated.displayName}"`,
        data: { storyId: updated.id, storyName: updated.displayName },
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
    const workspace = vscode.workspace.workspaceFolders;
    if (!workspace || workspace.length === 0) {
      return false;
    }
    return true;
  }
}
