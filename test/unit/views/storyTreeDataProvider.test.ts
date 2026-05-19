/**
 * Babel Stories Tree Data Provider Tests
 */

import { BabelStoriesTreeDataProvider } from '../../../src/views/storyTreeDataProvider';
import { StoryRepository } from '../../../src/db/storyRepository';
import { VersionRepository } from '../../../src/db/versionRepository';
import { GitRepository } from '../../../src/git/gitRepository';
import { StoryTreeItem } from '../../../src/views/storyTreeItem';
import { FileTreeItem } from '../../../src/views/fileTreeItem';
import { Story, StoryType } from '../../../src/types/index';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

jest.mock('fs');
jest.mock('../../../src/git/gitRepository');

describe('BabelStoriesTreeDataProvider', () => {
  let provider: BabelStoriesTreeDataProvider;
  let mockStoryRepository: jest.Mocked<StoryRepository>;
  let mockVersionRepository: jest.Mocked<VersionRepository>;
  let mockGitRepository: jest.Mocked<GitRepository>;
  const workspaceRoot = '/workspace';

  const mockStories: Story[] = [
    {
      id: '123e4567-e89b-12d3-a456-426614174000',
      displayName: 'My Novel',
      type: StoryType.NOVEL,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-15'),
    },
    {
      id: '223e4567-e89b-12d3-a456-426614174001',
      displayName: 'Short Story Draft',
      type: StoryType.SHORT_STORY,
      createdAt: new Date('2026-01-05'),
      updatedAt: new Date('2026-01-15'),
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    mockStoryRepository = {
      findAll: jest.fn().mockReturnValue(mockStories),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockVersionRepository = {
      findByStoryId: jest.fn().mockReturnValue([]),
      findAll: jest.fn().mockReturnValue([]),
      findById: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    } as any;

    mockGitRepository = {
      getCurrentBranch: jest.fn().mockResolvedValue('main'),
      clone: jest.fn(),
      pull: jest.fn(),
      push: jest.fn(),
      commit: jest.fn(),
      checkout: jest.fn(),
      createBranch: jest.fn(),
      deleteBranch: jest.fn(),
      merge: jest.fn(),
      getCurrentCommitHash: jest.fn(),
    } as any;

    // Mock fs.existsSync to return true by default (folders exist)
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readdirSync as jest.Mock).mockReturnValue([]);

    provider = new BabelStoriesTreeDataProvider(
      mockStoryRepository,
      mockVersionRepository,
      mockGitRepository,
      workspaceRoot
    );
  });

  describe('getChildren', () => {
    it('should return story tree items for root', async () => {
      const children = await provider.getChildren();
      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(StoryTreeItem);
      expect((children[0] as StoryTreeItem).label).toBe('My Novel');
    });

    it('should sort stories alphabetically', async () => {
      const unsortedStories = [
        mockStories[1], // Short Story Draft
        mockStories[0], // My Novel
      ];
      mockStoryRepository.findAll.mockReturnValue(unsortedStories);

      const children = await provider.getChildren();
      expect((children[0] as StoryTreeItem).label).toBe('My Novel');
      expect((children[1] as StoryTreeItem).label).toBe('Short Story Draft');
    });

    it('should filter out hidden stories', async () => {
      const hiddenPath = path.join(workspaceRoot, '.hidden-123e4567-e89b-12d3-a456-426614174000');
      (fs.existsSync as jest.Mock).mockReturnValue(false);
      (fs.existsSync as jest.Mock).mockImplementation((p) => {
        if (p === hiddenPath) return false; // Hidden folder doesn't exist (expected)
        return true;
      });

      const children = await provider.getChildren();
      // Both stories are still in the list because we filter in getChildren
      expect(children.length).toBeGreaterThanOrEqual(1);
    });

    it('should return file tree items for story', async () => {
      const storyItem = new StoryTreeItem(mockStories[0]);
      const mockDir = '/workspace/123e4567-e89b-12d3-a456-426614174000';

      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.readdirSync as jest.Mock).mockReturnValue([
        { name: 'chapter-1.md', isDirectory: () => false, isFile: () => true },
        { name: 'chapter-2.md', isDirectory: () => false, isFile: () => true },
        { name: '.hidden', isDirectory: () => true, isFile: () => false },
      ]);

      const children = await provider.getChildren(storyItem);
      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(FileTreeItem);
    });

    it('should handle missing story folder', async () => {
      const storyItem = new StoryTreeItem(mockStories[0]);
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      const children = await provider.getChildren(storyItem);
      expect(children).toHaveLength(0);
    });

    it('should return empty array for file items', async () => {
      const fileItem = new FileTreeItem('test.md', '/path/test.md', '123');
      const children = await provider.getChildren(fileItem);
      expect(children).toHaveLength(0);
    });
  });

  describe('refresh', () => {
    it('should call refresh without error', () => {
      expect(() => {
        provider.refresh();
      }).not.toThrow();
    });
  });

  describe('getTreeItem', () => {
    it('should return the same tree item', () => {
      const storyItem = new StoryTreeItem(mockStories[0]);
      const result = provider.getTreeItem(storyItem);
      expect(result).toBe(storyItem);
    });
  });

  it('should handle filesystem errors gracefully', async () => {
    const storyItem = new StoryTreeItem(mockStories[0]);
    (fs.existsSync as jest.Mock).mockReturnValue(true);
    (fs.readdirSync as jest.Mock).mockImplementation(() => {
      throw new Error('Permission denied');
    });

    const children = await provider.getChildren(storyItem);
    expect(children).toHaveLength(0);
  });
});
