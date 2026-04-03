/**
 * Daily Word Count Tracker
 * Tracks net words written today (added - deleted) with midnight reset
 */

import { WordCountRepository } from '../db/wordCountRepository';
import { Logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const logger = new Logger('DailyWordCountTracker');

export class DailyWordCountTracker {
  private accumulatedNetWords: Map<string, number> = new Map();
  private sessionStartTime: Date;
  private midnightTimer: NodeJS.Timeout | null = null;

  constructor(private wordCountRepository: WordCountRepository) {
    this.sessionStartTime = new Date();
    this.setupMidnightReset();
  }

  /**
   * Initialize tracker for a story
   * Restore today's accumulated count from database if it exists
   */
  async initialize(storyId: string): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Try to restore today's entry from database
      const todayEntry = this.wordCountRepository.findByStoryAndDate(storyId, today);

      if (todayEntry) {
        // Restore previous session's accumulated value
        this.accumulatedNetWords.set(storyId, todayEntry.wordCount ?? 0);
        logger.info(`Restored daily word count for ${storyId}: ${todayEntry.wordCount}`);
      } else {
        // First time today for this story
        this.accumulatedNetWords.set(storyId, 0);
      }
    } catch (error) {
      logger.debug(`Error initializing word count for ${storyId}: ${error}`);
      this.accumulatedNetWords.set(storyId, 0);
    }
  }

  /**
   * Update net words for a story
   * Called when file word count changes (delta = new - old)
   */
  updateNetWords(storyId: string, delta: number): void {
    const current = this.accumulatedNetWords.get(storyId) ?? 0;
    const updated = current + delta;
    this.accumulatedNetWords.set(storyId, updated);

    logger.debug(`Word count updated for ${storyId}: ${current} + ${delta} = ${updated}`);
  }

  /**
   * Get net words written today for a story
   */
  getNetWordsForToday(storyId: string): number {
    return this.accumulatedNetWords.get(storyId) ?? 0;
  }

  /**
   * Get when the current session started
   */
  getDailyStartTime(): Date {
    return new Date(this.sessionStartTime);
  }

  /**
   * Persist accumulated word counts to database
   * Called at day boundary or on extension deactivate
   */
  async persist(): Promise<void> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      for (const [storyId, netWords] of this.accumulatedNetWords.entries()) {
        if (netWords !== 0) {
          // Only persist non-zero values
          this.wordCountRepository.create({
            id: uuidv4(),
            storyId,
            date: today,
            wordCount: netWords,
          });
          logger.info(`Persisted daily word count for ${storyId}: ${netWords}`);
        }
      }
    } catch (error) {
      logger.debug(`Error persisting word counts: ${error}`);
      // Silently fail - don't crash extension on persistence error
    }
  }

  /**
   * Dispose tracker and cleanup
   */
  async dispose(): Promise<void> {
    if (this.midnightTimer) {
      clearTimeout(this.midnightTimer);
      this.midnightTimer = null;
    }

    // Persist before disposing
    await this.persist();
    this.accumulatedNetWords.clear();

    logger.info('DailyWordCountTracker disposed');
  }

  /**
   * Setup timer for midnight reset
   */
  private setupMidnightReset(): void {
    this.midnightTimer = setTimeout(
      () => this.resetForNewDay(),
      this.getMillisecondsUntilMidnight()
    );

    logger.debug(`Midnight reset scheduled for ${this.getNextMidnight()}`);
  }

  /**
   * Calculate milliseconds until next midnight
   */
  private getMillisecondsUntilMidnight(): number {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0);

    return tomorrow.getTime() - now.getTime();
  }

  /**
   * Get next midnight time
   */
  private getNextMidnight(): Date {
    const next = new Date();
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);
    return next;
  }

  /**
   * Reset for new day
   * Persist current values and clear accumulator
   */
  private async resetForNewDay(): Promise<void> {
    logger.info('Daily word count reset triggered (midnight)');

    // Persist yesterday's counts
    await this.persist();

    // Clear accumulator for new day
    this.accumulatedNetWords.clear();

    // Setup timer for next midnight
    this.setupMidnightReset();
  }
}
