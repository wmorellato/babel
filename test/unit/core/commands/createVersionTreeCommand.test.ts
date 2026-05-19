/**
 * Create Version Tree Command Tests
 */

import { CreateVersionTreeCommand } from '../../../../src/core/commands/createVersionTreeCommand';
import { VersionRepository } from '../../../../src/db/versionRepository';
import * as vscode from 'vscode';

jest.mock('../../../../src/git/gitRepository');

describe('CreateVersionTreeCommand', () => {
  let command: CreateVersionTreeCommand;
  let mockVersionRepository: jest.Mocked<VersionRepository>;
  let mockRefreshCallback: jest.Mock;
  const workspaceRoot = '/workspace';

  const mockTreeItem: any = {
    storyId: '123e4567-e89b-12d3-a456-426614174000',
  };

  const existingVersions = [
    {
      id: 'v1',
      storyId: '123e4567-e89b-12d3-a456-426614174000',
      gitBranch: 'draft1',
      createdAt: new Date('2026-01-01'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockVersionRepository = {
      findByStoryId: jest.fn().mockReturnValue(existingVersions),
      create: jest.fn(),
    } as any;
    mockRefreshCallback = jest.fn();

    // Mock GitRepository constructor
    const { GitRepository } = require('../../../../src/git/gitRepository');
    GitRepository.mockImplementation(() => ({
      createBranch: jest.fn().mockResolvedValue({ branch: 'new-version', created: true }),
      deleteBranch: jest.fn().mockResolvedValue({ branch: 'new-version', deleted: true }),
    }));

    command = new CreateVersionTreeCommand(mockVersionRepository, workspaceRoot, mockRefreshCallback);
  });

  describe('execute', () => {
    it('should successfully create a new version', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('new-version');

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(true);
      expect(mockVersionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          storyId: '123e4567-e89b-12d3-a456-426614174000',
          gitBranch: 'new-version',
        })
      );
      expect(mockRefreshCallback).toHaveBeenCalled();
    });

    it('should return error if treeItem has no storyId', async () => {
      const invalidItem = {};

      const result = await command.execute(invalidItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid story');
    });

    it('should cancel silently if user cancels input box', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled');
      expect(mockVersionRepository.create).not.toHaveBeenCalled();
    });

    it('should trim whitespace from version name', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('  new-version  ');

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(true);
      expect(mockVersionRepository.create).toHaveBeenCalled();
    });

    it('should reject duplicate version name for the same story', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('draft1'); // already exists

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already exists');
      expect(mockVersionRepository.create).not.toHaveBeenCalled();
    });

    it('should handle git branch creation failure', async () => {
      const { GitRepository } = require('../../../../src/git/gitRepository');
      GitRepository.mockImplementation(() => ({
        createBranch: jest.fn().mockRejectedValue(new Error('branch already exists')),
        deleteBranch: jest.fn(),
      }));

      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('new-version');
      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
      expect(mockVersionRepository.create).not.toHaveBeenCalled();
    });

    it('should handle database creation failure and attempt rollback', async () => {
      const { GitRepository } = require('../../../../src/git/gitRepository');
      const mockGitInstance = {
        createBranch: jest.fn().mockResolvedValue({ branch: 'new-version', created: true }),
        deleteBranch: jest.fn().mockResolvedValue({ branch: 'new-version', deleted: true }),
      };
      GitRepository.mockImplementation(() => mockGitInstance);

      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('new-version');
      mockVersionRepository.create.mockImplementation(() => {
        throw new Error('database error');
      });

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
      // Verify rollback was attempted
      expect(mockGitInstance.deleteBranch).toHaveBeenCalledWith('new-version', true);
    });

    it('should handle rollback failure gracefully', async () => {
      const { GitRepository } = require('../../../../src/git/gitRepository');
      const mockGitInstance = {
        createBranch: jest.fn().mockResolvedValue({ branch: 'new-version', created: true }),
        deleteBranch: jest.fn().mockRejectedValue(new Error('cannot delete')),
      };
      GitRepository.mockImplementation(() => mockGitInstance);

      (vscode.window.showInputBox as jest.Mock).mockResolvedValue('new-version');
      mockVersionRepository.create.mockImplementation(() => {
        throw new Error('database error');
      });

      const result = await command.execute(mockTreeItem);

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed');
    });
  });
});
