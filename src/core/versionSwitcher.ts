/**
 * Version switcher
 * Handles switching between story versions (branches) with conflict detection
 */

import {
  GitRepository,
  BranchResult,
  MergeConflictResult,
  RepositoryStatus,
  LogEntry,
} from '../git/gitRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('VersionSwitcher');

export interface SwitchResult {
  switched: boolean;
  version: string;
  conflicts?: string[];
  message?: string;
}

export interface ConflictDetectionResult {
  hasConflicts: boolean;
  conflictedFiles?: string[];
  message?: string;
}

export interface SwitchStatus {
  currentVersion: string;
  availableVersions: string[];
  lastSwitchedVersion: string | null;
  hasUncommittedChanges: boolean;
}

/**
 * Handles version switching between git branches with conflict detection
 */
export class VersionSwitcher {
  private git: GitRepository;
  private lastSwitchedVersion: string | null = null;
  private lastSwitchTime: number = 0;

  constructor(gitRepository: GitRepository) {
    this.git = gitRepository;
  }

  /**
   * Get the git repository instance
   */
  getRepository(): GitRepository {
    return this.git;
  }

  /**
   * Get current version (branch)
   */
  async getCurrentVersion(): Promise<string> {
    try {
      return await this.git.getCurrentBranch();
    } catch (error) {
      logger.error(`Failed to get current version: ${error}`);
      throw error;
    }
  }

  /**
   * Switch to a different version with conflict detection
   */
  async switchToVersion(versionName: string): Promise<SwitchResult> {
    try {
      const currentVersion = await this.getCurrentVersion();

      // If already on this version, no need to switch
      if (currentVersion === versionName) {
        logger.debug(`Already on version: ${versionName}`);
        return {
          switched: true,
          version: versionName,
          message: 'Already on this version',
        };
      }

      // Check for conflicts
      const conflicts = await this.detectConflicts(versionName);

      if (conflicts.hasConflicts) {
        logger.warn(`Conflicts detected when switching to ${versionName}`, {
          conflictedFiles: conflicts.conflictedFiles,
        });
        return {
          switched: false,
          version: versionName,
          conflicts: conflicts.conflictedFiles,
          message: 'Merge conflicts detected. Please resolve conflicts manually.',
        };
      }

      // Perform the switch
      const result = await this.git.checkout(versionName);

      if (result.switched) {
        this.lastSwitchedVersion = currentVersion;
        this.lastSwitchTime = Date.now();
        logger.info(`Switched to version: ${versionName}`);
      }

      return {
        switched: result.switched || false,
        version: versionName,
      };
    } catch (error) {
      logger.error(`Failed to switch to version ${versionName}: ${error}`);
      throw error;
    }
  }

  /**
   * Detect merge conflicts between current and target version
   */
  async detectConflicts(targetVersion: string): Promise<ConflictDetectionResult> {
    try {
      const result = await this.git.detectMergeConflicts(targetVersion);

      return {
        hasConflicts: result.hasConflicts,
        conflictedFiles: result.conflictedFiles,
        message: result.hasConflicts ? 'Merge conflicts detected' : 'No conflicts detected',
      };
    } catch (error) {
      logger.error(`Failed to detect conflicts with ${targetVersion}: ${error}`);
      throw error;
    }
  }

  /**
   * List all available versions
   */
  async listVersions(): Promise<string[]> {
    try {
      return await this.git.getAllBranches();
    } catch (error) {
      logger.error(`Failed to list versions: ${error}`);
      throw error;
    }
  }

  /**
   * Get version history (commit log)
   */
  async getVersionHistory(versionName?: string): Promise<LogEntry[]> {
    try {
      // If version specified, switch to it temporarily
      if (versionName) {
        const currentVersion = await this.getCurrentVersion();

        // Only switch if different
        if (versionName !== currentVersion) {
          await this.git.checkout(versionName);
        }

        const history = await this.git.getLog();

        // Switch back to original
        if (versionName !== currentVersion) {
          await this.git.checkout(currentVersion);
        }

        return history;
      }

      return await this.git.getLog();
    } catch (error) {
      logger.error(`Failed to get version history: ${error}`);
      throw error;
    }
  }

  /**
   * Get current switch status
   */
  async getSwitchStatus(): Promise<SwitchStatus> {
    try {
      const currentVersion = await this.getCurrentVersion();
      const availableVersions = await this.listVersions();
      const status = await this.git.getStatus();

      return {
        currentVersion,
        availableVersions,
        lastSwitchedVersion: this.lastSwitchedVersion,
        hasUncommittedChanges: status.unstaged.length > 0 || status.untracked.length > 0,
      };
    } catch (error) {
      logger.error(`Failed to get switch status: ${error}`);
      throw error;
    }
  }

  /**
   * Get last switched version
   */
  getLastSwitchedVersion(): string | null {
    return this.lastSwitchedVersion;
  }

  /**
   * Get last switch timestamp
   */
  getLastSwitchTime(): number {
    return this.lastSwitchTime;
  }

  /**
   * Get conflict resolution suggestions
   */
  async getConflictResolutionSuggestions(
    sourceBranch: string,
    targetBranch: string
  ): Promise<string[]> {
    const suggestions: string[] = [
      'Review conflicted files to understand changes from both branches',
      'Decide which changes to keep for each conflicted section',
      'Use git mergetool for interactive conflict resolution',
      'Consider rebasing instead of merging if history is important',
      'Communicate with team members about conflicting changes',
    ];

    logger.debug(`Generating conflict resolution suggestions for ${sourceBranch} vs ${targetBranch}`);

    return suggestions;
  }
}
