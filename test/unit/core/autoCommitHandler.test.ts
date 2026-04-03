/**
 * Auto-commit handler tests
 * Handles automatic commits when story content changes
 */

import { AutoCommitHandler } from '../../../src/core/autoCommitHandler';
import { GitRepository } from '../../../src/git/gitRepository';
import { StoryManager } from '../../../src/core/storyManager';
import { Story } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';

describe('AutoCommitHandler', () => {
  let gitRepo: GitRepository;
  let handler: AutoCommitHandler;
  let testRepoPath: string;
  let testStoryPath: string;

  beforeEach(async () => {
    // Create unique temp directory for each test
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-auto-commit-test-${timestamp}-${testId}`);
    testStoryPath = path.join(testRepoPath, 'story.md');

    // Create directory if it doesn't exist
    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }

    gitRepo = new GitRepository(testRepoPath);
    await gitRepo.init();
    await gitRepo.createInitialCommit('Initial commit');

    handler = new AutoCommitHandler(gitRepo);
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('initialization', () => {
    it('should create handler with git repository', () => {
      expect(handler).toBeDefined();
      expect(handler.getRepository()).toBe(gitRepo);
    });

    it('should have configurable word count threshold', () => {
      const customHandler = new AutoCommitHandler(gitRepo, { wordCountThreshold: 500 });
      expect(customHandler.getConfig().wordCountThreshold).toBe(500);
    });

    it('should use default threshold if not specified', () => {
      expect(handler.getConfig().wordCountThreshold).toBe(100);
    });
  });

  describe('file watching', () => {
    it('should start watching for file changes', async () => {
      const mockFile = path.join(testRepoPath, 'test.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('test.md', 'Initial content');

      await handler.watch(testRepoPath);

      // Give watcher time to start
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(handler.isWatching()).toBe(true);

      handler.stopWatching();
    });

    it('should stop watching when requested', async () => {
      await handler.watch(testRepoPath);
      expect(handler.isWatching()).toBe(true);

      handler.stopWatching();
      expect(handler.isWatching()).toBe(false);
    });

    it('should handle stopWatching() called multiple times (idempotent)', async () => {
      await handler.watch(testRepoPath);
      expect(handler.isWatching()).toBe(true);

      // First stop should work normally
      handler.stopWatching();
      expect(handler.isWatching()).toBe(false);

      // Second stop should not throw (optional chaining prevents errors)
      expect(() => {
        handler.stopWatching();
      }).not.toThrow();

      // Third stop to verify it's truly idempotent
      expect(() => {
        handler.stopWatching();
      }).not.toThrow();
    });

    it('should handle missing directory gracefully', async () => {
      const nonExistentPath = path.join(testRepoPath, 'nonexistent');
      await expect(handler.watch(nonExistentPath)).rejects.toThrow();
    });
  });

  describe('word count tracking', () => {
    it('should track previous word count', () => {
      handler.setWordCount(100);
      expect(handler.getWordCount()).toBe(100);
    });

    it('should calculate word delta correctly', () => {
      handler.setWordCount(100);
      const delta = handler.calculateWordDelta(150);

      expect(delta).toBe(50);
    });

    it('should handle negative delta (words removed)', () => {
      handler.setWordCount(200);
      const delta = handler.calculateWordDelta(150);

      expect(delta).toBe(-50);
    });

    it('should reset word count after commit', () => {
      handler.setWordCount(100);
      handler.resetWordCount(250);

      expect(handler.getWordCount()).toBe(250);
    });
  });

  describe('commit triggering', () => {
    it('should trigger commit when word threshold exceeded', async () => {
      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');

      handler.setWordCount(0);

      const result = await handler.triggerCommit(150, 'Auto-save');

      expect(result.committed).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it('should include metadata in commit', async () => {
      const mockFile = path.join(testRepoPath, 'story.md');
      const content = 'This is a story with word count metadata included';
      fs.writeFileSync(mockFile, content);
      await gitRepo.addFile('story.md', content);

      handler.setWordCount(0);

      const result = await handler.triggerCommit(50, 'Auto-save', { wordCount: 50, wordDelta: 50 });

      expect(result.committed).toBe(true);
      expect(result.message).toBeTruthy();
    });

    it('should handle commit errors gracefully', async () => {
      handler.setWordCount(100);

      // Try to commit with no actual changes
      const result = await handler.triggerCommit(150, 'Auto-save');

      expect(result).toBeDefined();
    });
  });

  describe('automatic commit detection', () => {
    it('should determine if commit is needed based on threshold', () => {
      handler.setWordCount(100);

      const needsCommit = handler.shouldCommit(100);
      expect(needsCommit).toBe(false); // No change

      const needsCommit2 = handler.shouldCommit(200);
      expect(needsCommit2).toBe(true); // Exceeds default threshold of 100
    });

    it('should respect custom threshold', () => {
      const customHandler = new AutoCommitHandler(gitRepo, { wordCountThreshold: 500 });
      customHandler.setWordCount(1000);

      expect(customHandler.shouldCommit(1100)).toBe(false); // Only 100 word change
      expect(customHandler.shouldCommit(1500)).toBe(true); // Exceeds 500 word threshold
    });

    it('should handle threshold of zero (commit on any change)', () => {
      const zeroThresholdHandler = new AutoCommitHandler(gitRepo, { wordCountThreshold: 0 });
      zeroThresholdHandler.setWordCount(100);

      expect(zeroThresholdHandler.shouldCommit(100)).toBe(false); // No change
      expect(zeroThresholdHandler.shouldCommit(101)).toBe(true); // Any change triggers commit
    });
  });

  describe('configuration', () => {
    it('should allow custom configuration', () => {
      const config = {
        wordCountThreshold: 250,
        autoCommitEnabled: true,
      };

      const customHandler = new AutoCommitHandler(gitRepo, config);

      expect(customHandler.getConfig().wordCountThreshold).toBe(250);
      expect(customHandler.getConfig().autoCommitEnabled).toBe(true);
    });

    it('should update configuration dynamically', () => {
      handler.updateConfig({ wordCountThreshold: 200 });

      expect(handler.getConfig().wordCountThreshold).toBe(200);
    });

    it('should provide default config values', () => {
      const config = handler.getConfig();

      expect(config).toHaveProperty('wordCountThreshold');
      expect(config).toHaveProperty('autoCommitEnabled');
    });
  });

  describe('state tracking', () => {
    it('should track last commit hash', () => {
      handler.setLastCommitHash('abc123def456');

      expect(handler.getLastCommitHash()).toBe('abc123def456');
    });

    it('should track last commit timestamp', () => {
      const now = Date.now();
      handler.setLastCommitTime(now);

      expect(handler.getLastCommitTime()).toBe(now);
    });

    it('should track total commits in session', async () => {
      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');

      handler.setWordCount(0);
      const result = await handler.triggerCommit(150, 'First auto-save');

      expect(handler.getCommitCount()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('error recovery', () => {
    it('should handle file not found during commit', async () => {
      handler.setWordCount(0);

      // Try to trigger commit with no actual file changes
      const result = await handler.triggerCommit(100, 'Auto-save');

      expect(result).toBeDefined();
    });

    it('should handle git errors gracefully', async () => {
      // Test that handler gracefully handles commit errors
      handler.setWordCount(100);

      // Try to commit with no actual file changes should result in no commit
      const result = await handler.triggerCommit(100, 'Auto-save');

      // Should either succeed or fail gracefully
      expect(result).toBeDefined();
      expect(result.committed !== undefined).toBe(true);
    });

    it('should log commit events', async () => {
      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content with more words');
      await gitRepo.addFile('story.md', 'Initial content with more words');

      handler.setWordCount(0);
      const result = await handler.triggerCommit(200, 'Auto-save');

      // Handler should track this
      const history = handler.getCommitHistory();
      expect(history).toBeDefined();
    });
  });

  describe('integration scenarios', () => {
    it('should handle rapid successive file changes', async () => {
      const mockFile = path.join(testRepoPath, 'story.md');

      // Simulate rapid changes with larger word counts exceeding default threshold (100)
      fs.writeFileSync(mockFile, 'Word one');
      await gitRepo.addFile('story.md', 'Word one');
      handler.setWordCount(2);

      fs.writeFileSync(mockFile, 'Word one two three');
      handler.setWordCount(4); // Track cumulative

      // Now add a large amount of text (150 words total, delta of 146 from baseline 4)
      const largeContent = Array(150).fill('word').join(' ');
      fs.writeFileSync(mockFile, largeContent);

      expect(handler.shouldCommit(150)).toBe(true);
    });

    it('should support pausing and resuming auto-commit', () => {
      handler.pause();
      expect(handler.isPaused()).toBe(true);

      handler.resume();
      expect(handler.isPaused()).toBe(false);
    });

    it('should handle configuration changes while watching', async () => {
      await handler.watch(testRepoPath);

      handler.updateConfig({ wordCountThreshold: 300 });

      expect(handler.getConfig().wordCountThreshold).toBe(300);
      expect(handler.isWatching()).toBe(true);

      handler.stopWatching();
    });
  });

  describe('file changed callback', () => {
    it('should allow setting file changed callback with story ID', async () => {
      const mockCallback = jest.fn();
      const storyId = 'story-123';

      handler.setFileChangedCallback(storyId, mockCallback);

      // Verify handler is configured (can't easily verify internal state, but ensure no error)
      expect(handler).toBeDefined();
    });

    it('should invoke callback when file changes', async () => {
      const mockCallback = jest.fn().mockResolvedValue(undefined);
      const storyId = 'story-456';

      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');

      // Create handler with callback
      const callbackHandler = new AutoCommitHandler(gitRepo, undefined, storyId, mockCallback);

      await callbackHandler.watch(testRepoPath);

      // Modify file
      fs.writeFileSync(mockFile, 'Initial content with more words');

      // Wait for debounce and callback
      await new Promise((resolve) => setTimeout(resolve, 1500));

      callbackHandler.stopWatching();

      // Verify callback was invoked
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith(storyId, expect.any(Number));
    });

    it('should handle callback errors gracefully', async () => {
      const mockCallback = jest.fn().mockRejectedValue(new Error('Callback error'));
      const storyId = 'story-789';

      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');

      const callbackHandler = new AutoCommitHandler(gitRepo, undefined, storyId, mockCallback);

      await callbackHandler.watch(testRepoPath);

      // Modify file
      fs.writeFileSync(mockFile, 'Modified content with additional words');

      // Wait for debounce
      await new Promise((resolve) => setTimeout(resolve, 1500));

      callbackHandler.stopWatching();

      // Callback should have been invoked despite error
      expect(mockCallback).toHaveBeenCalled();
    });

    it('should support callback set after construction', async () => {
      const mockCallback = jest.fn().mockResolvedValue(undefined);
      const storyId = 'story-999';

      const mockFile = path.join(testRepoPath, 'story.md');
      fs.writeFileSync(mockFile, 'Initial content');
      await gitRepo.addFile('story.md', 'Initial content');

      // Create handler without callback
      const callbackHandler = new AutoCommitHandler(gitRepo);

      // Set callback after construction
      callbackHandler.setFileChangedCallback(storyId, mockCallback);

      await callbackHandler.watch(testRepoPath);

      // Modify file
      fs.writeFileSync(mockFile, 'Initial content with more words');

      // Wait for debounce and callback
      await new Promise((resolve) => setTimeout(resolve, 1500));

      callbackHandler.stopWatching();

      // Verify callback was invoked
      expect(mockCallback).toHaveBeenCalled();
      expect(mockCallback).toHaveBeenCalledWith(storyId, expect.any(Number));
    });
  });
});
