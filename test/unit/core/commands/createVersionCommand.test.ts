/**
 * Create Version Command Tests
 * Tests for creating new story versions (branches)
 */

import { CreateVersionCommand } from '../../../../src/core/commands/createVersionCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { VersionRepository } from '../../../../src/db/versionRepository';
import { GitRepository } from '../../../../src/git/gitRepository';
import { StoryManager } from '../../../../src/core/storyManager';
import { StoryTypeRegistry } from '../../../../src/core/storyTypeRegistry';
import { Logger } from '../../../../src/utils/logger';
import { createTestDatabase } from '../../../helpers/database';
import { StoryType } from '../../../../src/types/index';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('CreateVersionCommand', () => {
  let command: CreateVersionCommand;
  let storyRepository: StoryRepository;
  let versionRepository: VersionRepository;
  let gitRepository: GitRepository;
  let storyManager: StoryManager;
  let testRepoPath: string;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Create test git repository
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-create-version-test-${timestamp}-${testId}`);

    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }

    gitRepository = new GitRepository(testRepoPath);
    await gitRepository.init();
    await gitRepository.createInitialCommit('Initial commit');

    // Create test database
    const db = createTestDatabase();

    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        git_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);

    // Create repositories
    storyRepository = new StoryRepository(db);
    versionRepository = new VersionRepository(db);

    // Create story manager to create test stories
    const typeRegistry = new StoryTypeRegistry();
    storyManager = new StoryManager(storyRepository, versionRepository, typeRegistry);

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: testRepoPath } },
    ];

    command = new CreateVersionCommand(storyRepository, versionRepository, gitRepository);
  });

  afterEach(() => {
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('execute', () => {
    it('should prompt user to select a story', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('v2');

      const result = await command.execute();

      expect((vscode.window.showQuickPick as any)).toHaveBeenCalled();
    });

    it('should prompt user for version name', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('version-2');

      await command.execute();

      expect((vscode.window.showInputBox as any)).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: expect.stringContaining('version name'),
        })
      );
    });

    it('should create version with new branch', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('feature-branch');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('feature-branch');

      // Verify version was created in database
      const versions = versionRepository.findByStoryId(story.id);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions.some((v) => v.gitBranch === 'feature-branch')).toBe(true);
    });

    it('should return failure if user cancels story selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user cancels version name input', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should show error if no stories exist', async () => {
      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should show success message', async () => {
      // Create test story
      const story = storyManager.createStory('My Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'My Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('beta-version');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('beta-version');
    });

    it('should handle multiple stories correctly', async () => {
      // Create multiple stories
      const story1 = storyManager.createStory('Story 1', StoryType.NOVEL);
      const story2 = storyManager.createStory('Story 2', StoryType.SHORT_STORY);
      const story3 = storyManager.createStory('Story 3', StoryType.NOVELLA);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Story 2',
        storyId: story2.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('v2.0');

      const result = await command.execute();

      expect(result.success).toBe(true);

      // Verify version was created for correct story
      const story2Versions = versionRepository.findByStoryId(story2.id);
      const hasV2 = story2Versions.some((v) => v.gitBranch === 'v2.0');
      expect(hasV2).toBe(true);
    });

    it('should reject duplicate branch names', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      // Create first version
      versionRepository.create({
        id: `version-${Date.now()}-1`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      // Try to create version with same branch name
      (vscode.window.showInputBox as any).mockResolvedValueOnce('v1.0');

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
    });
  });

  describe('validatePrerequisites', () => {
    it('should return true when workspace exists', async () => {
      const valid = await (command as any).validatePrerequisites();
      expect(valid).toBe(true);
    });

    it('should return false when workspace does not exist', async () => {
      (vscode.workspace.workspaceFolders as any) = undefined;

      const valid = await (command as any).validatePrerequisites();
      expect(valid).toBe(false);
    });
  });
});
