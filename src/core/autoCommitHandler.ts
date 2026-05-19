/**
 * Auto-commit handler
 * Monitors file changes and triggers commits when word count threshold is exceeded
 */

import { GitRepository, CommitResult, CommitMetadata } from '../git/gitRepository';
import { Logger } from '../utils/logger';
import { countWords } from '../utils/wordCounter';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';

const logger = new Logger('AutoCommitHandler');

export interface AutoCommitConfig {
  wordCountThreshold?: number;
  autoCommitEnabled?: boolean;
  debounceMs?: number;
}

export interface CommitHistoryEntry {
  timestamp: number;
  wordCount: number;
  wordDelta: number;
  message: string;
  committed: boolean;
}

/**
 * Callback invoked when a file changes and word count is updated
 */
export type OnFileChangedCallback = (storyId: string, newWordCount: number) => Promise<void>;

/**
 * Handles automatic commits when story content changes
 * Tracks word count and triggers commits based on configurable thresholds
 */
export class AutoCommitHandler {
  private git: GitRepository;
  private config: Required<AutoCommitConfig>;
  private currentWordCount: number = 0;
  private lastCommitHash: string | null = null;
  private lastCommitTime: number = 0;
  private commitCount: number = 0;
  private commitHistory: CommitHistoryEntry[] = [];
  private watching: boolean = false;
  private paused: boolean = false;
  private watchTimers: Map<string, NodeJS.Timeout> = new Map();
  private onFileChanged?: OnFileChangedCallback;
  private storyId?: string;
  private fsWatcher: fsSync.FSWatcher | null = null;

  constructor(
    gitRepository: GitRepository,
    config?: AutoCommitConfig,
    storyId?: string,
    onFileChanged?: OnFileChangedCallback
  ) {
    this.git = gitRepository;
    this.config = {
      wordCountThreshold: config?.wordCountThreshold ?? 100,
      autoCommitEnabled: config?.autoCommitEnabled ?? true,
      debounceMs: config?.debounceMs ?? 1000,
    };
    this.storyId = storyId;
    this.onFileChanged = onFileChanged;
  }

  /**
   * Get the git repository instance
   */
  getRepository(): GitRepository {
    return this.git;
  }

  /**
   * Set the file changed callback and story ID
   */
  setFileChangedCallback(storyId: string, callback: OnFileChangedCallback): void {
    this.storyId = storyId;
    this.onFileChanged = callback;
  }

