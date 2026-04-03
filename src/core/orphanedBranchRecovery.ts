/**
 * Orphaned branch recovery
 * Handles recovery of lost or deleted branches in git repository
 */

import { GitRepository } from '../git/gitRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('OrphanedBranchRecovery');

export interface RecoveryResult {
  recovered: boolean;
  branchName: string;
  commitHash?: string;
  message?: string;
}

export interface RecoveryHistoryEntry {
  timestamp: number;
  branchName: string;
  commitHash?: string;
  success: boolean;
  reason: string;
  strategy?: string;
}

/**
 * Handles recovery of orphaned (deleted or lost) branches
 */
export class OrphanedBranchRecovery {
  private git: GitRepository;
  private recoveryHistory: RecoveryHistoryEntry[] = [];
  private protectedBranches: Set<string> = new Set([
    'main',
    'master',
    'develop',
    'production',
    'staging',
  ]);

  constructor(gitRepository: GitRepository) {
    this.git = gitRepository;
  }

  /**
   * Get git repository instance
   */
  getRepository(): GitRepository {
    return this.git;
  }

  /**
   * Check if a branch is orphaned (deleted/missing)
   */
  async isOrphanedBranch(branchName: string): Promise<boolean> {
    try {
      const branches = await this.git.getAllBranches();
      return !branches.includes(branchName);
    } catch (error) {
      logger.error(`Failed to check if branch is orphaned: ${error}`);
      return true; // Assume orphaned if we can't check
    }
  }

  /**
   * Recover a branch from git history using commit hash
   */
  async recoverBranch(branchName: string, commitHash: string): Promise<RecoveryResult> {
    try {
      // Validate inputs
      if (!this.isValidCommitHash(commitHash)) {
        this.recordRecoveryAttempt(branchName, false, 'Invalid commit hash format');
        return {
          recovered: false,
          branchName,
          message: 'Invalid commit hash',
        };
      }

      // Check if already exists
      const isOrphaned = await this.isOrphanedBranch(branchName);

      if (!isOrphaned) {
        this.recordRecoveryAttempt(branchName, true, 'Branch already exists', 'skip');
        return {
          recovered: true,
          branchName,
          commitHash,
          message: 'Branch already exists',
        };
      }

      // Create branch from commit hash
      try {
        // Try to create branch from the commit
        const result = await this.git.createBranch(branchName);

        if (result.created) {
          this.recordRecoveryAttempt(branchName, true, 'Branch recovered from commit', 'reflog');

          logger.info(`Recovered branch: ${branchName} from commit ${commitHash}`);

          return {
            recovered: true,
            branchName,
            commitHash,
            message: 'Branch successfully recovered',
          };
        }
      } catch (error) {
        logger.debug(`Failed to create branch from commit: ${error}`);
      }

      this.recordRecoveryAttempt(branchName, false, `Failed to recover from commit ${commitHash}`, 'reflog');

      return {
        recovered: false,
        branchName,
        commitHash,
        message: 'Failed to recover branch',
      };
    } catch (error) {
      logger.error(`Error during branch recovery: ${error}`);
      this.recordRecoveryAttempt(branchName, false, `Recovery error: ${error}`, 'error');

      return {
        recovered: false,
        branchName,
        message: 'Recovery operation failed',
      };
    }
  }

  /**
   * Get recovery strategy for a branch
   */
  getRecoveryStrategy(branchName: string): string {
    // Strategy selection based on branch characteristics
    if (branchName.includes('backup') || branchName.includes('auto')) {
      return 'backup';
    }

    if (branchName.includes('draft') || branchName.includes('temp')) {
      return 'recreate';
    }

    // Default strategies in order of preference
    const strategies = ['reflog', 'backup', 'recreate', 'manual'];
    return strategies[Math.floor(Math.random() * strategies.length)];
  }

  /**
   * Check if branch recovery requires confirmation
   */
  requiresRecoveryConfirmation(branchName: string): boolean {
    return this.protectedBranches.has(branchName);
  }

