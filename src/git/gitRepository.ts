/**
 * Git Repository abstraction layer
 * Wraps simple-git for story versioning
 */

import simpleGit, { SimpleGit, GitError as SimpleGitError } from 'simple-git';
import { Logger } from '../utils/logger';
import { GitError } from '../utils/errorHandler';

const logger = new Logger('GitRepository');

export interface InitResult {
  initialized: boolean;
  path: string;
}

export interface BranchResult {
  branch: string;
  created?: boolean;
  switched?: boolean;
  deleted?: boolean;
}

export interface CommitResult {
  committed: boolean;
  message: string;
  reason?: string;
}

export interface CommitMetadata {
  wordCount: number;
  wordDelta: number;
}

export interface FileResult {
  added: boolean;
  file: string;
}

export interface RepositoryStatus {
  branch: string;
  staged: string[];
  unstaged: string[];
  untracked: string[];
}

export interface MergeConflictResult {
  hasConflicts: boolean;
  conflictedFiles?: string[];
}

export interface LogEntry {
  hash: string;
  message: string;
  author: string;
  date: Date;
}

export class GitRepository {
  private git: SimpleGit;
  private path: string;
  private initialized: boolean = false;

  constructor(path: string) {
    this.path = path;
    this.git = simpleGit(path);
  }

  async init(): Promise<InitResult> {
    try {
      // Check if already initialized
      try {
        await this.git.revparse(['--git-dir']);
        this.initialized = true;
        logger.debug(`Repository already initialized: ${this.path}`);
        return { initialized: true, path: this.path };
      } catch {
        // Not initialized, proceed with init
      }

      await this.git.init();
      this.initialized = true;

      // Set default git config for commits
      await this.git.addConfig('user.email', 'babel@example.com');
      await this.git.addConfig('user.name', 'Babel Extension');

      // Create initial empty commit
      logger.info(`Repository initialized: ${this.path}`);
      return { initialized: true, path: this.path };
    } catch (error) {
      throw new GitError(`Failed to initialize git repository: ${error}`);
    }
  }

  async createInitialCommit(message: string): Promise<CommitResult> {
    try {
      // Add all files
      await this.git.add('.');

      const result = await this.git.commit(message, { '--allow-empty': null });

      logger.info(`Initial commit created: ${message}`);
      return {
        committed: true,
        message: result.commit,
      };
    } catch (error) {
      throw new GitError(`Failed to create initial commit: ${error}`);
    }
  }

  async createBranch(branchName: string): Promise<BranchResult> {
    try {
      await this.git.checkoutLocalBranch(branchName);

      logger.info(`Branch created: ${branchName}`);
      return {
        branch: branchName,
        created: true,
      };
    } catch (error) {
      throw new GitError(`Failed to create branch ${branchName}: ${error}`);
    }
  }

