/**
 * AddFileCommand Tests
 * Tests for file creation command with VSCode integration
 */

import * as vscode from 'vscode';
import { AddFileCommand } from '../../../../src/core/commands/addFileCommand';
import { StoryFileService } from '../../../../src/services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../../../src/views/storyTreeDataProvider';
import { Logger } from '../../../../src/utils/logger';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('AddFileCommand', () => {
  let command: AddFileCommand;
  let mockStoryFileService: jest.Mocked<StoryFileService>;
  let mockTreeDataProvider: jest.Mocked<BabelStoriesTreeDataProvider>;
  let mockVscodeWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock StoryFileService
    mockStoryFileService = {
      createFile: jest.fn(),
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

    command = new AddFileCommand(
      mockStoryFileService,
      mockTreeDataProvider,
      mockVscodeWindow
    );
  });

  it('prompts user for filename', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockVscodeWindow.showInputBox).toHaveBeenCalledWith({
      prompt: 'File name (including .md)?',
      validateInput: expect.any(Function),
    });
  });

  it('creates file with provided name', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockStoryFileService.createFile).toHaveBeenCalledWith('story-id', 'test.md');
  });

  it('refreshes tree view on success', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('opens file in editor on success', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockVscodeWindow.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/path/test.md' })
    );
  });

  it('shows error on creation failure', async () => {
    mockStoryFileService.createFile.mockRejectedValue(
      new Error('Filename cannot be empty')
    );
    mockVscodeWindow.showInputBox.mockResolvedValue('');

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Filename cannot be empty')
    );
  });

  it('handles user cancellation silently', async () => {
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    await command.execute('story-id');

    expect(mockStoryFileService.createFile).not.toHaveBeenCalled();
    expect(mockVscodeWindow.showErrorMessage).not.toHaveBeenCalled();
  });

  it('validates empty filename', () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    // Get the validateInput function from showInputBox call
    command.execute('story-id');

    const callArgs = mockVscodeWindow.showInputBox.mock.calls[0][0];
    const validateInput = callArgs.validateInput as (value: string) => string | undefined;

    expect(validateInput('')).toBeDefined();
    expect(validateInput('   ')).toBeDefined();
  });

  it('validates filename must end with .md', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    // Get the validateInput function
    await command.execute('story-id');

    const callArgs = mockVscodeWindow.showInputBox.mock.calls[0][0];
    const validateInput = callArgs.validateInput as (value: string) => string | undefined;

    expect(validateInput('test.txt')).toBeDefined();
    expect(validateInput('test')).toBeDefined();
    expect(validateInput('test.md')).toBeUndefined();
  });

  it('validates invalid filename characters', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    // Get the validateInput function
    await command.execute('story-id');

    const callArgs = mockVscodeWindow.showInputBox.mock.calls[0][0];
    const validateInput = callArgs.validateInput as (value: string) => string | undefined;

    expect(validateInput('test<file>.md')).toBeDefined();
    expect(validateInput('test|file.md')).toBeDefined();
    expect(validateInput('test\\file.md')).toBeDefined();
    expect(validateInput('test:file.md')).toBeDefined();
    expect(validateInput('test*.md')).toBeDefined();
    expect(validateInput('test?.md')).toBeDefined();
    expect(validateInput('test"file.md')).toBeDefined();
  });

  it('returns success result on successful creation', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    const result = await command.execute('story-id');

    expect(result.success).toBe(true);
    expect(result.message).toContain('test.md');
  });

  it('returns failure result on error', async () => {
    mockStoryFileService.createFile.mockRejectedValue(
      new Error('File already exists')
    );
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    const result = await command.execute('story-id');

    expect(result.success).toBe(false);
    expect(result.message).toContain('File already exists');
  });

  it('returns cancellation result on user cancel', async () => {
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    const result = await command.execute('story-id');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Cancelled');
  });
});
