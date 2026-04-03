/**
 * Rename Story Command Tests
 * Tests for renaming existing stories
 */

import { RenameStoryCommand } from '../../../../src/core/commands/renameStoryCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { VersionRepository } from '../../../../src/db/versionRepository';
import { StoryManager } from '../../../../src/core/storyManager';
import { StoryTypeRegistry } from '../../../../src/core/storyTypeRegistry';
import { Logger } from '../../../../src/utils/logger';
import { createTestDatabase } from '../../../helpers/database';
import { StoryType } from '../../../../src/types/index';
import * as vscode from 'vscode';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('RenameStoryCommand', () => {
  let command: RenameStoryCommand;
  let storyRepository: StoryRepository;
  let versionRepository: VersionRepository;
  let storyManager: StoryManager;

  beforeEach(async () => {
    // Restore mocks to default behavior
    jest.resetAllMocks();

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
      { uri: { fsPath: '/tmp/test-workspace' } },
    ];

    command = new RenameStoryCommand(storyRepository);
  });

  afterEach(() => {
    // Cleanup handled by test database
  });

  describe('execute', () => {
    it('should prompt user to select a story', async () => {
      // Create a test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      const showQuickPickSpy = jest.spyOn(vscode.window, 'showQuickPick' as any);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Renamed Story');

      await command.execute();

      expect(showQuickPickSpy).toHaveBeenCalled();
    });

    it('should prompt user for new story name', async () => {
      // Create a test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      const showInputBoxSpy = jest.spyOn(vscode.window, 'showInputBox' as any);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Renamed Story');

      await command.execute();

      expect(showInputBoxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Enter new story name',
        })
      );
    });

    it('should rename story with new name', async () => {
      // Create a test story
      const story = storyManager.createStory('Original Name', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Original Name',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('New Name');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('New Name');

      // Verify story was renamed in database
      const updated = storyRepository.findById(story.id);
      expect(updated?.displayName).toBe('New Name');
    });

    it('should return failure if user cancels story selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user cancels name input', async () => {
      // Create a test story
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
      const showErrorSpy = jest.spyOn(vscode.window, 'showErrorMessage');

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should show success message', async () => {
      // Create a test story
      const story = storyManager.createStory('Old Name', StoryType.SHORT_STORY);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Old Name',
        storyId: story.id,
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('New Name');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('New Name');
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
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Renamed Story 2');

      const result = await command.execute();

      expect(result.success).toBe(true);

      // Verify correct story was renamed
      expect(storyRepository.findById(story1.id)?.displayName).toBe('Story 1');
      expect(storyRepository.findById(story2.id)?.displayName).toBe('Renamed Story 2');
      expect(storyRepository.findById(story3.id)?.displayName).toBe('Story 3');
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
