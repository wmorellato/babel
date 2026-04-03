/**
 * Export Story Command Tests
 * Tests for exporting stories to files
 */

import { ExportStoryCommand } from '../../../../src/core/commands/exportStoryCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
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

// Mock PandocExportService
jest.mock('../../../../src/services/export/pandocExportService');

describe('ExportStoryCommand', () => {
  let command: ExportStoryCommand;
  let storyRepository: StoryRepository;
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
    const versionRepository = require('../../../../src/db/versionRepository').VersionRepository;

    // Create story manager to create test stories
    const typeRegistry = new StoryTypeRegistry();
    storyManager = new StoryManager(storyRepository, new versionRepository(db), typeRegistry);

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: '/tmp/test-workspace' } },
    ];

    // Mock workspace configuration
    (vscode.workspace.getConfiguration as any) = jest.fn().mockReturnValue({
      get: jest.fn().mockReturnValue('/tmp/pandoc-templates'),
    });

    // Mock PandocExportService
    const PandocExportService = require('../../../../src/services/export/pandocExportService').PandocExportService;
    PandocExportService.prototype.isPandocInstalled = jest.fn().mockReturnValue(true);
    PandocExportService.prototype.exportStory = jest.fn().mockResolvedValue({
      success: true,
      message: 'Export successful',
      filePath: '/tmp/export.docx',
    });

    command = new ExportStoryCommand(storyRepository, '/tmp/test-workspace');
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
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/test.md')
      );

      await command.execute();

      expect((vscode.window.showQuickPick as any)).toHaveBeenCalled();
    });

    it('should prompt user for export file path', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/test.md')
      );

      await command.execute();

      expect((vscode.window.showSaveDialog as any)).toHaveBeenCalled();
    });

    it('should return failure if user cancels story selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user cancels save dialog', async () => {
      // Create test story
      const story = storyManager.createStory('Test Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Test Story',
        storyId: story.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should show error if no stories exist', async () => {
      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should export story with metadata', async () => {
      // Create test story
      const story = storyManager.createStory('My Story', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'My Story',
        storyId: story.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/export.md')
      );

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('exported');
    });

    it('should handle multiple stories correctly', async () => {
      // Create multiple stories
      const story1 = storyManager.createStory('Story 1', StoryType.NOVEL);
      const story2 = storyManager.createStory('Story 2', StoryType.SHORT_STORY);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Story 2',
        storyId: story2.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/story2.md')
      );

      const result = await command.execute();

      expect(result.success).toBe(true);
    });

    it('should include story metadata in export', async () => {
      // Create test story
      const story = storyManager.createStory('Tagged Story', StoryType.NOVELLA);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Tagged Story',
        storyId: story.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/tagged.md')
      );

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect((result.data as any)?.metadata).toBeDefined();
    });

    it('should show success message', async () => {
      // Create test story
      const story = storyManager.createStory('Export Me', StoryType.NOVEL);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Export Me',
        storyId: story.id,
      });
      (vscode.window.showSaveDialog as any).mockResolvedValueOnce(
        vscode.Uri.file('/tmp/export-me.md')
      );

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Export Me');
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
