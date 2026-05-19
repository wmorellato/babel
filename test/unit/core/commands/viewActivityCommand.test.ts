/**
 * View Activity Command Tests
 * Tests for viewing story word count history and activity
 */

import { ViewActivityCommand } from '../../../../src/core/commands/viewActivityCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { WordCountRepository } from '../../../../src/db/wordCountRepository';
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

describe('ViewActivityCommand', () => {
  let command: ViewActivityCommand;
  let storyRepository: StoryRepository;
  let wordCountRepository: WordCountRepository;
  let storyManager: StoryManager;

  beforeEach(async () => {
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
      CREATE TABLE IF NOT EXISTS word_count_history (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        date TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        UNIQUE(story_id, date)
      )
    `);

    // Create repositories
    storyRepository = new StoryRepository(db);
    wordCountRepository = new WordCountRepository(db);

    // Create story manager to create test stories
    const typeRegistry = new StoryTypeRegistry();
    storyManager = new StoryManager(storyRepository, new (require('../../../../src/db/versionRepository').VersionRepository)(db), typeRegistry);

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: '/tmp/test-workspace' } },
    ];

    command = new ViewActivityCommand(storyRepository, wordCountRepository);
  });

  afterEach(() => {
    // Cleanup handled by test database
  });

  describe('execute', () => {
    it('should prompt user to select a story', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });

      await command.execute();

      expect((vscode.window.showQuickPick as any)).toHaveBeenCalled();
    });

    it('should display activity for selected story', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      // Add word count entries
      const today = new Date();
      wordCountRepository.create({
        id: `entry1-${Date.now()}`,
        storyId: story.id,
        date: today,
        wordCount: 1000,
      });

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Activity');
    });

    it('should return failure if user cancels story selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should show error if no stories exist', async () => {
      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should show story activity with word counts', async () => {
      // Create test story
      const story = storyManager.createStory('My Story', StoryType.NOVEL);

      // Add multiple word count entries
      const baseDate = new Date('2026-03-01');
      wordCountRepository.create({
        id: `entry1-${Date.now()}`,
        storyId: story.id,
        date: new Date(baseDate.getTime()),
        wordCount: 1000,
      });
      wordCountRepository.create({
        id: `entry2-${Date.now() + 1}`,
        storyId: story.id,
        date: new Date(baseDate.getTime() + 86400000), // +1 day
        wordCount: 2000,
      });

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'My Story',
        storyId: story.id,
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
    });

    it('should handle story with no activity', async () => {
      // Create test story (no word count entries)
      const story = storyManager.createStory('Empty Story', StoryType.SHORT_STORY);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Empty Story',
        storyId: story.id,
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Activity');
    });

    it('should handle multiple stories correctly', async () => {
      // Create multiple stories
      const story1 = storyManager.createStory('Story 1', StoryType.NOVEL);
      const story2 = storyManager.createStory('Story 2', StoryType.SHORT_STORY);

      // Add activity for story1
      wordCountRepository.create({
        id: `entry1-${Date.now()}`,
        storyId: story1.id,
        date: new Date(),
        wordCount: 5000,
      });

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Story 1',
        storyId: story1.id,
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
    });

    it('should show success message', async () => {
      // Create test story
      const story = storyManager.createStory('Success Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Success Story',
        storyId: story.id,
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Activity');
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