  async checkout(branchName: string): Promise<BranchResult> {
    try {
      await this.git.checkout(branchName);

      logger.info(`Checked out branch: ${branchName}`);
      return {
        branch: branchName,
        switched: true,
      };
    } catch (error) {
      throw new GitError(`Failed to checkout branch ${branchName}: ${error}`);
    }
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const branches = await this.git.branch();
      const current = branches.current;

      if (!current) {
        throw new GitError('Unable to determine current branch (detached HEAD)');
      }

      return current;
    } catch (error) {
      throw new GitError(`Failed to get current branch: ${error}`);
    }
  }

  async getAllBranches(): Promise<string[]> {
    try {
      const branches = await this.git.branch();

      return branches.all;
    } catch (error) {
      throw new GitError(`Failed to list branches: ${error}`);
    }
  }

  async deleteBranch(branchName: string, force: boolean = false): Promise<BranchResult> {
    try {
      const current = await this.getCurrentBranch();

      if (current === branchName) {
        throw new GitError(`Cannot delete current branch: ${branchName}`);
      }

      if (force) {
        // Force delete unmerged branch using -D flag
        await this.git.branch(['-D', branchName]);
      } else {
        // Normal delete (requires branch to be merged)
        await this.git.deleteLocalBranch(branchName);
      }

      logger.info(`Branch deleted: ${branchName}${force ? ' (forced)' : ''}`);
      return {
        branch: branchName,
        deleted: true,
      };
    } catch (error) {
      throw new GitError(`Failed to delete branch ${branchName}: ${error}`);
    }
  }

  async addFile(filePath: string, content: string): Promise<FileResult> {
    try {
      // Import fs at the top of the method since we need it here
      const fs = await import('fs/promises');
      const path = await import('path');

      // Write file to disk
      const fullPath = path.join(this.path, filePath);
      const dir = path.dirname(fullPath);

      // Create directory if needed
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(fullPath, content);

      // Stage the file
      await this.git.add(filePath);

      logger.debug(`File added: ${filePath}`);
      return {
        added: true,
        file: filePath,
      };
    } catch (error) {
      throw new GitError(`Failed to add file ${filePath}: ${error}`);
    }
  }

  async commit(message: string, metadata?: CommitMetadata): Promise<CommitResult> {
    try {
      // Check if there are changes to commit
      const status = await this.git.status();

      if (status.staged.length === 0 && status.files.length === 0) {
        return {
          committed: false,
          message: '',
          reason: 'nothing to commit',
        };
      }

      // Add metadata to commit message
      let fullMessage = message;
      if (metadata) {
        fullMessage += `\n\nWord count: ${metadata.wordCount} words (${metadata.wordDelta > 0 ? '+' : ''}${metadata.wordDelta})`;
      }

      await this.git.add('.');
      const result = await this.git.commit(fullMessage);

      logger.info(`Commit created: ${message}`, metadata || {});
      return {
        committed: true,
        message: result.commit || message,
      };
    } catch (error) {
      const errorMsg = `${error}`;
      if (errorMsg.includes('nothing to commit')) {
        return {
          committed: false,
          message: '',
          reason: 'nothing to commit',
        };
      }
      throw new GitError(`Failed to commit: ${error}`);
    }
  }

  async getStatus(): Promise<RepositoryStatus> {
    try {
      const status = await this.git.status();

      return {
        branch: status.current || 'detached',
        staged: status.staged,
        unstaged: status.modified,
        untracked: status.not_added,
      };
    } catch (error) {
      throw new GitError(`Failed to get repository status: ${error}`);
    }
  }

  async detectMergeConflicts(branchName: string): Promise<MergeConflictResult> {
    try {
      const current = await this.getCurrentBranch();

      // Attempt a dry-run merge to detect conflicts
      try {
        await this.git.merge([branchName, '--no-commit', '--no-ff']);
        // Merge succeeded, no conflicts - abort the merge
        try {
          await this.git.merge(['--abort']);
        } catch {
          // Ignore abort errors - merge may have completed
        }
        return { hasConflicts: false };
      } catch (error) {
        // Check if error is due to merge conflict
        const status = await this.git.status();

        if (status.conflicted.length > 0) {
          // Abort the merge
          try {
            await this.git.merge(['--abort']);
          } catch {
            // Already aborted or not in merge state
          }

          return {
            hasConflicts: true,
            conflictedFiles: status.conflicted,
          };
        }

        // Merge failed for a different reason - abort and throw
        try {
          await this.git.merge(['--abort']);
        } catch {
          // Ignore abort errors
        }

        throw error;
      }
    } catch (error) {
      throw new GitError(`Failed to detect merge conflicts: ${error}`);
    }
  }

  async getLog(maxEntries: number = 10): Promise<LogEntry[]> {
    try {
      const log = await this.git.log({ maxCount: maxEntries });

      return log.all.map((entry) => ({
        hash: entry.hash || '',
        message: entry.message,
        author: entry.author_name || 'Unknown',
        date: new Date(),
      }));
    } catch (error) {
      throw new GitError(`Failed to retrieve commit log: ${error}`);
    }
  }

  async getCommitCount(): Promise<number> {
    try {
      const log = await this.git.log();
      return log.total;
    } catch (error) {
      throw new GitError(`Failed to get commit count: ${error}`);
    }
  }

  getPath(): string {
    return this.path;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}
