/**
 * Story Status Bar Item
 * Shows current file's story name in the status bar
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { StoryRepository } from '../db/storyRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('StoryStatusBar');

export class StoryStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private storyRepository: StoryRepository,
    private workspaceRoot: string
  ) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    this.statusBarItem.command = undefined;
    this.hide();
  }

  /**
   * Update status bar with current editor's story
   */
  updateForEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.hide();
      return;
    }

    const filePath = editor.document.uri.fsPath;

    // Only show for files under workspace root
    if (!filePath.startsWith(this.workspaceRoot)) {
      this.hide();
      return;
    }

    const relativePath = path.relative(this.workspaceRoot, filePath);
    const pathSegments = relativePath.split(path.sep);

    if (pathSegments.length < 2) {
      this.hide();
      return;
    }

    const storyId = pathSegments[0];

    // Validate UUID format
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(storyId)) {
      this.hide();
      return;
    }

    try {
      const story = this.storyRepository.findById(storyId);
      if (!story) {
        this.hide();
        return;
      }

      // Update status bar with story name only
      this.statusBarItem.text = story.displayName;
      this.statusBarItem.tooltip = `Story: ${story.displayName}\nPath: ${filePath}`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
      this.show();

      logger.debug(`Status bar updated for ${storyId}: ${story.displayName}`);
    } catch (error) {
      logger.debug(`Error updating status bar: ${error}`);
      this.hide();
    }
  }

  /**
   * Show the status bar item
   */
  private show(): void {
    this.statusBarItem.show();
  }

  /**
   * Hide the status bar item
   */
  private hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Dispose the status bar item
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
