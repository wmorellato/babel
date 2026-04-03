/**
 * View Activity Command
 * Displays word count history and activity for a story
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { WordCountRepository } from '../../db/wordCountRepository';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

export class ViewActivityCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private wordCountRepository: WordCountRepository;

  constructor(storyRepository: StoryRepository, wordCountRepository: WordCountRepository) {
    super('ViewActivityCommand');
    this.storyRepository = storyRepository;
    this.wordCountRepository = wordCountRepository;
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
        title: 'View Activity',
        placeHolder: 'Select a story to view activity...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 3: Get word count history for selected story
      const wordCounts = this.wordCountRepository.findByStoryId(selectedStory.storyId);

      // Step 4: Format activity report
      let activityReport = `📊 Activity Report: ${selectedStory.label}\n\n`;

      if (!wordCounts || wordCounts.length === 0) {
        activityReport += 'No activity recorded yet.';
      } else {
        // Sort by date
        const sorted = [...wordCounts].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
        );

        const total = sorted.reduce((sum, entry) => sum + entry.wordCount, 0);
        const avg = Math.round(total / sorted.length);

        activityReport += `Total Entries: ${sorted.length}\n`;
        activityReport += `Total Words: ${total}\n`;
        activityReport += `Average: ${avg} words/entry\n\n`;
        activityReport += 'Recent Activity:\n';

        // Show last 10 entries
        const recent = sorted.slice(-10);
        recent.forEach((entry) => {
          const date = new Date(entry.date).toLocaleDateString();
          activityReport += `  ${date}: ${entry.wordCount} words\n`;
        });
      }

      this.showInfo(`Activity for "${selectedStory.label}" displayed`);
      this.logger.info(`Activity viewed: ${selectedStory.storyId}`);

      return {
        success: true,
        message: `Activity Report: ${selectedStory.label}`,
        data: {
          storyId: selectedStory.storyId,
          report: activityReport,
          entryCount: wordCounts?.length || 0,
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to view activity: ${message}`);
      return {
        success: false,
        message: `Failed to view activity: ${message}`,
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
