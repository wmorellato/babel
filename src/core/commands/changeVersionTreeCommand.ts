/**
 * Change Version Tree Command
 * Switch story version from the tree context menu
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { VersionRepository } from '../../db/versionRepository';
import { VersionSwitcher } from '../versionSwitcher';
import { GitRepository } from '../../git/gitRepository';

export class ChangeVersionTreeCommand extends CommandHandler {
  private versionRepository: VersionRepository;
  private workspaceRoot: string;
  private refreshCallback: () => void;

  constructor(
    versionRepository: VersionRepository,
    workspaceRoot: string,
    refreshCallback: () => void
  ) {
    super('ChangeVersionTreeCommand');
    this.versionRepository = versionRepository;
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

      // Get available versions
      const versions = this.versionRepository.findByStoryId(storyId);
      if (versions.length === 0) {
        this.showWarning('No versions available for this story');
        return {
          success: false,
          message: 'No versions available',
        };
      }

      // Show QuickPick
      const picks = versions.map((v) => ({
        label: v.gitBranch,
        description: `Created: ${new Date(v.createdAt).toLocaleDateString()}`,
        version: v,
      }));

      const selected = await vscode.window.showQuickPick(picks, {
        title: 'Select Version',
        placeHolder: 'Choose a version to switch to...',
      });

      if (!selected) {
        return {
          success: false,
          message: 'Version selection cancelled',
        };
      }

      // Create story-specific version switcher
      const storyPath = path.join(this.workspaceRoot, storyId);
      const storyGit = new GitRepository(storyPath);
      const versionSwitcher = new VersionSwitcher(storyGit);

      // Switch version
      try {
        await versionSwitcher.switchToVersion(selected.version.gitBranch);
        this.refreshCallback();
        this.showInfo(`Switched to version: ${selected.version.gitBranch}`);
        this.logger.info(`Version switched: ${selected.version.gitBranch}`);
        return {
          success: true,
          message: `Switched to version: ${selected.version.gitBranch}`,
        };
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('conflict')) {
          this.showWarning(`Version switch failed: ${errorMsg}`);
        } else {
          this.showError(`Failed to switch version: ${errorMsg}`);
        }
        return {
          success: false,
          message: `Failed to switch version: ${errorMsg}`,
        };
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to change version: ${message}`);
      return {
        success: false,
        message: `Failed to change version: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }
}
