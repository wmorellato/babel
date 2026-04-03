/**
 * Delete Version Command
 * Deletes a story version (git branch) with confirmation
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

interface VersionItem extends vscode.QuickPickItem {
  branchName: string;
}

export class DeleteVersionCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private versionRepository: VersionRepository;
  private gitRepository: GitRepository;

  // Protected branches that cannot be deleted
  private readonly protectedBranches = ['main', 'master', 'develop', 'staging', 'production'];

  constructor(
    versionRepository: VersionRepository,
    gitRepository: GitRepository,
    storyRepository?: StoryRepository
  ) {
    super('DeleteVersionCommand');
    this.versionRepository = versionRepository;
    this.gitRepository = gitRepository;
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
        title: 'Delete Version',
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
        title: 'Select Version to Delete',
        placeHolder: 'Select a version to delete...',
      });

      if (!selectedVersion) {
        return {
          success: false,
          message: 'Version selection cancelled',
        };
      }

      // Step 5: Check if branch is protected
      if (this.protectedBranches.includes(selectedVersion.branchName)) {
        return {
          success: false,
          message: `Cannot delete protected branch "${selectedVersion.branchName}"`,
        };
      }

      // Step 6: Request deletion confirmation
      const confirmed = await vscode.window.showWarningMessage(
        `Are you sure you want to delete version "${selectedVersion.branchName}"? This cannot be undone.`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      if (confirmed !== 'Delete') {
        return {
          success: false,
          message: 'Deletion cancelled',
        };
      }

      // Step 7: Delete the git branch
      await this.gitRepository.deleteBranch(selectedVersion.branchName, true);

      // Step 8: Mark version as deleted in database
      const versionToDelete = versions.find((v) => v.gitBranch === selectedVersion.branchName);
      if (versionToDelete) {
        this.versionRepository.softDelete(versionToDelete.id);
      }

      this.showInfo(`Version "${selectedVersion.branchName}" deleted successfully`);
      this.logger.info(
        `Version deleted: ${selectedStory.storyId} → ${selectedVersion.branchName}`
      );

      return {
        success: true,
        message: `Version "${selectedVersion.branchName}" deleted successfully`,
        data: {
          storyId: selectedStory.storyId,
          branchName: selectedVersion.branchName,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to delete version: ${message}`);
      return {
        success: false,
        message: `Failed to delete version: ${message}`,
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
