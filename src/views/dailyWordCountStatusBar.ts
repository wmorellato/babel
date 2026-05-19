/**
 * Daily Word Count Status Bar Item
 * Displays net words written today alongside story name
 */

import * as vscode from 'vscode';
import { DailyWordCountTracker } from '../core/dailyWordCountTracker';
import { Logger } from '../utils/logger';

const logger = new Logger('DailyWordCountStatusBar');

export class DailyWordCountStatusBar {
  private statusBarItem: vscode.StatusBarItem;

  constructor(private tracker: DailyWordCountTracker) {
    this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
    this.hide();
  }

  /**
   * Update status bar with current story's daily word count
   */
  updateForStory(storyId: string): void {
    try {
      const netWords = this.tracker.getNetWordsForToday(storyId);

      if (netWords === 0) {
        this.hide();
        return;
      }

      // Format with sign: +150 or -50
      const sign = netWords > 0 ? '+' : '';
      const text = `${sign}${netWords}`;

      this.statusBarItem.text = `${text} words`;
      this.statusBarItem.tooltip = `Daily net words: ${text}\nSession started: ${this.tracker
        .getDailyStartTime()
        .toLocaleTimeString()}`;
      this.show();

      logger.debug(`Daily word count updated for ${storyId}: ${text}`);
    } catch (error) {
      logger.debug(`Error updating daily word count: ${error}`);
      this.hide();
    }
  }

  /**
   * Hide the status bar item
   */
  private hide(): void {
    this.statusBarItem.hide();
  }

  /**
   * Show the status bar item
   */
  private show(): void {
    this.statusBarItem.show();
  }

  /**
   * Dispose the status bar item
   */
  dispose(): void {
    this.statusBarItem.dispose();
    logger.debug('DailyWordCountStatusBar disposed');
  }
}
