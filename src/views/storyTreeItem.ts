/**
 * Story Tree Item
 * Represents a story folder in the Babel Stories sidebar
 */

import * as vscode from 'vscode';
import { Story, StoryType } from '../types/index';

export class StoryTreeItem extends vscode.TreeItem {
  readonly storyId: string;
  readonly storyType: StoryType;

  constructor(story: Story, versionCount: number = 0, currentBranch: string = 'unknown') {
    super(story.displayName, vscode.TreeItemCollapsibleState.Collapsed);

    this.storyId = story.id;
    this.storyType = story.type;
    // Include story type in context value for conditional menu visibility
    this.contextValue = `babelStory:${story.type}`;

    // Use custom icon if set, otherwise use type-based default
    const iconName = story.iconName || this.getDefaultIconForType(story.type);
    this.iconPath = new vscode.ThemeIcon(iconName);

    // Description: word count (e.g., "5000 words")
    const wordCountStr = story.currentWordCount ? `${story.currentWordCount} words` : '';
    this.description = currentBranch;
    this.tooltip = `${wordCountStr} · Created: ${new Date(story.createdAt).toLocaleDateString()}`;
  }
  
  /**
   * Get default icon based on story type
   */
  private getDefaultIconForType(type: StoryType): string {
    const defaults: Record<StoryType, string> = {
      [StoryType.NOVEL]: 'book',
      [StoryType.SHORT_STORY]: 'file-text',
      [StoryType.NOVELLA]: 'book',
      [StoryType.ESSAY]: 'note',
    };
    return defaults[type] || 'book';
  }
}
