/**
 * Delete Version Command Tests
 * Tests for deleting story versions
 */

import { DeleteVersionCommand } from '../../../../src/core/commands/deleteVersionCommand';
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

describe('DeleteVersionCommand', () => {
  let command: DeleteVersionCommand;
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
    testRepoPath = path.join('/tmp', `babel-delete-version-test-${timestamp}-${testId}`);

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

    command = new DeleteVersionCommand(versionRepository, gitRepository, storyRepository);
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
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('v1.0');
      // Create a temporary branch to checkout to (so we can delete v1.0)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      await command.execute();

      expect((vscode.window.showQuickPick as any).mock.calls[0]).toBeDefined();
    });

    it('should prompt user to select a version after story selection', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('v1.0');
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      await command.execute();

      expect((vscode.window.showQuickPick as any).mock.calls.length).toBeGreaterThanOrEqual(2);
    });

    it('should request deletion confirmation', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('v1.0');
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      await command.execute();

      expect((vscode.window.showWarningMessage as any)).toHaveBeenCalled();
    });

    it('should delete version when confirmed', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('v1.0');
      // Switch back to main to be able to delete v1.0
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('v1.0');
    });

    it('should return failure if user cancels story selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user cancels version selection', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user declines deletion confirmation', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('v1.0');
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should show error if no stories exist', async () => {
      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should show error if trying to delete main branch', async () => {
      // Create test story with default main branch
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);
      // The main branch is created automatically, no need to create it

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'main',
        branchName: 'main',
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('main');
    });

    it('should show success message', async () => {
      // Create test story
      const story = storyManager.createStory('My Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v2-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'old-version',
        createdAt: new Date(),
      });
      await gitRepository.createBranch('old-version');
      // Switch back to main to be able to delete old-version
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'My Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'old-version',
        branchName: 'old-version',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('old-version');
    });

    it('should handle multiple versions correctly', async () => {
      // Create test story with multiple versions
      const story = storyManager.createStory('Multi-Version Story', StoryType.NOVEL);
      versionRepository.create({
        id: `v1-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v1.0',
        createdAt: new Date(),
      });
      versionRepository.create({
        id: `v2-${Date.now()}`,
        storyId: story.id,
        gitBranch: 'v2.0',
        createdAt: new Date(),
      });

      // Create branches in git
      await gitRepository.createBranch('v1.0');
      await gitRepository.createBranch('v2.0');
      // Create a temporary branch to checkout to (so we can delete the version branch)
      await gitRepository.createBranch('temp-branch');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Multi-Version Story',
        storyId: story.id,
      });
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'v1.0',
        branchName: 'v1.0',
      });
      (vscode.window.showWarningMessage as any).mockResolvedValueOnce('Delete');

      const result = await command.execute();

      expect(result.success).toBe(true);

      // Verify other version still exists
      const versions = versionRepository.findByStoryId(story.id);
      expect(versions.some((v) => v.gitBranch === 'v2.0')).toBe(true);
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
