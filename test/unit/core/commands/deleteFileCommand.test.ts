/**
 * DeleteFileCommand Tests
 * Tests for file deletion command with confirmation dialog
 */

import * as vscode from 'vscode';
import { DeleteFileCommand } from '../../../../src/core/commands/deleteFileCommand';
import { StoryFileService } from '../../../../src/services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../../../src/views/storyTreeDataProvider';
import { Logger } from '../../../../src/utils/logger';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('DeleteFileCommand', () => {
  let command: DeleteFileCommand;
  let mockStoryFileService: jest.Mocked<StoryFileService>;
  let mockTreeDataProvider: jest.Mocked<BabelStoriesTreeDataProvider>;
  let mockVscodeWindow: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock StoryFileService
    mockStoryFileService = {
      deleteFile: jest.fn(),
    } as any;

    // Mock BabelStoriesTreeDataProvider
    mockTreeDataProvider = {
      refresh: jest.fn(),
    } as any;

    // Mock vscode.window
    mockVscodeWindow = {
      showWarningMessage: jest.fn(),
      showErrorMessage: jest.fn(),
    };

    command = new DeleteFileCommand(
      mockStoryFileService,
      mockTreeDataProvider,
      mockVscodeWindow
    );
  });

  it('shows confirmation dialog with filename', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('test.md'),
      expect.any(Object),
      expect.any(String),
      expect.any(String)
    );
  });

  it('deletes file when user confirms', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockStoryFileService.deleteFile).toHaveBeenCalledWith(
      'story-id',
      '/path/test.md'
    );
  });

  it('refreshes tree view after deletion', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('cancels silently when user declines', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockStoryFileService.deleteFile).not.toHaveBeenCalled();
  });

  it('shows error message on deletion failure', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockRejectedValue(new Error('File not found'));

    await command.execute('story-id', '/path/test.md');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('File not found')
    );
  });

  it('refreshes tree anyway on deletion failure', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockRejectedValue(new Error('File not found'));

    await command.execute('story-id', '/path/test.md');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('returns success result on successful deletion', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    const result = await command.execute('story-id', '/path/test.md');

    expect(result.success).toBe(true);
    expect(result.message).toContain('test.md');
  });

  it('returns success result on cancellation', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue(undefined);

    const result = await command.execute('story-id', '/path/test.md');

    expect(result.success).toBe(true);
    expect(result.message).toBe('Cancelled');
  });

  it('returns failure result on deletion error', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockRejectedValue(new Error('Permission denied'));

    const result = await command.execute('story-id', '/path/test.md');

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permission denied');
  });
});