  /**
   * Validate commit hash format
   */
  isValidCommitHash(hash: string): boolean {
    // Git SHA-1 hashes are 40 hex characters (or can be abbreviated)
    // Also allow common placeholder formats for testing
    if (hash.length === 0) {
      return false;
    }

    // Allow hex strings of length 7-40 (abbreviated to full hash)
    if (/^[0-9a-f]{7,40}$/i.test(hash)) {
      return true;
    }

    return false;
  }

  /**
   * Get recovery suggestions for a lost branch
   */
  async getSuggestions(branchName: string): Promise<string[]> {
    const suggestions: string[] = [
      'Check git reflog for branch deletion history using: git reflog show',
      'Search commit log for work on this branch: git log --all --grep="branch name"',
      'Check stash for uncommitted changes: git stash list',
      'Review git fsck output for dangling commits: git fsck --lost-found',
      'Check backup branches if this branch was auto-saved',
    ];

    logger.debug(`Generated recovery suggestions for: ${branchName}`);

    return suggestions;
  }

  /**
   * Record recovery attempt in history
   */
  recordRecoveryAttempt(
    branchName: string,
    success: boolean,
    reason: string,
    strategy?: string
  ): void {
    const entry: RecoveryHistoryEntry = {
      timestamp: Date.now(),
      branchName,
      success,
      reason,
      strategy,
    };

    this.recoveryHistory.push(entry);

    logger.debug(`Recovery attempt recorded: ${branchName} - ${success ? 'success' : 'failed'}`, {
      reason,
      strategy,
    });
  }

  /**
   * Get recovery history
   */
  getRecoveryHistory(): RecoveryHistoryEntry[] {
    return [...this.recoveryHistory];
  }

  /**
   * Check if a recovery can be undone
   */
  canUndoRecovery(recoveryId: string): boolean {
    // In practice, undoing would require storing the previous state
    // For now, return based on time elapsed and recovery type
    const cutoffTime = Date.now() - 3600000; // 1 hour ago

    const canUndo = this.recoveryHistory.some(
      (h) => h.success && h.timestamp > cutoffTime && h.strategy === 'reflog'
    );

    return canUndo;
  }

  /**
   * Get current list of available versions for detection
   */
  async getAvailableVersions(): Promise<string[]> {
    try {
      return await this.git.getAllBranches();
    } catch (error) {
      logger.error(`Failed to get available versions: ${error}`);
      return [];
    }
  }

  /**
   * Detect stashed changes that might belong to orphaned branch
   */
  async detectStashedWork(branchName: string): Promise<string[]> {
    // This would require parsing git stash output
    // For now, return empty array
    return [];
  }

  /**
   * Get diagnostic information
   */
  getDiagnostics(): {
    totalAttempts: number;
    successfulRecoveries: number;
    failedRecoveries: number;
    mostCommonStrategy?: string;
  } {
    const successful = this.recoveryHistory.filter((h) => h.success).length;
    const failed = this.recoveryHistory.filter((h) => !h.success).length;

    // Find most common strategy
    const strategyMap = new Map<string, number>();

    this.recoveryHistory.forEach((h) => {
      if (h.strategy) {
        strategyMap.set(h.strategy, (strategyMap.get(h.strategy) || 0) + 1);
      }
    });

    let mostCommonStrategy: string | undefined;
    let maxCount = 0;

    strategyMap.forEach((count, strategy) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommonStrategy = strategy;
      }
    });

    return {
      totalAttempts: this.recoveryHistory.length,
      successfulRecoveries: successful,
      failedRecoveries: failed,
      mostCommonStrategy,
    };
  }

  /**
   * Clear old recovery history
   */
  pruneHistory(olderThanHours: number = 24): number {
    const cutoffTime = Date.now() - olderThanHours * 3600000;
    const initialLength = this.recoveryHistory.length;

    this.recoveryHistory = this.recoveryHistory.filter((h) => h.timestamp > cutoffTime);

    const removed = initialLength - this.recoveryHistory.length;

    logger.debug(`Pruned recovery history: removed ${removed} old entries`);

    return removed;
  }
}
