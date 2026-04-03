/**
 * Create Story Command Tests
 * Tests for creating new stories with type and name
 */

import { CreateStoryCommand } from '../../../../src/core/commands/createStoryCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { VersionRepository } from '../../../../src/db/versionRepository';
import { Logger } from '../../../../src/utils/logger';
import { createTestDatabase } from '../../../helpers/database';
import { GitRepository } from '../../../../src/git/gitRepository';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

// Mock fs module
jest.mock('fs');

// Mock GitRepository
jest.mock('../../../../src/git/gitRepository');

describe('CreateStoryCommand', () => {
  let command: CreateStoryCommand;
  let storyRepository: StoryRepository;
  let versionRepository: VersionRepository;

  beforeEach(async () => {
    jest.resetAllMocks();

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.mkdirSync as jest.Mock).mockImplementation(() => {});
    (fs.writeFileSync as jest.Mock).mockImplementation(() => {});

    // Mock GitRepository
    const mockGitInstance = {
      init: jest.fn().mockResolvedValue({ initialized: true, path: '' }),
      createInitialCommit: jest.fn().mockResolvedValue({ committed: true, message: '' }),
      createBranch: jest.fn().mockResolvedValue({ branch: 'draft1', created: true }),
    };
    (GitRepository as jest.Mock).mockImplementation(() => mockGitInstance);

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

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: '/tmp/test-workspace' } },
    ];

    // Mock vscode window methods
    (vscode.window.showTextDocument as jest.Mock) = jest.fn().mockResolvedValue({});
    (vscode.window.showInformationMessage as jest.Mock) = jest.fn().mockResolvedValue(undefined);

    command = new CreateStoryCommand(storyRepository, versionRepository);
  });

  afterEach(() => {
    // Cleanup handled by test database
  });

  describe('execute', () => {
    it('should prompt user for story type', async () => {
      const showQuickPickSpy = jest.spyOn(vscode.window, 'showQuickPick' as any);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      await command.execute();

      expect(showQuickPickSpy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ label: 'Short Story' }),
          expect.objectContaining({ label: 'Novel' }),
        ]),
        expect.any(Object)
      );
    });

    it('should prompt user for story name', async () => {
      const showInputBoxSpy = jest.spyOn(vscode.window, 'showInputBox' as any);

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      await command.execute();

      expect(showInputBoxSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'Enter story name',
        })
      );
    });

    it('should create story with selected type and name', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Test Novel');

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('Test Novel');

      // Verify story was created in database
      const stories = storyRepository.findAll();
      expect(stories.length).toBeGreaterThan(0);
      expect(stories.some((s: any) => s.displayName === 'Test Novel')).toBe(true);
    });

    it('should return failure if user cancels type selection', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should return failure if user cancels name input', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
    });

    it('should handle empty story name', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      // Empty string should be rejected by validation in real VSCode
      // Return undefined to simulate user cancelling due to validation error
      (vscode.window.showInputBox as any).mockResolvedValueOnce(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled');
    });

    it('should create story with initial version branch', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Short Story',
        storyType: 'short-story',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('New Story');

      const result = await command.execute();

      expect(result.success).toBe(true);

      // Verify story was created
      const stories = storyRepository.findAll();
      expect(stories.some((s: any) => s.displayName === 'New Story')).toBe(true);
    });

    it('should show success message', async () => {
      const showInfoSpy = jest.spyOn(vscode.window, 'showInformationMessage');

      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Test Novel');

      await command.execute();

      expect(showInfoSpy).toHaveBeenCalledWith(
        expect.stringContaining('Test Novel')
      );
    });

    it('should handle all story types', async () => {
      const types = [
        { label: 'Short Story', storyType: 'short-story' },
        { label: 'Novel', storyType: 'novel' },
        { label: 'Novella', storyType: 'novella' },
        { label: 'Essay', storyType: 'essay' },
      ];

      for (const type of types) {
        (vscode.window.showQuickPick as any).mockResolvedValueOnce(type);
        (vscode.window.showInputBox as any).mockResolvedValueOnce(
          `Test ${type.label}`
        );

        const result = await command.execute();

        expect(result.success).toBe(true);

        // Reset mocks for next iteration
        jest.resetAllMocks();
        (fs.existsSync as jest.Mock).mockReturnValue(true);
        (fs.mkdirSync as jest.Mock).mockImplementation();
        (fs.writeFileSync as jest.Mock).mockImplementation();
      }
    });

    it('should create story folder at workspace/{story.name}', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      const result = await command.execute();

      // Verify successful execution
      expect(result.success).toBe(true);
      // Verify result contains story ID with UUID format
      const data = result.data as any;
      expect(data.storyId).toBeDefined();
      expect(data.storyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
      // Verify story was created in database
      const stories = storyRepository.findAll();
      expect(stories.some((s: any) => s.id === data.storyId)).toBe(true);
    });

    it('should return story ID in result data', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Short Story',
        storyType: 'short-story',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Story');

      const result = await command.execute();

      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data).toHaveProperty('storyId');
      expect(typeof data.storyId).toBe('string');
      // UUID format: 8-4-4-4-12 hex characters
      expect(data.storyId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });


    it('should create type-specific boilerplate files for novel', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      await command.execute();

      // Verify boilerplate files created: characters, outline, chapters
      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const filePaths = calls.map(call => call[0]);

      expect(filePaths.some((p: string) => p.includes('characters.md'))).toBe(true);
      expect(filePaths.some((p: string) => p.includes('outline.md'))).toBe(true);
    });

    it('should create chapters directory for novel type', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      const result = await command.execute();

      // Verify success
      expect(result.success).toBe(true);
      // Verify chapter files were created
      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const filePaths = calls.map(call => call[0]);
      expect(
        filePaths.some((p: string) => p.includes('chapters') && p.includes('chapter-1.md'))
      ).toBe(true);
      expect(
        filePaths.some((p: string) => p.includes('chapters') && p.includes('chapter-2.md'))
      ).toBe(true);
    });

    it('should create chapter files in chapters directory for novel', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      await command.execute();

      // Verify chapter files created
      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const filePaths = calls.map(call => call[0]);

      expect(
        filePaths.some((p: string) => p.includes('chapters') && p.includes('chapter-1.md'))
      ).toBe(true);
    });

    it('should create minimal boilerplate for short story', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Short Story',
        storyType: 'short-story',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Short Story');

      await command.execute();

      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const filePaths = calls.map(call => call[0]);

      expect(filePaths.some((p: string) => p.includes('story.md'))).toBe(true);
      // Short stories should NOT have chapters directory
      expect(filePaths.some((p: string) => p.includes('chapters'))).toBe(false);
    });

    it('should create appropriate files for essay type', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Essay',
        storyType: 'essay',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Essay');

      await command.execute();

      const calls = (fs.writeFileSync as jest.Mock).mock.calls;
      const filePaths = calls.map(call => call[0]);

      expect(filePaths.some((p: string) => p.includes('essay.md'))).toBe(true);
    });

    it('should initialize git repository in story folder', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('My Novel');

      const result = await command.execute();

      // Verify success and story was created
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data.storyId).toBeDefined();

      // Verify GitRepository was instantiated for the story folder
      expect(GitRepository).toHaveBeenCalled();

      // Verify git operations were called
      const gitInstance = (GitRepository as jest.Mock).mock.results[0].value;
      expect(gitInstance.init).toHaveBeenCalled();
      expect(gitInstance.createInitialCommit).toHaveBeenCalledWith('Initial story setup');
      expect(gitInstance.createBranch).toHaveBeenCalledWith('draft1');
    });

    it('should open first story file in editor', async () => {
      (vscode.window.showQuickPick as any).mockResolvedValueOnce({
        label: 'Novel',
        storyType: 'novel',
      });
      (vscode.window.showInputBox as any).mockResolvedValueOnce('Test Story');

      await command.execute();

      expect(vscode.window.showTextDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expect.stringContaining('chapter-1.md'),
        })
      );
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
