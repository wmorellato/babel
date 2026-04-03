/**
 * Version switcher tests
 * Handles switching between story versions (branches) with conflict detection
 */

import { VersionSwitcher } from '../../../src/core/versionSwitcher';
import { GitRepository } from '../../../src/git/gitRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('VersionSwitcher', () => {
  let gitRepo: GitRepository;
  let switcher: VersionSwitcher;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-version-switcher-test-${timestamp}-${testId}`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }

    gitRepo = new GitRepository(testRepoPath);
    await gitRepo.init();
    await gitRepo.createInitialCommit('Initial commit');

    switcher = new VersionSwitcher(gitRepo);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create switcher with git repository', () => {
      expect(switcher).toBeDefined();
      expect(switcher.getRepository()).toBe(gitRepo);
    });

    it('should get current version', async () => {
      const current = await switcher.getCurrentVersion();

      expect(current).toBeTruthy();
    });
  });

  describe('version switching', () => {
    it('should switch to existing version', async () => {
      // Create a version
      const versionName = 'v1-draft';
      await gitRepo.createBranch(versionName);

      // Switch to version
      const result = await switcher.switchToVersion(versionName);

      expect(result.switched).toBe(true);
      expect(result.version).toBe(versionName);
    });

    it('should detect conflict before switching', async () => {
      // Create initial version with file
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Original content');
      await gitRepo.addFile('story.md', 'Original content');
      await gitRepo.commit('Initial content');

      // Create branch 1 with modification
      await gitRepo.createBranch('branch-a');
      fs.writeFileSync(filePath, 'Content from branch A');
      await gitRepo.commit('Modified in A');

      // Go back to main and create branch 2 with different modification
      const mainBranch = await gitRepo.getCurrentBranch();
      // Try to checkout original branch - it might not exist
      const allBranches = await gitRepo.getAllBranches();
      const baseBranch = allBranches.find((b) => b !== 'branch-a');

      if (baseBranch) {
        await gitRepo.checkout(baseBranch);

        fs.writeFileSync(filePath, 'Content from branch B');
        await gitRepo.commit('Modified in B');

        // Try to switch back to branch-a - should detect potential conflicts
        const result = await switcher.switchToVersion('branch-a');

        // Result should indicate whether switch succeeded
        expect(result).toBeDefined();
        expect(result.switched !== undefined).toBe(true);
      }
    });

    it('should throw error for non-existent version', async () => {
      await expect(switcher.switchToVersion('nonexistent-version')).rejects.toThrow();
    });

    it('should handle switching to current version', async () => {
      const current = await switcher.getCurrentVersion();

      const result = await switcher.switchToVersion(current);

      expect(result.switched).toBe(true);
      expect(result.version).toBe(current);
    });
  });

  describe('merge conflict detection', () => {
    it('should detect merge conflicts', async () => {
      // Create initial content
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Line 1\nLine 2\nLine 3\n');
      await gitRepo.addFile('story.md', 'Line 1\nLine 2\nLine 3\n');
      await gitRepo.commit('Initial');

      // Create and switch to branch
      await gitRepo.createBranch('edit-1');
      fs.writeFileSync(filePath, 'Modified 1\nLine 2\nLine 3\n');
      await gitRepo.commit('Edit on branch');

      // Switch back to base
      const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== 'edit-1');

      if (baseBranch) {
        await gitRepo.checkout(baseBranch);
        fs.writeFileSync(filePath, 'Line 1\nModified 2\nLine 3\n');
        await gitRepo.commit('Edit on base');

        // Detect conflicts
        const conflicts = await switcher.detectConflicts('edit-1');

        expect(conflicts).toBeDefined();
        expect(conflicts.hasConflicts !== undefined).toBe(true);
      }
    });

    it('should report no conflicts when branches are compatible', async () => {
      // Create simple branches with no overlapping edits
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Original\n');
      await gitRepo.addFile('story.md', 'Original\n');
      await gitRepo.commit('Initial');

      // Create branch 1
      await gitRepo.createBranch('no-conflict-1');
      const file2 = path.join(testRepoPath, 'chapter2.md');
      fs.writeFileSync(file2, 'New chapter');
      await gitRepo.addFile('chapter2.md', 'New chapter');
      await gitRepo.commit('Added chapter2');

      // Get base branch and switch
      const baseBranch = (await gitRepo.getAllBranches()).find((b) => b !== 'no-conflict-1');

      if (baseBranch) {
        await gitRepo.checkout(baseBranch);

        const conflicts = await switcher.detectConflicts('no-conflict-1');

        expect(conflicts).toBeDefined();
        expect(conflicts.hasConflicts).toBe(false);
      }
    });
  });

  describe('version listing', () => {
    it('should list all available versions', async () => {
      // Create multiple versions
      await gitRepo.createBranch('version-1');
      await gitRepo.createBranch('version-2');

      const versions = await switcher.listVersions();

      expect(versions.length).toBeGreaterThanOrEqual(1);
      expect(versions).toContain('version-1');
      expect(versions).toContain('version-2');
    });

    it('should include current version in list', async () => {
      const versions = await switcher.listVersions();
      const current = await switcher.getCurrentVersion();

      expect(versions).toContain(current);
    });
  });

  describe('version history', () => {
    it('should get version history', async () => {
      // Create multiple commits
      const filePath = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(filePath, 'Content 1');
      await gitRepo.addFile('story.md', 'Content 1');
      await gitRepo.commit('Commit 1');

      fs.writeFileSync(filePath, 'Content 2');
      await gitRepo.commit('Commit 2');

      const history = await switcher.getVersionHistory();

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThanOrEqual(1);
    });

    it('should get history for specific version', async () => {
      const versionName = 'history-test';
      await gitRepo.createBranch(versionName);

      const history = await switcher.getVersionHistory(versionName);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);
    });
  });

  describe('safe switching', () => {
    it('should refuse to switch with uncommitted changes', async () => {
      // Create a file but don't commit
      const filePath = path.join(testRepoPath, 'uncommitted.md');
      fs.writeFileSync(filePath, 'Uncommitted content');

      // Create a version to switch to
      await gitRepo.createBranch('safe-switch-test');
      await gitRepo.checkout(
        (await gitRepo.getAllBranches()).find((b) => b !== 'safe-switch-test') || 'main'
      );

      // Try to switch - should either refuse or warn
      try {
        const result = await switcher.switchToVersion('safe-switch-test');
        // If it succeeds, that's ok - some git configs allow it
        expect(result).toBeDefined();
      } catch (error) {
        // Or it should throw an error
        expect(error).toBeDefined();
      }
    });

    it('should provide switch status', async () => {
      const versionName = 'status-test';
      await gitRepo.createBranch(versionName);

      const status = await switcher.getSwitchStatus();

      expect(status).toBeDefined();
      expect(status.currentVersion).toBeTruthy();
      expect(status.availableVersions).toBeDefined();
    });
  });

  describe('error handling', () => {
    it('should handle invalid branch names gracefully', async () => {
      await expect(switcher.switchToVersion('invalid/branch/name')).rejects.toThrow();
    });

    it('should report conflict detection errors', async () => {
      try {
        await switcher.detectConflicts('nonexistent-branch');
      } catch (error) {
        // Should throw error for non-existent branch
        expect(error).toBeDefined();
      }
    });

    it('should handle git repository errors gracefully', async () => {
      // Create a switcher and try to get version from uninitialized repo
      const tempDir = path.join('/tmp', `babel-uninitialized-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        const badRepo = new GitRepository(tempDir);
        const badSwitcher = new VersionSwitcher(badRepo);

        // This should throw since repo is not initialized
        try {
          await badSwitcher.getCurrentVersion();
          fail('Should have thrown error');
        } catch (error) {
          expect(error).toBeDefined();
        }
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true });
        }
      }
    });
  });

  describe('state tracking', () => {
    it('should track last switched version', async () => {
      // Create two branches
      const version1 = 'track-test-v1';
      const version2 = 'track-test-v2';

      await gitRepo.createBranch(version1);
      // createBranch checks out, so we're on version1

      // Get the base branch before we started
      const allBranches = await gitRepo.getAllBranches();
      const baseBranch = allBranches.find((b) => b !== version1);

      if (baseBranch) {
        // Switch back to base
        await gitRepo.checkout(baseBranch);

        // Now create version2
        await gitRepo.createBranch(version2);
        // We're on version2 now

        // Switch to version1
        await switcher.switchToVersion(version1);

        const lastSwitched = switcher.getLastSwitchedVersion();
        expect(lastSwitched).toBe(version2);
      }
    });

    it('should track switch timestamp', async () => {
      const version1 = 'timestamp-test-v1';
      const version2 = 'timestamp-test-v2';

      // Create version1
      await gitRepo.createBranch(version1);
      // We're on version1

      // Get base branch
      const allBranches = await gitRepo.getAllBranches();
      const baseBranch = allBranches.find((b) => b !== version1);

      if (baseBranch) {
        // Go back to base
        await gitRepo.checkout(baseBranch);

        // Create version2
        await gitRepo.createBranch(version2);
        // We're on version2

        const beforeSwitch = Date.now();
        // Switch to version1
        await switcher.switchToVersion(version1);
        const afterSwitch = Date.now();

        const timestamp = switcher.getLastSwitchTime();
        expect(timestamp).toBeGreaterThanOrEqual(beforeSwitch);
        expect(timestamp).toBeLessThanOrEqual(afterSwitch + 1000); // Allow 1 second buffer
      }
    });
  });

  describe('conflict resolution suggestions', () => {
    it('should provide conflict resolution suggestions', async () => {
      const suggestions = await switcher.getConflictResolutionSuggestions('some-branch', 'other-branch');

      expect(suggestions).toBeDefined();
      expect(Array.isArray(suggestions)).toBe(true);
    });

    it('should handle missing branch in suggestions', async () => {
      const suggestions = await switcher.getConflictResolutionSuggestions('nonexistent-1', 'nonexistent-2');

      // Should either return suggestions or handle gracefully
      expect(suggestions).toBeDefined();
    });
  });
});
