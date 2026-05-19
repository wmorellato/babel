/**
 * Word Count Integration Test
 * Demonstrates the complete workflow: file changes → word count update → database persistence
 */

import { StoryWordCountService } from '../../src/core/storyWordCountService';
import { StoryRepository } from '../../src/db/storyRepository';
import { StoryType } from '../../src/types';
import { AutoCommitHandler } from '../../src/core/autoCommitHandler';
import { GitRepository } from '../../src/git/gitRepository';
import * as fs from 'fs';
import * as path from 'path';

describe('Word Count Integration', () => {
  let testRepoPath: string;
  let storyPath: string;
  let gitRepository: GitRepository;
  let storyRepository: StoryRepository;
  let wordCountService: StoryWordCountService;
  let autoCommitHandler: AutoCommitHandler;

  beforeEach(async () => {
    // Create unique test directory
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-word-count-integration-${timestamp}-${testId}`);
    storyPath = path.join(testRepoPath, 'story-123');

    // Create directories
    if (!fs.existsSync(storyPath)) {
      fs.mkdirSync(storyPath, { recursive: true });
    }

    // Initialize git repository
    gitRepository = new GitRepository(storyPath);
    await gitRepository.init();
    await gitRepository.createInitialCommit('Initial commit');

    // Create in-memory mock story repository
    storyRepository = {
      create: jest.fn(),
      findAll: jest.fn().mockReturnValue([]),
      findById: jest.fn().mockReturnValue({
        id: 'story-123',
        displayName: 'Test Story',
        type: StoryType.SHORT_STORY,
        currentWordCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
      findByType: jest.fn().mockReturnValue([]),
      update: jest.fn(),
      updateWordCount: jest.fn(),
      delete: jest.fn(),
      getDb: jest.fn(),
    } as any;

    // Create services
    wordCountService = new StoryWordCountService(storyRepository, testRepoPath);
    autoCommitHandler = new AutoCommitHandler(gitRepository);
  });

  afterEach(() => {
    // Cleanup
    autoCommitHandler.stopWatching();
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  it('should update word count when file changes for SHORT_STORY', async () => {
    const storyFile = path.join(storyPath, 'story.md');
    fs.writeFileSync(storyFile, 'Initial story content');

    // Create the story file
    await gitRepository.addFile('story.md', 'Initial story content');

    // Update word count
    const wordCount = await wordCountService.updateWordCount('story-123');

    // Verify count is correct (3 words)
    expect(wordCount).toBe(3);

    // Verify repository was called to persist the count
    expect(storyRepository.updateWordCount).toHaveBeenCalledWith('story-123', 3);
  });

  it('should invoke callback when file changes via AutoCommitHandler', async () => {
    const storyFile = path.join(storyPath, 'story.md');
    fs.writeFileSync(storyFile, 'Initial content');
    await gitRepository.addFile('story.md', 'Initial content');

    // Create callback that will be invoked
    const mockCallback = jest.fn().mockResolvedValue(undefined);

    // Set up the handler with callback
    autoCommitHandler.setFileChangedCallback('story-123', mockCallback);

    // Start watching
    await autoCommitHandler.watch(storyPath);

    // Modify the file
    fs.writeFileSync(storyFile, 'Initial content with more words added');

    // Wait for debounce and callback
    await new Promise((resolve) => setTimeout(resolve, 1500));

    autoCommitHandler.stopWatching();

    // Verify callback was invoked with word count
    expect(mockCallback).toHaveBeenCalledWith('story-123', expect.any(Number));
  });

  it('should handle NOVEL with multiple chapters', async () => {
    // Update repository to return NOVEL type
    (storyRepository.findById as jest.Mock).mockReturnValue({
      id: 'story-123',
      displayName: 'Test Novel',
      type: StoryType.NOVEL,
      currentWordCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const chaptersDir = path.join(storyPath, 'chapters');
    fs.mkdirSync(chaptersDir, { recursive: true });

    // Create chapter files
    const chapter1 = path.join(chaptersDir, 'chapter-1.md');
    const chapter2 = path.join(chaptersDir, 'chapter-2.md');
    fs.writeFileSync(chapter1, 'Chapter one content here');
    fs.writeFileSync(chapter2, 'Chapter two with more content words');

    await gitRepository.addFile('chapters/chapter-1.md', 'Chapter one content here');
    await gitRepository.addFile('chapters/chapter-2.md', 'Chapter two with more content words');

    // Update word count
    const wordCount = await wordCountService.updateWordCount('story-123');

    // Should sum both chapters (4 + 6 = 10 words)
    expect(wordCount).toBe(10);

    // Verify persistence
    expect(storyRepository.updateWordCount).toHaveBeenCalledWith('story-123', 10);
  });

  it('should update database when word count changes', async () => {
    const storyFile = path.join(storyPath, 'story.md');

    // First save with 10 words
    fs.writeFileSync(storyFile, 'one two three four five six seven eight nine ten');
    await gitRepository.addFile('story.md', 'one two three four five six seven eight nine ten');

    const count1 = await wordCountService.updateWordCount('story-123');
    expect(count1).toBe(10);
    expect(storyRepository.updateWordCount).toHaveBeenCalledWith('story-123', 10);

    // Update the file with more words
    fs.writeFileSync(storyFile, 'one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen');

    const count2 = await wordCountService.updateWordCount('story-123');
    expect(count2).toBe(15);
    expect(storyRepository.updateWordCount).toHaveBeenCalledWith('story-123', 15);

    // Verify updateWordCount was called twice
    expect(storyRepository.updateWordCount).toHaveBeenCalledTimes(2);
  });

  it('should handle missing story gracefully', async () => {
    (storyRepository.findById as jest.Mock).mockReturnValue(undefined);

    await expect(wordCountService.updateWordCount('nonexistent')).rejects.toThrow();

    // Verify repository was NOT updated
    expect(storyRepository.updateWordCount).not.toHaveBeenCalled();
  });

  it('should handle missing chapter directory for NOVEL', async () => {
    (storyRepository.findById as jest.Mock).mockReturnValue({
      id: 'story-123',
      displayName: 'Test Novel',
      type: StoryType.NOVEL,
      currentWordCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Don't create chapters directory - it's missing

    const wordCount = await wordCountService.updateWordCount('story-123');

    // Should return 0 for missing chapters
    expect(wordCount).toBe(0);
    expect(storyRepository.updateWordCount).toHaveBeenCalledWith('story-123', 0);
  });
});
