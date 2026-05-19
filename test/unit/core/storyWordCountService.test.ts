/**
 * Story Word Count Service Tests
 */

import { StoryWordCountService } from '../../../src/core/storyWordCountService';
import { StoryRepository } from '../../../src/db/storyRepository';
import { StoryType } from '../../../src/types';
import { ValidationError } from '../../../src/utils/errorHandler';
import * as fs from 'fs/promises';
import * as path from 'path';

jest.mock('fs/promises');

describe('StoryWordCountService', () => {
  let service: StoryWordCountService;
  let mockRepository: jest.Mocked<StoryRepository>;
  const workspaceRoot = '/workspace';

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      findById: jest.fn(),
      updateWordCount: jest.fn(),
    } as any;

    service = new StoryWordCountService(mockRepository, workspaceRoot);
  });

  describe('updateWordCount', () => {
    it('should update word count for SHORT_STORY', async () => {
      mockRepository.findById.mockReturnValue({
        id: 'story-1',
        displayName: 'My Story',
        type: StoryType.SHORT_STORY,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (fs.readFile as jest.Mock).mockResolvedValue('hello world test');

      const count = await service.updateWordCount('story-1');

      expect(count).toBe(3);
      expect(mockRepository.updateWordCount).toHaveBeenCalledWith('story-1', 3);
    });

    it('should update word count for ESSAY', async () => {
      mockRepository.findById.mockReturnValue({
        id: 'story-1',
        displayName: 'My Essay',
        type: StoryType.ESSAY,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (fs.readFile as jest.Mock).mockResolvedValue('one two three four');

      const count = await service.updateWordCount('story-1');

      expect(count).toBe(4);
      expect(mockRepository.updateWordCount).toHaveBeenCalledWith('story-1', 4);
    });

    it('should sum word counts for NOVEL chapters', async () => {
      mockRepository.findById.mockReturnValue({
        id: 'story-1',
        displayName: 'My Novel',
        type: StoryType.NOVEL,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['chapter-1.md', 'chapter-2.md']);

      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('chapter one words') // 3 words
        .mockResolvedValueOnce('chapter two content'); // 3 words

      const count = await service.updateWordCount('story-1');

      expect(count).toBe(6);
      expect(mockRepository.updateWordCount).toHaveBeenCalledWith('story-1', 6);
    });

    it('should sum word counts for NOVELLA chapters', async () => {
      mockRepository.findById.mockReturnValue({
        id: 'story-1',
        displayName: 'My Novella',
        type: StoryType.NOVELLA,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (fs.readdir as jest.Mock).mockResolvedValue(['chapter-1.md', 'chapter-2.md', 'chapter-3.md']);

      (fs.readFile as jest.Mock)
        .mockResolvedValueOnce('one two') // 2 words
        .mockResolvedValueOnce('three four five') // 3 words
        .mockResolvedValueOnce('six'); // 1 word

      const count = await service.updateWordCount('story-1');

      expect(count).toBe(6);
    });

    it('should throw error if story not found', async () => {
      mockRepository.findById.mockReturnValue(undefined);

      await expect(service.updateWordCount('nonexistent')).rejects.toThrow(ValidationError);
      expect(mockRepository.updateWordCount).not.toHaveBeenCalled();
    });

    it('should handle missing chapters directory', async () => {
      mockRepository.findById.mockReturnValue({
        id: 'story-1',
        displayName: 'New Novel',
        type: StoryType.NOVEL,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      (fs.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      const count = await service.updateWordCount('story-1');

      expect(count).toBe(0);
      expect(mockRepository.updateWordCount).toHaveBeenCalledWith('story-1', 0);
    });
  });

  describe('resolveStoryFiles', () => {
    it('should resolve to story.md for SHORT_STORY', async () => {
      const files = await service.resolveStoryFiles('story-1', StoryType.SHORT_STORY);

      expect(files).toEqual([path.join(workspaceRoot, 'story-1', 'story.md')]);
    });

    it('should resolve to essay.md for ESSAY', async () => {
      const files = await service.resolveStoryFiles('story-1', StoryType.ESSAY);

      expect(files).toEqual([path.join(workspaceRoot, 'story-1', 'essay.md')]);
    });

    it('should resolve all chapter files for NOVEL', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['chapter-1.md', 'chapter-2.md']);

      const files = await service.resolveStoryFiles('story-1', StoryType.NOVEL);

      expect(files).toContain(path.join(workspaceRoot, 'story-1', 'chapters', 'chapter-1.md'));
      expect(files).toContain(path.join(workspaceRoot, 'story-1', 'chapters', 'chapter-2.md'));
    });

    it('should resolve all chapter files for NOVELLA', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue(['chapter-1.md', 'chapter-2.md', 'chapter-3.md']);

      const files = await service.resolveStoryFiles('story-1', StoryType.NOVELLA);

      expect(files.length).toBe(3);
    });

    it('should filter non-markdown files from chapters', async () => {
      (fs.readdir as jest.Mock).mockResolvedValue([
        'chapter-1.md',
        'chapter-2.md',
        'notes.txt',
        'chapter-3.md',
      ]);

      const files = await service.resolveStoryFiles('story-1', StoryType.NOVEL);

      expect(files).toHaveLength(3);
      expect(files.every((f) => f.endsWith('.md'))).toBe(true);
    });

    it('should return empty array if chapters directory does not exist', async () => {
      (fs.readdir as jest.Mock).mockRejectedValue(new Error('ENOENT: no such file'));

      const files = await service.resolveStoryFiles('story-1', StoryType.NOVEL);

      expect(files).toEqual([]);
    });

    it('should throw error for unknown story type', async () => {
      await expect(
        service.resolveStoryFiles('story-1', 'unknown' as StoryType)
      ).rejects.toThrow(ValidationError);
    });
  });
});
