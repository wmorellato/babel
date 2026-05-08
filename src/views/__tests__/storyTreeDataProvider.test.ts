import { BabelStoriesTreeDataProvider } from '../storyTreeDataProvider';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';
import { StoryTreeItem } from '../storyTreeItem';
import { FileTreeItem } from '../fileTreeItem';
import { Story, StoryType } from '../../types/index';

describe('BabelStoriesTreeDataProvider', () => {
  let provider: BabelStoriesTreeDataProvider;
  let storyRepository: jest.Mocked<StoryRepository>;
  let versionRepository: jest.Mocked<VersionRepository>;
  let gitRepository: jest.Mocked<GitRepository>;

  beforeEach(() => {
    storyRepository = {
      findAll: jest.fn(() => []),
      findById: jest.fn(),
    } as any;

    versionRepository = {
      findByStoryId: jest.fn(() => []),
    } as any;

    gitRepository = {} as any;

    provider = new BabelStoriesTreeDataProvider(
      storyRepository,
      versionRepository,
      gitRepository,
      '/workspace'
    );
  });

  describe('getParent', () => {
    it('returns null for StoryTreeItem (root level)', () => {
      const story: Story = {
        id: '12345678-1234-1234-1234-123456789012',
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        createdAt: new Date(),
        currentWordCount: 1000,
        updatedAt: new Date(),
      };
      const storyItem = new StoryTreeItem(story);

      const parent = provider.getParent(storyItem);
      expect(parent).toBeNull();
    });

    it('returns StoryTreeItem for FileTreeItem (file is child of story)', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const story: Story = {
        id: storyId,
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        createdAt: new Date(),
        currentWordCount: 1000,
        updatedAt: new Date(),
      };

      storyRepository.findById.mockReturnValue(story);
      versionRepository.findByStoryId.mockReturnValue([]);

      const fileItem = new FileTreeItem('chapter1.md', '/workspace/storyId/chapter1.md', storyId);
      const parent = provider.getParent(fileItem);

      expect(parent).toBeInstanceOf(StoryTreeItem);
      expect((parent as StoryTreeItem).storyId).toBe(storyId);
    });

    it('returns null for FileTreeItem if story not found', () => {
      storyRepository.findById.mockReturnValue(undefined);

      const fileItem = new FileTreeItem('chapter1.md', '/workspace/storyId/chapter1.md', 'nonexistent');
      const parent = provider.getParent(fileItem);

      expect(parent).toBeNull();
    });
  });

  describe('getFileTreeItem', () => {
    it('returns FileTreeItem if file exists in story', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const filePath = '/workspace/12345678-1234-1234-1234-123456789012/chapter1.md';

      // Mock getFilesForStory to return a file
      jest.spyOn(provider as any, 'getFilesForStory').mockReturnValue([
        new FileTreeItem('chapter1.md', filePath, storyId),
      ]);

      const result = provider.getFileTreeItem(storyId, filePath);

      expect(result).toBeInstanceOf(FileTreeItem);
      expect(result?.resourceUri?.fsPath).toBe(filePath);
    });

    it('returns null if file not found in story', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const filePath = '/workspace/12345678-1234-1234-1234-123456789012/notfound.md';

      jest.spyOn(provider as any, 'getFilesForStory').mockReturnValue([
        new FileTreeItem('chapter1.md', '/workspace/12345678-1234-1234-1234-123456789012/chapter1.md', storyId),
      ]);

      const result = provider.getFileTreeItem(storyId, filePath);

      expect(result).toBeNull();
    });
  });
});
