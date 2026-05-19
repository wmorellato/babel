import * as fs from 'fs';
import * as path from 'path';
import { StoryFileService } from '../../../src/services/storyFileService';
import { GitRepository } from '../../../src/git/gitRepository';

// Mock GitRepository
const mockGitRepository: Partial<GitRepository> = {
  commit: jest.fn().mockResolvedValue(undefined),
};

describe('StoryFileService', () => {
  let service: StoryFileService;
  let tempDir: string;
  let storyDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'temp-' + Date.now());
    storyDir = path.join(tempDir, 'story-id');
    fs.mkdirSync(storyDir, { recursive: true });

    // Create .git directory to make isGitRepository() return true
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });

    service = new StoryFileService(
      mockGitRepository as GitRepository,
      tempDir
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('fileExists', () => {
    it('returns true if file exists', async () => {
      fs.writeFileSync(path.join(storyDir, 'test.md'), 'content');
      const exists = await service.fileExists('story-id', 'test.md');
      expect(exists).toBe(true);
    });

    it('returns false if file does not exist', async () => {
      const exists = await service.fileExists('story-id', 'nonexistent.md');
      expect(exists).toBe(false);
    });
  });

  describe('createFile', () => {
    it('creates empty markdown file', async () => {
      const result = await service.createFile('story-id', 'test.md');
      const filePath = path.join(storyDir, 'test.md');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
      expect(result.filePath).toBe(filePath);
    });

    it('commits to Git after creation', async () => {
      await service.createFile('story-id', 'research.md');
      expect(mockGitRepository.commit).toHaveBeenCalledWith(
        'feat: add file research.md'
      );
    });

    it('throws error if filename is empty', async () => {
      await expect(service.createFile('story-id', '')).rejects.toThrow(
        'Filename cannot be empty'
      );
    });

    it('throws error if filename lacks .md extension', async () => {
      await expect(service.createFile('story-id', 'test.txt')).rejects.toThrow(
        'Filename must end with .md'
      );
    });

    it('throws error if filename contains invalid characters', async () => {
      await expect(service.createFile('story-id', 'test<>.md')).rejects.toThrow(
        'Filename contains invalid characters'
      );
    });

    it('throws error if file already exists', async () => {
      fs.writeFileSync(path.join(storyDir, 'existing.md'), 'content');
      await expect(service.createFile('story-id', 'existing.md')).rejects.toThrow(
        "File 'existing.md' already exists in this story"
      );
    });
  });

  describe('getChapterCount', () => {
    it('returns 0 if no chapters exist', async () => {
      const count = await service.getChapterCount('story-id');
      expect(count).toBe(0);
    });

    it('counts chapter files matching chapter*.md pattern in chapters folder', async () => {
      const chaptersDir = path.join(storyDir, 'chapters');
      fs.mkdirSync(chaptersDir, { recursive: true });
      fs.writeFileSync(path.join(chaptersDir, 'chapter1.md'), '');
      fs.writeFileSync(path.join(chaptersDir, 'chapter2.md'), '');
      fs.writeFileSync(path.join(chaptersDir, 'chapter3.md'), '');
      fs.writeFileSync(path.join(storyDir, 'story.md'), ''); // Should not count

      const count = await service.getChapterCount('story-id');
      expect(count).toBe(3);
    });

    it('handles numeric chapters in any order', async () => {
      const chaptersDir = path.join(storyDir, 'chapters');
      fs.mkdirSync(chaptersDir, { recursive: true });
      fs.writeFileSync(path.join(chaptersDir, 'chapter5.md'), '');
      fs.writeFileSync(path.join(chaptersDir, 'chapter10.md'), '');
      fs.writeFileSync(path.join(chaptersDir, 'chapter2.md'), '');

      const count = await service.getChapterCount('story-id');
      expect(count).toBe(3);
    });
  });

  describe('createChapter', () => {
    it('creates chapter file with markdown heading in chapters folder', async () => {
      const result = await service.createChapter('story-id', 'Chapter 1');
      const filePath = path.join(storyDir, 'chapters', 'chapter-1.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('# Chapter 1\n');
      expect(result.filePath).toBe(filePath);
    });

    it('converts chapter name to lowercase filename with hyphens', async () => {
      await service.createChapter('story-id', 'Chapter Five');
      expect(fs.existsSync(path.join(storyDir, 'chapters', 'chapter-five.md'))).toBe(true);
    });

    it('converts spaces to hyphens', async () => {
      await service.createChapter('story-id', 'The Epilogue');
      expect(fs.existsSync(path.join(storyDir, 'chapters', 'the-epilogue.md'))).toBe(true);
    });

    it('creates chapters folder if it does not exist', async () => {
      const chaptersDir = path.join(storyDir, 'chapters');
      expect(fs.existsSync(chaptersDir)).toBe(false);

      await service.createChapter('story-id', 'Chapter 1');

      expect(fs.existsSync(chaptersDir)).toBe(true);
    });

    it('throws error if chapter already exists', async () => {
      const chaptersDir = path.join(storyDir, 'chapters');
      fs.mkdirSync(chaptersDir, { recursive: true });
      fs.writeFileSync(path.join(chaptersDir, 'epilogue.md'), '');
      await expect(service.createChapter('story-id', 'Epilogue')).rejects.toThrow(
        "File 'epilogue.md' already exists in this story"
      );
    });
  });

  describe('deleteFile', () => {
    it('deletes file from disk', async () => {
      const filePath = path.join(storyDir, 'test.md');
      fs.writeFileSync(filePath, 'content');

      await service.deleteFile('story-id', filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('commits to Git after deletion', async () => {
      const filePath = path.join(storyDir, 'test.md');
      fs.writeFileSync(filePath, 'content');

      await service.deleteFile('story-id', filePath);
      expect(mockGitRepository.commit).toHaveBeenCalledWith(
        'refactor: remove file test.md'
      );
    });

    it('throws error if file does not exist', async () => {
      const filePath = path.join(storyDir, 'nonexistent.md');
      await expect(service.deleteFile('story-id', filePath)).rejects.toThrow(
        'File not found'
      );
    });

    it('throws error if file is outside story folder', async () => {
      const outsidePath = path.join(tempDir, 'outside.md');
      await expect(service.deleteFile('story-id', outsidePath)).rejects.toThrow(
        'Cannot delete files outside story folder'
      );
    });
  });
});
