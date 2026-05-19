/**
 * Create Version Tree Command
 * Create a new version (branch) from the tree context menu
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { v4 as uuidv4 } from 'uuid';
import { CommandHandler, CommandResult } from './commandHandler';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';

export class CreateVersionTreeCommand extends CommandHandler {
  private versionRepository: VersionRepository;
  private workspaceRoot: string;
  private refreshCallback: () => void;

  // Validation regex: alphanumeric, dots, dashes, slashes
  private readonly BRANCH_NAME_REGEX = /^[a-zA-Z0-9._\-/]+$/;
  private readonly MAX_BRANCH_NAME_LENGTH = 100;

  constructor(
    versionRepository: VersionRepository,
    workspaceRoot: string,
    refreshCallback: () => void
  ) {
    super('CreateVersionTreeCommand');
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

      // Show input box for version name
      const versionName = await vscode.window.showInputBox({
        title: 'Create New Version',
        prompt: 'Enter version name (e.g., draft-2, revision-1)',
        placeHolder: 'my-version',
        validateInput: (value: string) => {
          if (!value.trim()) {
            return 'Version name cannot be empty';
          }
          if (value.trim().length > this.MAX_BRANCH_NAME_LENGTH) {
            return `Version name is too long (max ${this.MAX_BRANCH_NAME_LENGTH} characters)`;
          }
          if (!this.BRANCH_NAME_REGEX.test(value.trim())) {
            return 'Invalid characters. Use alphanumeric, dots, dashes, and slashes only.';
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

      const trimmedName = versionName.trim();

      // Check for duplicate version name
      const existingVersions = this.versionRepository.findByStoryId(storyId);
      if (existingVersions.some((v) => v.gitBranch === trimmedName)) {
        this.showWarning(`Version "${trimmedName}" already exists for this story`);
        return {
          success: false,
          message: `Version "${trimmedName}" already exists`,
        };
      }

      // Create git repository instance for this story
      const storyPath = path.join(this.workspaceRoot, storyId);
      const storyGit = new GitRepository(storyPath);

      // Create git branch from current branch
      try {
        await storyGit.createBranch(trimmedName);
        this.logger.info(`Git branch created: ${trimmedName}`);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        this.showError(`Failed to create branch: ${errorMsg}`);
        return {
          success: false,
          message: `Failed to create branch: ${errorMsg}`,
        };
      }

      // Create version record in database
      try {
        const version = {
          id: uuidv4(),
          storyId,
          gitBranch: trimmedName,
          createdAt: new Date(),
        };
        this.versionRepository.create(version);
        this.logger.info(`Version created: ${trimmedName}`, { storyId });
      } catch (error) {
        // Rollback: attempt to delete the branch
        try {
          await storyGit.deleteBranch(trimmedName, true);
          this.logger.info(`Rolled back branch deletion: ${trimmedName}`);
        } catch (rollbackError) {
          this.logger.warn(`Failed to rollback branch ${trimmedName}: ${rollbackError}`);
        }

        const errorMsg = error instanceof Error ? error.message : String(error);
        this.showError(`Failed to create version: ${errorMsg}`);
        return {
          success: false,
          message: `Failed to create version: ${errorMsg}`,
        };
      }

      // Refresh tree
      this.refreshCallback();

      this.showInfo(`Version "${trimmedName}" created successfully`);
      return {
        success: true,
        message: `Version "${trimmedName}" created successfully`,
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
    return true;
  }
}
