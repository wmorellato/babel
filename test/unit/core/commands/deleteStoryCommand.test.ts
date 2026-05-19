/**
 * Delete Story Command Tests
 */

import { DeleteStoryCommand } from '../../../../src/core/commands/deleteStoryCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { Story, StoryType } from '../../../../src/types/index';
import * as vscode from 'vscode';
import * as fs from 'fs';

jest.mock('fs');

describe('DeleteStoryCommand', () => {
  let command: DeleteStoryCommand;
  let mockRepository: jest.Mocked<StoryRepository>;
  let mockRefreshCallback: jest.Mock;
  const workspaceRoot = '/workspace';

  const mockStory: Story = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    displayName: 'My Novel',
    type: StoryType.NOVEL,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
  };

  const mockTreeItem: any = {
    storyId: mockStory.id,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockRepository = {
      findById: jest.fn().mockReturnValue(mockStory),
      delete: jest.fn(),
    } as any;
    mockRefreshCallback = jest.fn();
    command = new DeleteStoryCommand(mockRepository, workspaceRoot, mockRefreshCallback);
  });

  it('should soft-delete story successfully', async () => {
    jest.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Delete' as any);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.renameSync as jest.Mock).mockImplementation(() => {});

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(true);
    expect(mockRepository.delete).toHaveBeenCalledWith(mockStory.id);
    expect(fs.renameSync).toHaveBeenCalledWith(
      '/workspace/123e4567-e89b-12d3-a456-426614174000',
      '/workspace/.hidden-123e4567-e89b-12d3-a456-426614174000'
    );
    expect(mockRefreshCallback).toHaveBeenCalled();
  });

  it('should cancel if user does not confirm', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue(undefined);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('cancelled');
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it('should handle missing story folder', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');
    (fs.existsSync as jest.Mock).mockReturnValue(false);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(true);
    expect(fs.renameSync).not.toHaveBeenCalled();
  });

  it('should show error if rename fails', async () => {
    (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Delete');
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.renameSync as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('Permission');
  });

  it('should return error if story not found', async () => {
    mockRepository.findById.mockReturnValue(undefined);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('not found');
  });

  it('should return error if treeItem has no storyId', async () => {
    const invalidItem = {};

    const result = await command.execute(invalidItem);

    expect(result.success).toBe(false);
  });
});
