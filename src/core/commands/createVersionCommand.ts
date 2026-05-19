/**
 * Create Version Command
 * Creates a new story version by branching from current version
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';
import { v4 as uuidv4 } from 'uuid';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

export class CreateVersionCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private versionRepository: VersionRepository;
  private gitRepository: GitRepository;

  constructor(
    storyRepository: StoryRepository,
    versionRepository: VersionRepository,
    gitRepository: GitRepository
  ) {
    super('CreateVersionCommand');
    this.storyRepository = storyRepository;
    this.versionRepository = versionRepository;
    this.gitRepository = gitRepository;
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
        title: 'Create Version',
        placeHolder: 'Select a story to create a version from...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 3: Prompt for version name (branch name)
      const versionName = await vscode.window.showInputBox({
        title: 'Create New Version',
        prompt: 'Enter version name (will be used as branch name)',
        placeHolder: 'e.g., "v2.0", "feature-branch", "final-draft"',
        validateInput: (value: string) => {
          if (!value.trim()) {
            return 'Version name cannot be empty';
          }
          // Basic git branch name validation
          if (!/^[a-zA-Z0-9._\-/]+$/.test(value.trim())) {
            return 'Invalid branch name (use letters, numbers, ., -, /)';
          }
          return null;
        },
      });

      if (!versionName) {
        return {
          success: false,
          message: 'Version creation cancelled',
        };
      }

      if (!versionName.trim()) {
        return {
          success: false,
          message: 'Version name cannot be empty',
        };
      }

      const branchName = versionName.trim();

      // Step 4: Check if branch already exists
      const existingVersions = this.versionRepository.findByStoryId(selectedStory.storyId);
      if (existingVersions.some((v) => v.gitBranch === branchName)) {
        return {
          success: false,
          message: `Version "${branchName}" already exists for this story`,
        };
      }

      // Step 5: Create the git branch
      await this.gitRepository.createBranch(branchName);

      // Step 6: Create the version record
      const versionId = uuidv4();
      this.versionRepository.create({
        id: versionId,
        storyId: selectedStory.storyId,
        gitBranch: branchName,
        createdAt: new Date(),
      });

      this.showInfo(`Version "${branchName}" created successfully`);
      this.logger.info(
        `Version created: ${versionId} (story: ${selectedStory.storyId}, branch: ${branchName})`
      );

      return {
        success: true,
        message: `Version "${branchName}" created successfully`,
        data: { versionId, storyId: selectedStory.storyId, branchName },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to create version: ${message}`);
      return {
        success: false,
        message: `Failed to create version: ${message}`,
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
