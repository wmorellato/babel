/**
 * BackupDataCollector Tests
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BackupDataCollector } from '../../../src/services/backupDataCollector';
import { createTestDatabase, seedTestStory } from '../../helpers/database';
import { StoryRepository } from '../../../src/db/storyRepository';
import { BabelDatabase } from '../../../src/db/database';
import { IDatabase } from '../../../src/db/database';

describe('BackupDataCollector', () => {
  let tempDir: string;
  let workspaceRoot: string;
  let collector: BackupDataCollector;
  let mockDb: IDatabase;
  let storyRepository: StoryRepository;
  let database: BabelDatabase;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babel-test-'));
    workspaceRoot = tempDir;
    mockDb = createTestDatabase();

    // Create stories table
    mockDb.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon_name TEXT,
        current_word_count INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    storyRepository = new StoryRepository(mockDb);

    // Create a mock BabelDatabase
    database = {
      getDb: () => mockDb,
      initialize: async () => {},
      close: () => {},
      isInitialized: () => true,
    } as any;

    collector = new BackupDataCollector(database, storyRepository, workspaceRoot);
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    mockDb.close();
  });

  describe('collect', () => {
    it('should collect backup data for empty workspace', async () => {
      const data = await collector.collect();

      expect(data.databaseSnapshot).toBeDefined();
      expect(data.storyFiles).toBeInstanceOf(Map);
      expect(data.manifest).toBeDefined();
      expect(data.manifest.stories).toHaveLength(0);
    });

    it('should collect backup data with stories', async () => {
      // Create test story
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Test Story' });

      // Create story directory and files
      const storyDir = path.join(workspaceRoot, 'story-1');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), '# Test Story\n\nContent');

      const data = await collector.collect();

      expect(data.manifest.stories).toHaveLength(1);
      expect(data.manifest.stories[0].displayName).toBe('Test Story');
      expect(data.storyFiles.size).toBeGreaterThan(0);
    });

    it('should create valid manifest', async () => {
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Story 1' });

      const storyDir = path.join(workspaceRoot, 'story-1');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Content');

      const data = await collector.collect();

      expect(data.manifest.version).toBe('1.0.0');
      expect(data.manifest.createdAt).toBeInstanceOf(Date);
      expect(data.manifest.backupId).toBeDefined();
      expect(data.manifest.metadata.babelVersion).toBe('0.1.0');
      expect(data.manifest.metadata.databaseVersion).toBe('1');
    });

    it('should handle multiple stories', async () => {
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Story 1' });
      seedTestStory(mockDb, { id: 'story-2', displayName: 'Story 2' });

      for (const storyId of ['story-1', 'story-2']) {
        const storyDir = path.join(workspaceRoot, storyId);
        fs.mkdirSync(storyDir, { recursive: true });
        fs.writeFileSync(path.join(storyDir, 'story.md'), `Content for ${storyId}`);
      }

      const data = await collector.collect();

      expect(data.manifest.stories).toHaveLength(2);
      expect(data.manifest.stories.map((s) => s.id)).toContain('story-1');
      expect(data.manifest.stories.map((s) => s.id)).toContain('story-2');
    });

    it('should exclude .git directories', async () => {
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Story 1' });

      const storyDir = path.join(workspaceRoot, 'story-1');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Content');

      // Create .git directory that should be excluded
      const gitDir = path.join(storyDir, '.git');
      fs.mkdirSync(gitDir, { recursive: true });
      fs.writeFileSync(path.join(gitDir, 'config'), 'git config');

      const data = await collector.collect();

      // .git files should not be included
      const gitFiles = Array.from(data.storyFiles.keys()).filter((f) => f.includes('.git'));
      expect(gitFiles).toHaveLength(0);
    });

    it('should handle nested directories', async () => {
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Story 1' });

      const storyDir = path.join(workspaceRoot, 'story-1');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.mkdirSync(path.join(storyDir, 'versions'), { recursive: true });
      fs.mkdirSync(path.join(storyDir, 'resources'), { recursive: true });

      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Main content');
      fs.writeFileSync(path.join(storyDir, 'versions', 'v1.md'), 'Version 1');
      fs.writeFileSync(path.join(storyDir, 'resources', 'image.txt'), 'Image data');

      const data = await collector.collect();

      expect(data.storyFiles.size).toBeGreaterThanOrEqual(3);
      expect(Array.from(data.storyFiles.keys())).toEqual(
        expect.arrayContaining([
          expect.stringContaining('story.md'),
          expect.stringContaining('versions'),
          expect.stringContaining('resources'),
        ])
      );
    });

    it('should handle missing story directories gracefully', async () => {
      seedTestStory(mockDb, { id: 'story-1', displayName: 'Story 1' });
      seedTestStory(mockDb, { id: 'story-2', displayName: 'Story 2' });

      // Only create directory for story-1
      const storyDir = path.join(workspaceRoot, 'story-1');
      fs.mkdirSync(storyDir, { recursive: true });
      fs.writeFileSync(path.join(storyDir, 'story.md'), 'Content');

      // story-2 directory doesn't exist

      const data = await collector.collect();

      // Should still include story-1
      expect(data.manifest.stories.length).toBeGreaterThanOrEqual(1);
      expect(data.storyFiles.size).toBeGreaterThan(0);
    });
  });
});
