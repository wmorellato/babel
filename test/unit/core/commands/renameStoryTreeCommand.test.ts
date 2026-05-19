/**
 * Rename Story Tree Command Tests
 */

import { RenameStoryTreeCommand } from '../../../../src/core/commands/renameStoryTreeCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { StoryTreeItem } from '../../../../src/views/storyTreeItem';
import { Story, StoryType } from '../../../../src/types/index';
import * as vscode from 'vscode';

describe('RenameStoryTreeCommand', () => {
  let command: RenameStoryTreeCommand;
  let mockRepository: jest.Mocked<StoryRepository>;
  let mockRefreshCallback: jest.Mock;

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
      update: jest.fn(),
    } as any;
    mockRefreshCallback = jest.fn();
    command = new RenameStoryTreeCommand(mockRepository, mockRefreshCallback);
  });

  it('should rename story successfully', async () => {
    jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('New Novel Name' as any);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(true);
    expect(mockRepository.findById).toHaveBeenCalledWith(mockStory.id);
    expect(mockRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'New Novel Name',
      })
    );
    expect(mockRefreshCallback).toHaveBeenCalled();
  });

  it('should cancel rename if user cancels input', async () => {
    jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue(undefined as any);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('cancelled');
    expect(mockRepository.update).not.toHaveBeenCalled();
  });

  it('should trim whitespace from name', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue('  Trimmed Name  ');

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(true);
    expect(mockRepository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        displayName: 'Trimmed Name',
      })
    );
  });

  it('should handle cancelled rename', async () => {
    (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toBe('Rename cancelled');
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
