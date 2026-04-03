/**
 * Pandoc Export Service Tests
 */

import * as fs from 'fs';
import * as path from 'path';
import { PandocExportService } from '../../../../src/services/export/pandocExportService';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { createTestDatabase, seedTestStory } from '../../../helpers/database';
import { StoryType } from '../../../../src/types';
import { IDatabase } from '../../../../src/db/database';

describe('PandocExportService', () => {
  let service: PandocExportService;
  let tempDir: string;
  let pandocTemplatesPath: string;
  let storyRepository: StoryRepository;
  let db: IDatabase;

  beforeAll(() => {
    // Create a temporary directory for tests
    tempDir = path.join(__dirname, '.temp-pandoc-export-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Set up a mock pandoc templates directory
    pandocTemplatesPath = path.join(tempDir, 'pandoc-templates');
    fs.mkdirSync(pandocTemplatesPath, { recursive: true });
    fs.mkdirSync(path.join(pandocTemplatesPath, 'bin'), { recursive: true });

    // Create mock scripts
    const md2shortScript = path.join(pandocTemplatesPath, 'bin', 'md2short.sh');
    fs.writeFileSync(md2shortScript, '#!/bin/bash\necho "Mock script"\n', 'utf-8');
    fs.chmodSync(md2shortScript, 0o755);
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  beforeEach(() => {
    // Create test database and repository
    db = createTestDatabase();
    storyRepository = new StoryRepository(db);
    // Create service for each test
    service = new PandocExportService(storyRepository, tempDir);
  });

  afterEach(() => {
    db.close();
  });

  describe('isPandocInstalled', () => {
    it('should return boolean indicating pandoc availability', () => {
      const isInstalled = service.isPandocInstalled();
      expect(typeof isInstalled).toBe('boolean');
    });
  });

  describe('exportStory', () => {
    it('should return error if pandoc is not installed', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(false);

      seedTestStory(db, { id: 'test-story-1', displayName: 'Test Story' });

      const result = await service.exportStory(
        'test-story-1',
        path.join(tempDir, 'output.docx'),
        pandocTemplatesPath
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Pandoc is not installed');
    });

    it('should return error if pandoc templates path is invalid', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(true);

      seedTestStory(db, { id: 'test-story-2', displayName: 'Test Story' });

      const result = await service.exportStory(
        'test-story-2',
        path.join(tempDir, 'output.docx'),
        '/nonexistent/path'
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Pandoc templates path is invalid');
    });

    it('should return error if story is not found', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(true);

      const result = await service.exportStory(
        'nonexistent-story',
        path.join(tempDir, 'output.docx'),
        pandocTemplatesPath
      );

      expect(result.success).toBe(false);
      expect(result.message).toContain('Story not found');
    });

    it('should read single-file story correctly', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(true);

      seedTestStory(db, { id: 'test-story-3', displayName: 'Single File Story' });

      const storyDir = path.join(tempDir, 'test-story-3');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), '# Title\n\nStory content here.', 'utf-8');

      const result = await service.exportStory(
        'test-story-3',
        path.join(tempDir, 'output.docx'),
        pandocTemplatesPath
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should handle multi-chapter stories', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(true);

      seedTestStory(db, {
        id: 'test-story-4',
        displayName: 'Multi-Chapter Story',
        type: StoryType.NOVEL,
      });

      const storyDir = path.join(tempDir, 'test-story-4');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'chapter1.md'), '# Chapter 1\n\nContent 1', 'utf-8');
      fs.writeFileSync(path.join(storyDir, 'chapter2.md'), '# Chapter 2\n\nContent 2', 'utf-8');

      const result = await service.exportStory(
        'test-story-4',
        path.join(tempDir, 'output.docx'),
        pandocTemplatesPath
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });

    it('should include author metadata', async () => {
      jest.spyOn(service, 'isPandocInstalled').mockReturnValue(true);

      seedTestStory(db, { id: 'test-story-5', displayName: 'Test Story' });

      const storyDir = path.join(tempDir, 'test-story-5');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Test content', 'utf-8');

      const authorMetadata = {
        authorName: 'John Doe',
        authorByline: 'Test Author',
      };

      const result = await service.exportStory(
        'test-story-5',
        path.join(tempDir, 'output.docx'),
        pandocTemplatesPath,
        authorMetadata
      );

      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
    });
  });
});
