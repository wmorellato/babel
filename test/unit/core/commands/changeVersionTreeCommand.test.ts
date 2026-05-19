/**
 * Change Version Tree Command Tests
 */

import { ChangeVersionTreeCommand } from '../../../../src/core/commands/changeVersionTreeCommand';
import { VersionRepository } from '../../../../src/db/versionRepository';
import * as vscode from 'vscode';

jest.mock('../../../../src/git/gitRepository');
jest.mock('../../../../src/core/versionSwitcher');

describe('ChangeVersionTreeCommand', () => {
  let command: ChangeVersionTreeCommand;
  let mockVersionRepository: jest.Mocked<VersionRepository>;
  let mockRefreshCallback: jest.Mock;
  const workspaceRoot = '/workspace';

  const mockVersions = [
    {
      id: 'v1',
      storyId: '123e4567-e89b-12d3-a456-426614174000',
      gitBranch: 'draft1',
      createdAt: new Date('2026-01-01'),
      deletedAt: null,
    },
    {
      id: 'v2',
      storyId: '123e4567-e89b-12d3-a456-426614174000',
      gitBranch: 'draft-2',
      createdAt: new Date('2026-01-05'),
      deletedAt: null,
    },
  ];

  const mockTreeItem: any = {
    storyId: '123e4567-e89b-12d3-a456-426614174000',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionRepository = {
      findByStoryId: jest.fn().mockReturnValue(mockVersions),
    } as any;
    mockRefreshCallback = jest.fn();

    // Mock VersionSwitcher
    const { VersionSwitcher } = require('../../../../src/core/versionSwitcher');
    VersionSwitcher.mockImplementation(() => ({
      switchToVersion: jest.fn().mockResolvedValue(undefined),
    }));

    command = new ChangeVersionTreeCommand(mockVersionRepository, workspaceRoot, mockRefreshCallback);
  });

  it('should switch version successfully', async () => {
    jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'draft-2',
      version: mockVersions[1],
    } as any);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(true);
    expect(mockRefreshCallback).toHaveBeenCalled();
  });

  it('should cancel if user cancels QuickPick', async () => {
    (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('cancelled');
  });

  it('should show error if no versions available', async () => {
    mockVersionRepository.findByStoryId.mockReturnValue([]);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('No versions');
  });

  it('should handle version switch conflicts', async () => {
    const { VersionSwitcher } = require('../../../../src/core/versionSwitcher');
    VersionSwitcher.mockImplementation(() => ({
      switchToVersion: jest.fn().mockRejectedValue(new Error('conflict detected')),
    }));

    jest.spyOn(vscode.window, 'showQuickPick').mockResolvedValue({
      label: 'draft-2',
      version: mockVersions[1],
    } as any);

    const result = await command.execute(mockTreeItem);

    expect(result.success).toBe(false);
    expect(result.message).toContain('conflict');
  });

  it('should return error if treeItem has no storyId', async () => {
    const invalidItem = {};

    const result = await command.execute(invalidItem);

    expect(result.success).toBe(false);
  });
});