  /**
   * Get current configuration
   */
  getConfig(): Required<AutoCommitConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: AutoCommitConfig): void {
    if (newConfig.wordCountThreshold !== undefined) {
      this.config.wordCountThreshold = newConfig.wordCountThreshold;
    }
    if (newConfig.autoCommitEnabled !== undefined) {
      this.config.autoCommitEnabled = newConfig.autoCommitEnabled;
    }
    if (newConfig.debounceMs !== undefined) {
      this.config.debounceMs = newConfig.debounceMs;
    }
    logger.debug('Auto-commit config updated', this.config);
  }

  /**
   * Start watching a directory for changes
   */
  async watch(directoryPath: string): Promise<void> {
    // Verify directory exists
    try {
      await fs.access(directoryPath);
    } catch {
      throw new Error(`Directory does not exist: ${directoryPath}`);
    }

    this.watching = true;
    logger.info(`Started watching directory: ${directoryPath}`);

    // Set up file system watcher
    if (fsSync.existsSync(directoryPath)) {
      this.fsWatcher = fsSync.watch(directoryPath, { recursive: true }, (eventType, filename) => {
        if (this.paused || !this.config.autoCommitEnabled) {
          return;
        }

        if (filename && filename.endsWith('.md')) {
          this.handleFileChange(path.join(directoryPath, filename as string));
        }
      });
    }
  }

  /**
   * Stop watching directory
   */
  stopWatching(): void {
    this.watching = false;
    if (this.fsWatcher) {
      this.fsWatcher.close();
      this.fsWatcher = null;
    }
    this.watchTimers.forEach((timer) => clearTimeout(timer));
    this.watchTimers.clear();
    logger.info('Stopped watching directory');
  }

  /**
   * Check if currently watching
   */
  isWatching(): boolean {
    return this.watching;
  }

  /**
   * Handle file change with debounce
   */
  private async handleFileChange(filePath: string): Promise<void> {
    // Clear existing timer if any
    if (this.watchTimers.has(filePath)) {
      clearTimeout(this.watchTimers.get(filePath));
    }

    // Set debounce timer
    const timer = setTimeout(async () => {
      try {
        const content = await fs.readFile(filePath, 'utf-8');
        const wordCount = countWords(content);

        // Invoke callback to update word count in database
        if (this.onFileChanged && this.storyId) {
          try {
            await this.onFileChanged(this.storyId, wordCount);
          } catch (error) {
            logger.debug(`Error invoking file changed callback: ${error}`);
          }
        }

        if (this.shouldCommit(wordCount)) {
          const delta = this.calculateWordDelta(wordCount);
          await this.triggerCommit(wordCount, 'Auto-save', {
            wordCount,
            wordDelta: delta,
          });
        }
      } catch (error) {
        logger.debug(`Error handling file change: ${error}`);
      }
      this.watchTimers.delete(filePath);
    }, this.config.debounceMs);

    this.watchTimers.set(filePath, timer);
  }

  /**
   * Set current word count
   */
  setWordCount(count: number): void {
    this.currentWordCount = count;
  }

  /**
   * Get current word count
   */
  getWordCount(): number {
    return this.currentWordCount;
  }

  /**
   * Calculate word delta from current to new count
   */
  calculateWordDelta(newWordCount: number): number {
    return newWordCount - this.currentWordCount;
  }

  /**
   * Reset word count after commit
   */
  resetWordCount(newWordCount: number): void {
    this.currentWordCount = newWordCount;
  }

  /**
   * Check if commit should be triggered based on word count
   */
  shouldCommit(wordCount: number): boolean {
    if (!this.config.autoCommitEnabled) {
      return false;
    }

    const delta = this.calculateWordDelta(wordCount);

    // If threshold is 0, commit on any change
    if (this.config.wordCountThreshold === 0) {
      return delta !== 0;
    }

    // Commit if delta exceeds threshold
    return Math.abs(delta) >= this.config.wordCountThreshold;
  }

  /**
   * Trigger a commit with optional metadata
   */
  async triggerCommit(wordCount: number, message: string, metadata?: CommitMetadata): Promise<CommitResult> {
    if (this.paused) {
      return {
        committed: false,
        message: '',
        reason: 'auto-commit paused',
      };
    }

    try {
      const delta = this.calculateWordDelta(wordCount);

      const result = await this.git.commit(message, {
        wordCount,
        wordDelta: delta,
      });

      if (result.committed) {
        this.commitCount++;
        this.lastCommitTime = Date.now();
        this.resetWordCount(wordCount);

        const historyEntry: CommitHistoryEntry = {
          timestamp: this.lastCommitTime,
          wordCount,
          wordDelta: delta,
          message,
          committed: true,
        };

        this.commitHistory.push(historyEntry);

        logger.info(`Auto-commit triggered: ${message}`, {
          wordCount,
          wordDelta: delta,
        });
      }

      return result;
    } catch (error) {
      logger.debug(`Error triggering commit: ${error}`);
      throw error;
    }
  }

  /**
   * Set last commit hash
   */
  setLastCommitHash(hash: string): void {
    this.lastCommitHash = hash;
  }

  /**
   * Get last commit hash
   */
  getLastCommitHash(): string | null {
    return this.lastCommitHash;
  }

  /**
   * Set last commit timestamp
   */
  setLastCommitTime(timestamp: number): void {
    this.lastCommitTime = timestamp;
  }

  /**
   * Get last commit timestamp
   */
  getLastCommitTime(): number {
    return this.lastCommitTime;
  }

  /**
   * Get total commits in this session
   */
  getCommitCount(): number {
    return this.commitCount;
  }

  /**
   * Get commit history
   */
  getCommitHistory(): CommitHistoryEntry[] {
    return [...this.commitHistory];
  }

  /**
   * Pause auto-commit
   */
  pause(): void {
    this.paused = true;
    logger.debug('Auto-commit paused');
  }

  /**
   * Resume auto-commit
   */
  resume(): void {
    this.paused = false;
    logger.debug('Auto-commit resumed');
  }

  /**
   * Check if paused
   */
  isPaused(): boolean {
    return this.paused;
  }
}
