/**
 * Story File Management Integration Tests
 * Tests the full end-to-end workflow with real Git operations
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { StoryFileService } from '../../../src/services/storyFileService';
import { GitRepository } from '../../../src/git/gitRepository';
import { StoryRepository } from '../../../src/db/storyRepository';
import { createTestDatabase } from '../../helpers/database';
import { StoryType } from '../../../src/types';

describe('Story File Management Integration', () => {
  let workspaceRoot: string;
  let storyId: string;
  let storyDir: string;
  let gitRepository: GitRepository;
  let storyRepository: any;
  let storyFileService: StoryFileService;

  beforeAll(() => {
    // Create temporary workspace
    workspaceRoot = path.join(__dirname, `.temp-storyfile-integration-${Date.now()}`);

    // Create workspace directory
    if (!fs.existsSync(workspaceRoot)) {
      fs.mkdirSync(workspaceRoot, { recursive: true });
    }

    // Initialize git repo with user config
    try {
      execSync('git init', { cwd: workspaceRoot, stdio: 'pipe' });
      execSync('git config user.email "test@test.com"', {
        cwd: workspaceRoot,
        stdio: 'pipe',
      });
      execSync('git config user.name "Test User"', {
        cwd: workspaceRoot,
        stdio: 'pipe',
      });
    } catch (error) {
      console.error('Failed to initialize git repo:', error);
      throw error;
    }

    gitRepository = new GitRepository(workspaceRoot);
  });

  beforeEach(async () => {
    // Create database and repositories
    const database = createTestDatabase();
    storyRepository = new StoryRepository(database);

    // Create unique story ID for this test
    storyId = 'test-story-' + Date.now();
    storyDir = path.join(workspaceRoot, storyId);
    fs.mkdirSync(storyDir, { recursive: true });

    // Create story in database with dates
    const now = new Date();
    storyRepository.create({
      id: storyId,
      displayName: 'Test Story',
      type: StoryType.NOVEL,
      createdAt: now,
      updatedAt: now,
    });

    // Create service
    storyFileService = new StoryFileService(gitRepository, workspaceRoot);
  });

  afterAll(() => {
    // Clean up workspace
    if (fs.existsSync(workspaceRoot)) {
      fs.rmSync(workspaceRoot, { recursive: true, force: true });
    }
  });

  it('creates empty file and commits to Git', async () => {
    const result = await storyFileService.createFile(storyId, 'research.md');

    // Verify file exists and is empty
    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, 'utf-8')).toBe('');

    // Verify commit exists
    const log = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    expect(log).toContain('feat: add file research.md');
  });

  it('creates chapter with heading and commits', async () => {
    const result = await storyFileService.createChapter(storyId, 'Chapter 1');

    // Verify file exists with heading
    expect(fs.existsSync(result.filePath)).toBe(true);
    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toBe('# Chapter 1\n');

    // Verify commit
    const log = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    expect(log).toContain('feat: add chapter Chapter 1');
  });

  it('deletes file and commits deletion', async () => {
    // Create file first
    const result = await storyFileService.createFile(storyId, 'temp.md');
    expect(fs.existsSync(result.filePath)).toBe(true);

    // Delete it
    await storyFileService.deleteFile(storyId, result.filePath);
    expect(fs.existsSync(result.filePath)).toBe(false);

    // Verify deletion commit
    const log = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    expect(log).toContain('refactor: remove file temp.md');
  });

  it('handles multiple files in sequence', async () => {
    // Add file
    const file1 = await storyFileService.createFile(storyId, 'scene1.md');
    expect(fs.existsSync(file1.filePath)).toBe(true);

    // Add chapter
    const chapter1 = await storyFileService.createChapter(storyId, 'Chapter 1');
    expect(fs.existsSync(chapter1.filePath)).toBe(true);

    // Add another file
    const file2 = await storyFileService.createFile(storyId, 'scene2.md');
    expect(fs.existsSync(file2.filePath)).toBe(true);

    // Delete first file
    await storyFileService.deleteFile(storyId, file1.filePath);
    expect(fs.existsSync(file1.filePath)).toBe(false);

    // Verify all commits in order
    const log = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    expect(log).toContain('feat: add file scene1.md');
    expect(log).toContain('feat: add chapter Chapter 1');
    expect(log).toContain('feat: add file scene2.md');
    expect(log).toContain('refactor: remove file scene1.md');
  });

  it('counts chapters correctly', async () => {
    expect(await storyFileService.getChapterCount(storyId)).toBe(0);

    // Create chapter files in chapters folder
    const chaptersDir = path.join(storyDir, 'chapters');
    fs.mkdirSync(chaptersDir, { recursive: true });

    fs.writeFileSync(path.join(chaptersDir, 'chapter1.md'), '');
    expect(await storyFileService.getChapterCount(storyId)).toBe(1);

    fs.writeFileSync(path.join(chaptersDir, 'chapter2.md'), '');
    expect(await storyFileService.getChapterCount(storyId)).toBe(2);

    // Create non-chapter file (should not count)
    await storyFileService.createFile(storyId, 'notes.md');
    expect(await storyFileService.getChapterCount(storyId)).toBe(2);
  });

  it('preserves chapter count across multiple operations', async () => {
    // Create multiple chapters in chapters folder
    const chaptersDir = path.join(storyDir, 'chapters');
    fs.mkdirSync(chaptersDir, { recursive: true });

    fs.writeFileSync(path.join(chaptersDir, 'chapter1.md'), '# Prologue\n');
    fs.writeFileSync(path.join(chaptersDir, 'chapter2.md'), '# Chapter 1\n');
    fs.writeFileSync(path.join(chaptersDir, 'chapter3.md'), '# Chapter 2\n');
    expect(await storyFileService.getChapterCount(storyId)).toBe(3);

    // Add non-chapter files
    await storyFileService.createFile(storyId, 'outline.md');
    await storyFileService.createFile(storyId, 'notes.md');

    // Chapter count should still be 3
    expect(await storyFileService.getChapterCount(storyId)).toBe(3);

    // Verify chapters exist in chapters folder
    const chaptersFiles = fs.readdirSync(chaptersDir);
    expect(chaptersFiles).toContain('chapter1.md');
    expect(chaptersFiles).toContain('chapter2.md');
    expect(chaptersFiles).toContain('chapter3.md');

    // Verify other files exist in story root
    const storyFiles = fs.readdirSync(storyDir);
    expect(storyFiles).toContain('outline.md');
    expect(storyFiles).toContain('notes.md');
  });

  it('handles chapter name normalization correctly', async () => {
    const result = await storyFileService.createChapter(storyId, 'Chapter Ten');
    expect(fs.existsSync(result.filePath)).toBe(true);

    const fileName = path.basename(result.filePath);
    expect(fileName).toBe('chapter-ten.md');

    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toBe('# Chapter Ten\n');
  });

  it('enforces filename validation', async () => {
    // Get initial commit count
    const initialLog = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    const initialCount = initialLog.split('\n').filter((l) => l.length > 0).length;

    // Empty filename
    await expect(
      storyFileService.createFile(storyId, '')
    ).rejects.toThrow('Filename cannot be empty');

    // Missing .md extension
    await expect(
      storyFileService.createFile(storyId, 'test.txt')
    ).rejects.toThrow('Filename must end with .md');

    // Invalid characters
    await expect(
      storyFileService.createFile(storyId, 'test<>.md')
    ).rejects.toThrow('Filename contains invalid characters');

    // No new commits should have been made for failed operations
    const log = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    const finalCount = log.split('\n').filter((l) => l.length > 0).length;
    expect(finalCount).toBe(initialCount);
  });

  it('prevents duplicate file creation', async () => {
    // Create file
    await storyFileService.createFile(storyId, 'unique.md');

    // Attempt duplicate
    await expect(
      storyFileService.createFile(storyId, 'unique.md')
    ).rejects.toThrow("File 'unique.md' already exists in this story");
  });

  it('creates consistent file paths across operations', async () => {
    const filePath1 = (
      await storyFileService.createFile(storyId, 'test1.md')
    ).filePath;
    const filePath2 = (
      await storyFileService.createFile(storyId, 'test2.md')
    ).filePath;
    const chapterPath = (
      await storyFileService.createChapter(storyId, 'Chapter 1')
    ).filePath;

    // All paths should be under the story directory
    expect(filePath1.startsWith(storyDir)).toBe(true);
    expect(filePath2.startsWith(storyDir)).toBe(true);
    expect(chapterPath.startsWith(storyDir)).toBe(true);

    // All paths should exist
    expect(fs.existsSync(filePath1)).toBe(true);
    expect(fs.existsSync(filePath2)).toBe(true);
    expect(fs.existsSync(chapterPath)).toBe(true);
  });

  it('handles Git operations atomically', async () => {
    // Create file and verify commit happens
    const result = await storyFileService.createFile(storyId, 'atomic.md');

    // Get commit count
    const logBefore = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    const commitCountBefore = logBefore.split('\n').filter((l) => l.length > 0).length;

    // Delete file
    await storyFileService.deleteFile(storyId, result.filePath);

    // Get new commit count
    const logAfter = execSync('git log --oneline', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });
    const commitCountAfter = logAfter.split('\n').filter((l) => l.length > 0).length;

    // Should have exactly 2 commits (create + delete)
    expect(commitCountAfter).toBe(commitCountBefore + 1);
  });

  it('maintains Git history for recovery workflows', async () => {
    // Create some files
    const file1 = await storyFileService.createFile(storyId, 'version1.md');
    fs.writeFileSync(file1.filePath, 'Version 1 content');

    const file2 = await storyFileService.createChapter(storyId, 'Chapter 1');
    fs.writeFileSync(file2.filePath, '# Chapter 1\nInitial content\n');

    // Verify we can read git history
    const log = execSync('git log --name-status', {
      cwd: workspaceRoot,
      encoding: 'utf-8',
    });

    expect(log).toContain('version1.md');
    expect(log).toContain('chapter-1.md');
  });

  it('creates files in correct directory structure', async () => {
    // Create multiple stories with sufficiently different IDs to avoid substring issues
    const suffix = '-' + Math.random().toString(36).substring(7);
    const storyId2 = 'story-two' + suffix;
    const storyDir2 = path.join(workspaceRoot, storyId2);
    fs.mkdirSync(storyDir2, { recursive: true });

    // Create second story in database
    const now = new Date();
    storyRepository.create({
      id: storyId2,
      displayName: 'Test Story 2',
      type: StoryType.SHORT_STORY,
      createdAt: now,
      updatedAt: now,
    });

    // Create files in first story
    const file1 = await storyFileService.createFile(storyId, 'file1.md');

    // Create files in second story
    const file2 = await storyFileService.createFile(storyId2, 'file2.md');

    // Verify files are in correct directories by checking parent directory path
    const file1Parent = path.dirname(file1.filePath);
    const file2Parent = path.dirname(file2.filePath);

    expect(file1Parent).toContain(storyId);
    expect(file2Parent).toContain(storyId2);
    expect(path.basename(file1Parent)).toBe(storyId);
    expect(path.basename(file2Parent)).toBe(storyId2);
  });
});
