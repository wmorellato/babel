/**
 * Force Commit Command
 * Manually triggers a commit on the current story, bypassing word count threshold
 */

import * as path from 'path';
import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { AutoCommitManager } from '../autoCommitManager';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Command to manually commit the current story file
 */
export class ForceCommitCommand extends CommandHandler {
  constructor(
    private autoCommitManager: AutoCommitManager,
    private workspaceRoot: string
  ) {
    super('ForceCommitCommand');
  }

  async execute(): Promise<CommandResult> {
    if (!(await this.validatePrerequisites())) {
      return { success: false, message: 'No story file is open' };
    }

    const editor = vscode.window.activeTextEditor!;
    const filePath = editor.document.uri.fsPath;
    const storyId = path.relative(this.workspaceRoot, filePath).split(path.sep)[0];

    // Ensure handler exists for this story
    await this.autoCommitManager.ensureHandler(storyId);
    const handler = this.autoCommitManager.getHandler(storyId);

    if (!handler) {
      return { success: false, message: 'Could not initialize git handler for this story' };
    }

    // Trigger commit
    const wordCount = handler.getWordCount();
    await handler.triggerCommit(wordCount, 'Manual save', { wordCount, wordDelta: 0 });
    return { success: true };
  }

  protected async validatePrerequisites(): Promise<boolean> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) return false;

    const filePath = editor.document.uri.fsPath;
    if (!filePath.startsWith(this.workspaceRoot)) return false;

    const storyId = path.relative(this.workspaceRoot, filePath).split(path.sep)[0];
    return UUID_PATTERN.test(storyId);
  }
}
