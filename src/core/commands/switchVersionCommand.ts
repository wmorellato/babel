/**
 * Switch Version Command
 * Switches current working directory to a different story version (git branch)
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { VersionSwitcher } from '../versionSwitcher';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

interface VersionItem extends vscode.QuickPickItem {
  branchName: string;
}

export class SwitchVersionCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private versionRepository: VersionRepository;
  private versionSwitcher: VersionSwitcher;

  constructor(
    versionRepository: VersionRepository,
    versionSwitcher: VersionSwitcher,
    storyRepository?: StoryRepository
  ) {
    super('SwitchVersionCommand');
    this.versionRepository = versionRepository;
    this.versionSwitcher = versionSwitcher;
    // storyRepository may be undefined in some contexts - will be injected later
    this.storyRepository = storyRepository as StoryRepository;
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
      if (!this.storyRepository) {
        return {
          success: false,
          message: 'Story repository not available',
        };
      }

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
        title: 'Switch Version',
        placeHolder: 'Select a story...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 3: Get versions for selected story
      const versions = this.versionRepository.findByStoryId(selectedStory.storyId);

      if (!versions || versions.length === 0) {
        return {
          success: false,
          message: 'No versions found for this story',
        };
      }

      // Convert versions to QuickPickItems
      const versionItems: VersionItem[] = versions.map((version) => ({
        label: version.gitBranch,
        branchName: version.gitBranch,
        description: `Created: ${new Date(version.createdAt).toLocaleDateString()}`,
      }));

      // Step 4: Prompt user to select version
      const selectedVersion = await vscode.window.showQuickPick(versionItems, {
        title: 'Select Version',
        placeHolder: 'Select a version to switch to...',
      });

      if (!selectedVersion) {
        return {
          success: false,
          message: 'Version selection cancelled',
        };
      }

      // Step 5: Switch to the selected version
      await this.versionSwitcher.switchToVersion(selectedVersion.branchName);

      this.showInfo(`Switched to version "${selectedVersion.branchName}"`);
      this.logger.info(
        `Version switched: ${selectedStory.storyId} → ${selectedVersion.branchName}`
      );

      return {
        success: true,
        message: `Switched to version "${selectedVersion.branchName}"`,
        data: {
          storyId: selectedStory.storyId,
          branchName: selectedVersion.branchName,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to switch version: ${message}`);
      return {
        success: false,
        message: `Failed to switch version: ${message}`,
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
