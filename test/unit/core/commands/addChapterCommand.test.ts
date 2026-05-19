/**
 * AddChapterCommand Tests
 * Tests for chapter creation command with auto-numbering
 */

import * as vscode from 'vscode';
import { AddChapterCommand } from '../../../../src/core/commands/addChapterCommand';
import { StoryFileService } from '../../../../src/services/storyFileService';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { BabelStoriesTreeDataProvider } from '../../../../src/views/storyTreeDataProvider';
import { StoryType } from '../../../../src/types';
import { Logger } from '../../../../src/utils/logger';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('AddChapterCommand', () => {
  let command: AddChapterCommand;
  let mockStoryFileService: jest.Mocked<StoryFileService>;
  let mockStoryRepository: jest.Mocked<StoryRepository>;
  let mockTreeDataProvider: jest.Mocked<BabelStoriesTreeDataProvider>;
  let mockVscodeWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock StoryFileService
    mockStoryFileService = {
      getChapterCount: jest.fn(),
      createChapter: jest.fn(),
    } as any;

    // Mock StoryRepository
    mockStoryRepository = {
      findById: jest.fn(),
    } as any;

    // Mock BabelStoriesTreeDataProvider
    mockTreeDataProvider = {
      refresh: jest.fn(),
    } as any;

    // Mock vscode.window
    mockVscodeWindow = {
      showInputBox: jest.fn(),
      showErrorMessage: jest.fn(),
      showTextDocument: jest.fn(),
      activeTextEditor: null,
    };

    command = new AddChapterCommand(
      mockStoryFileService,
      mockStoryRepository,
      mockTreeDataProvider,
      mockVscodeWindow
    );
  });

  it('gets chapter count and suggests next chapter for Novel', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(3);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-4.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 4');

    await command.execute('story-id');

    expect(mockStoryFileService.getChapterCount).toHaveBeenCalledWith('story-id');
    expect(mockVscodeWindow.showInputBox).toHaveBeenCalledWith({
      prompt: 'Chapter name?',
      value: 'Chapter 4',
      validateInput: expect.any(Function),
    });
  });

  it('gets chapter count and suggests next chapter for Novella', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVELLA } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(1);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-2.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 2');

    await command.execute('story-id');

    expect(mockStoryFileService.getChapterCount).toHaveBeenCalledWith('story-id');
    expect(mockVscodeWindow.showInputBox).toHaveBeenCalledWith({
      prompt: 'Chapter name?',
      value: 'Chapter 2',
      validateInput: expect.any(Function),
    });
  });

  it('creates chapter with user input', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVELLA } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(1);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/epilogue.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Epilogue');

    await command.execute('story-id');

    expect(mockStoryFileService.createChapter).toHaveBeenCalledWith('story-id', 'Epilogue');
  });

  it('refreshes tree view on success', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('opens file in editor on success', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    expect(mockVscodeWindow.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/path/chapter-1.md' })
    );
  });

  it('handles user cancellation silently', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    await command.execute('story-id');

    expect(mockStoryFileService.createChapter).not.toHaveBeenCalled();
    expect(mockVscodeWindow.showErrorMessage).not.toHaveBeenCalled();
  });

  it('shows error if story type is not Novel or Novella', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.SHORT_STORY } as any);

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('only available for Novels and Novellas')
    );
  });

  it('shows error if story type is Essay', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.ESSAY } as any);

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('only available for Novels and Novellas')
    );
  });

  it('returns success result on successful creation', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    const result = await command.execute('story-id');

    expect(result.success).toBe(true);
    expect(result.message).toContain('Chapter 1');
  });

  it('returns failure result on error', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockRejectedValue(
      new Error('File already exists')
    );
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    const result = await command.execute('story-id');

    expect(result.success).toBe(false);
    expect(result.message).toContain('File already exists');
  });

  it('returns cancellation result on user cancel', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    const result = await command.execute('story-id');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Cancelled');
  });

  it('validates chapter name - cannot be empty', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    const callArgs = mockVscodeWindow.showInputBox.mock.calls[0][0];
    const validateInput = callArgs.validateInput as (value: string) => string | undefined;

    expect(validateInput('')).toBeDefined();
    expect(validateInput('   ')).toBeDefined();
  });

  it('validates chapter name - allows valid names', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    const callArgs = mockVscodeWindow.showInputBox.mock.calls[0][0];
    const validateInput = callArgs.validateInput as (value: string) => string | undefined;

    expect(validateInput('Chapter 1')).toBeUndefined();
    expect(validateInput('Prologue')).toBeUndefined();
    expect(validateInput('The Journey Begins')).toBeUndefined();
  });

  it('shows error message on story not found', async () => {
    mockStoryRepository.findById.mockReturnValue(undefined);

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Story not found')
    );
  });

  it('returns failure result on story not found', async () => {
    mockStoryRepository.findById.mockReturnValue(undefined);

    const result = await command.execute('story-id');

    expect(result.success).toBe(false);
  });

  it('handles getChapterCount errors gracefully', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL } as any);
    mockStoryFileService.getChapterCount.mockRejectedValue(
      new Error('Failed to read directory')
    );

    const result = await command.execute('story-id');

    expect(result.success).toBe(false);
    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalled();
  });
});
