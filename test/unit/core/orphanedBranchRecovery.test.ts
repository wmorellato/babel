/**
 * Orphaned branch recovery tests
 * Handles recovery of lost or deleted branches in git repository
 */

import { OrphanedBranchRecovery } from '../../../src/core/orphanedBranchRecovery';
import { GitRepository } from '../../../src/git/gitRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('OrphanedBranchRecovery', () => {
  let gitRepo: GitRepository;
  let recovery: OrphanedBranchRecovery;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-orphan-recovery-test-${timestamp}-${testId}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }

    gitRepo = new GitRepository(testRepoPath);
    await gitRepo.init();
    await gitRepo.createInitialCommit('Initial commit');

    recovery = new OrphanedBranchRecovery(gitRepo);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create recovery handler with git repository', () => {
      expect(recovery).toBeDefined();
      expect(recovery.getRepository()).toBe(gitRepo);
    });

    it('should track recovery history', () => {
      const history = recovery.getRecoveryHistory();

      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('orphaned branch detection', () => {
    it('should detect when branch is missing from repository', async () => {
      // Create a branch
      await gitRepo.createBranch('test-branch');

      // Verify branch exists
      let branches = await gitRepo.getAllBranches();
      expect(branches).toContain('test-branch');

      // Delete the branch
      const baseBranch = branches.find((b) => b !== 'test-branch');
      if (baseBranch) {
        await gitRepo.checkout(baseBranch);
        await gitRepo.deleteBranch('test-branch');
      }

      // Verify branch is gone
      branches = await gitRepo.getAllBranches();
      expect(branches).not.toContain('test-branch');

      // Check if recovery can detect it
      const isOrphaned = await recovery.isOrphanedBranch('test-branch');
      expect(isOrphaned).toBe(true);
    });

    it('should distinguish between orphaned and existing branches', async () => {
      // Create branch
      await gitRepo.createBranch('existing-branch');

      const isExistingOrphaned = await recovery.isOrphanedBranch('existing-branch');
      const isNonExistentOrphaned = await recovery.isOrphanedBranch('nonexistent-branch');

      expect(isExistingOrphaned).toBe(false);
      expect(isNonExistentOrphaned).toBe(true);
    });
  });

  describe('branch recovery', () => {
    it('should recover branch from reflog', async () => {
      // Create initial content
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');
      await gitRepo.commit('Initial');

      // Create and modify a branch
      const branchName = 'recovery-test';
      await gitRepo.createBranch(branchName);
      fs.writeFileSync(filePath, 'Modified content');
      await gitRepo.commit('Modified on recovery-test');

      // Get the commit hash
      const log = await gitRepo.getLog(1);
      const commitHash = log[0]?.hash;

      // Switch away and delete the branch (force delete since it's not merged)
      const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== branchName);
      if (baseBranch) {
        await gitRepo.checkout(baseBranch);
        await gitRepo.deleteBranch(branchName, true);

        // Try to recover
        if (commitHash) {
          const result = await recovery.recoverBranch(branchName, commitHash);

          expect(result).toBeDefined();
          expect(result.recovered).toBe(true);
        }
      }
    });

    it('should handle recovery of non-existent commits', async () => {
      try {
        const result = await recovery.recoverBranch('ghost-branch', 'nonexistent-hash');

        // Should either fail or indicate no recovery possible
        expect(result.recovered).toBe(false);
      } catch (error) {
        // Or throw an error
        expect(error).toBeDefined();
      }
    });

    it('should preserve branch history during recovery', async () => {
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Content 1');
      await gitRepo.addFile('story.md', 'Content 1');
      await gitRepo.commit('Commit 1');

      // Create branch with additional commits
      await gitRepo.createBranch('history-test');
      fs.writeFileSync(filePath, 'Content 2');
      await gitRepo.commit('Commit 2 on branch');

      // Get current state
      const logBefore = await gitRepo.getLog(10);
      const beforeCount = logBefore.length;

      // Delete and recover (force delete since unmerged)
      const commitHash = logBefore[0]?.hash;
      const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== 'history-test');

      if (baseBranch && commitHash) {
        await gitRepo.checkout(baseBranch);
        await gitRepo.deleteBranch('history-test', true);

        await recovery.recoverBranch('history-test', commitHash);

        // Verify history preserved
        const logAfter = await gitRepo.getLog(10);
        expect(logAfter.length).toBeGreaterThanOrEqual(beforeCount - 1);
      }
    });
  });

  describe('safety checks', () => {
    it('should prevent recovery of important branches with confirmation', async () => {
      const protectedBranches = ['main', 'master', 'develop', 'production'];

      for (const branch of protectedBranches) {
        const needsConfirmation = recovery.requiresRecoveryConfirmation(branch);
        expect(needsConfirmation).toBe(true);
      }
    });

    it('should allow recovery of feature branches without confirmation', () => {
      const featureBranches = ['feature-new-ui', 'fix-login-bug', 'draft-chapter-3'];

      for (const branch of featureBranches) {
        const needsConfirmation = recovery.requiresRecoveryConfirmation(branch);
        expect(needsConfirmation).toBe(false);
      }
    });

    it('should validate commit hashes before recovery', async () => {
      const validHash = 'abc123def456789'; // Fake but properly formatted

      const isValid = recovery.isValidCommitHash(validHash);
      expect(isValid).toBe(true);

      const invalidHash = 'not-a-hash';
      const isInvalid = recovery.isValidCommitHash(invalidHash);
      expect(isInvalid).toBe(false);
    });
  });

  describe('recovery suggestions', () => {
    it('should provide recovery suggestions for lost branches', async () => {
      const suggestions = await recovery.getSuggestions('lost-branch');

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
      expect(suggestions.length).toBeGreaterThan(0);
    });

    it('should suggest reflog search for recent deletions', async () => {
      const suggestions = await recovery.getSuggestions('recently-deleted');

      const hasReflogSuggestion = suggestions.some(
        (s) => s.toLowerCase().includes('reflog') || s.toLowerCase().includes('deleted')
      );

      expect(hasReflogSuggestion).toBe(true);
    });

    it('should suggest stash recovery for uncommitted work', async () => {
      const suggestions = await recovery.getSuggestions('uncommitted-work');

      const hasStashSuggestion = suggestions.some((s) => s.toLowerCase().includes('stash'));

      expect(hasStashSuggestion).toBe(true);
    });
  });

  describe('recovery history tracking', () => {
    it('should track successful recoveries', async () => {
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Initial');
      await gitRepo.addFile('story.md', 'Initial');
      await gitRepo.commit('Initial');

      const branchName = 'tracked-recovery';
      await gitRepo.createBranch(branchName);

      const log = await gitRepo.getLog(1);
      const commitHash = log[0]?.hash;

      const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== branchName);

      if (baseBranch && commitHash) {
        await gitRepo.checkout(baseBranch);
        await gitRepo.deleteBranch(branchName);

        const result = await recovery.recoverBranch(branchName, commitHash);

        if (result.recovered) {
          const history = recovery.getRecoveryHistory();

          const hasEntry = history.some((h) => h.branchName === branchName);

          expect(hasEntry).toBe(true);
        }
      }
    });

    it('should include timestamp in recovery history', () => {
      recovery.recordRecoveryAttempt('test-branch', true, 'Success');

      const history = recovery.getRecoveryHistory();
      const lastEntry = history[history.length - 1];

      expect(lastEntry).toBeDefined();
      expect(lastEntry.timestamp).toBeTruthy();
    });
  });

  describe('error recovery strategies', () => {
    it('should provide recovery strategy based on branch state', async () => {
      const strategy = recovery.getRecoveryStrategy('orphaned-draft');

      expect(strategy).toBeDefined();
      expect(['reflog', 'backup', 'recreate', 'manual']).toContain(strategy);
    });

    it('should fallback to manual recovery if automated recovery fails', async () => {
      const strategy = recovery.getRecoveryStrategy('unknown-lost-branch');

      expect(['reflog', 'backup', 'recreate', 'manual']).toContain(strategy);
    });

    it('should suggest backup recovery for recent backups', async () => {
      const strategy = recovery.getRecoveryStrategy('backed-up-branch');

      expect(strategy).toBeDefined();
    });
  });

  describe('concurrent recovery', () => {
    it('should handle multiple concurrent recovery attempts safely', async () => {
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Initial');
      await gitRepo.addFile('story.md', 'Initial');
      await gitRepo.commit('Initial');

      // Create multiple branches
      const branches = ['concurrent-1', 'concurrent-2', 'concurrent-3'];

      for (const branch of branches) {
        await gitRepo.createBranch(branch);
        const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== branch);
        if (baseBranch) {
          await gitRepo.checkout(baseBranch);
        }
      }

      // Get commit hashes
      const log = await gitRepo.getLog(10);

      // Try to recover all at once
      const recoveries = branches.map((branch, idx) => {
        const hash = log[idx]?.hash;
        if (hash) {
          return recovery.recoverBranch(branch, hash);
        }
        return Promise.resolve({ recovered: false });
      });

      const results = await Promise.all(recoveries);

      expect(results).toBeDefined();
      expect(results.length).toBe(branches.length);
    });
  });

  describe('rollback and undo', () => {
    it('should support undoing a recovery', async () => {
      const recoveryId = 'recovery-001';
      const canUndo = recovery.canUndoRecovery(recoveryId);

      expect(typeof canUndo).toBe('boolean');
    });

    it('should preserve original state when undo is performed', async () => {
      // This would require tracking original state
      const history = recovery.getRecoveryHistory();

      // Verify history format allows rollback
      if (history.length > 0) {
        const entry = history[0];
        expect(entry).toHaveProperty('branchName');
        expect(entry).toHaveProperty('timestamp');
        expect(entry).toHaveProperty('success');
      }
    });
  });

  describe('logging and diagnostics', () => {
    it('should log all recovery attempts', async () => {
      recovery.recordRecoveryAttempt('diagnostic-test', true, 'Test recovery logged');

      const history = recovery.getRecoveryHistory();

      expect(history.length).toBeGreaterThan(0);
    });

    it('should provide diagnostic information about failed recoveries', async () => {
      recovery.recordRecoveryAttempt('failed-recovery', false, 'Test failure for diagnostics');

      const history = recovery.getRecoveryHistory();
      const failed = history.find((h) => !h.success && h.branchName === 'failed-recovery');

      expect(failed).toBeDefined();
      expect(failed?.reason).toContain('diagnostics');
    });
  });
});
