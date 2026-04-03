/**
 * Story Manager tests
 */

import { StoryManager } from '../../../src/core/storyManager';
import { StoryTypeRegistry } from '../../../src/core/storyTypeRegistry';
import { StoryRepository } from '../../../src/db/storyRepository';
import { VersionRepository } from '../../../src/db/versionRepository';
import { StoryType } from '../../../src/types';
import { ValidationError } from '../../../src/utils/errorHandler';
import { createTestDatabase } from '../../helpers/database';

describe('StoryManager', () => {
  let manager: StoryManager;
  let storyRepo: StoryRepository;
  let versionRepo: VersionRepository;

  beforeEach(() => {
    const db = createTestDatabase();
    // Initialize tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        git_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);

    storyRepo = new StoryRepository(db);
    versionRepo = new VersionRepository(db);
    const typeRegistry = new StoryTypeRegistry();
    manager = new StoryManager(storyRepo, versionRepo, typeRegistry);
  });

  describe('creating stories', () => {
    it('should create story with valid parameters', () => {
      const story = manager.createStory('My Story', StoryType.SHORT_STORY);

      expect(story.id).toBeDefined();
      expect(story.displayName).toBe('My Story');
      expect(story.type).toBe(StoryType.SHORT_STORY);
      expect(story.createdAt).toBeDefined();
    });

    it('should validate story name is not empty', () => {
      expect(() => manager.createStory('', StoryType.NOVEL)).toThrow(ValidationError);
    });

    it('should validate story type exists', () => {
      expect(() => manager.createStory('Test', 'invalid' as StoryType)).toThrow(ValidationError);
    });

    it('should create default version on story creation', () => {
      const story = manager.createStory('My Story', StoryType.SHORT_STORY);

      const versions = versionRepo.findByStoryId(story.id);
      expect(versions.length).toBeGreaterThan(0);
      expect(versions[0].gitBranch).toBe('draft1');
    });

    it('should persist story to repository', () => {
      const story = manager.createStory('My Story', StoryType.NOVEL);

      const persisted = storyRepo.findById(story.id);
      expect(persisted).toBeDefined();
      expect(persisted?.displayName).toBe('My Story');
      expect(persisted?.type).toBe(StoryType.NOVEL);
    });

    it('should generate unique story IDs', () => {
      const story1 = manager.createStory('Story 1', StoryType.SHORT_STORY);
      const story2 = manager.createStory('Story 2', StoryType.SHORT_STORY);

      expect(story1.id).not.toBe(story2.id);
    });

    it('should allow stories with same name', () => {
      const story1 = manager.createStory('Same Name', StoryType.SHORT_STORY);
      const story2 = manager.createStory('Same Name', StoryType.NOVEL);

      expect(story1.id).not.toBe(story2.id);
      expect(story1.displayName).toBe(story2.displayName);
    });
  });

  describe('getting stories', () => {
    beforeEach(() => {
      manager.createStory('Story 1', StoryType.SHORT_STORY);
      manager.createStory('Story 2', StoryType.NOVEL);
      manager.createStory('Story 3', StoryType.NOVELLA);
    });

    it('should retrieve story by id', () => {
      const created = manager.createStory('Test', StoryType.SHORT_STORY);
      const retrieved = manager.getStory(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.displayName).toBe('Test');
    });

    it('should return undefined for non-existent story', () => {
      const story = manager.getStory('nonexistent');
      expect(story).toBeUndefined();
    });

    it('should get all stories', () => {
      const all = manager.getAllStories();

      expect(all.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter stories by type', () => {
      const novels = manager.getStoriesByType(StoryType.NOVEL);

      expect(novels.length).toBeGreaterThan(0);
      expect(novels.every((s) => s.type === StoryType.NOVEL)).toBe(true);
    });
  });

  describe('renaming stories', () => {
    it('should rename story', () => {
      const story = manager.createStory('Original', StoryType.SHORT_STORY);
      manager.renameStory(story.id, 'Updated');

      const updated = manager.getStory(story.id);
      expect(updated?.displayName).toBe('Updated');
    });

    it('should validate new name is not empty', () => {
      const story = manager.createStory('Original', StoryType.SHORT_STORY);

      expect(() => manager.renameStory(story.id, '')).toThrow(ValidationError);
    });

    it('should throw error if story not found', () => {
      expect(() => manager.renameStory('nonexistent', 'New Name')).toThrow();
    });

    it('should update modified timestamp', () => {
      const story = manager.createStory('Original', StoryType.SHORT_STORY);
      const originalTime = story.updatedAt;

      manager.renameStory(story.id, 'Updated');

      const updated = manager.getStory(story.id)!;
      expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(originalTime.getTime());
    });
  });

  describe('deleting stories', () => {
    it('should delete story', () => {
      const story = manager.createStory('To Delete', StoryType.SHORT_STORY);
      manager.deleteStory(story.id, true);

      const deleted = manager.getStory(story.id);
      expect(deleted).toBeUndefined();
    });

    it('should require confirmation', () => {
      const story = manager.createStory('To Delete', StoryType.SHORT_STORY);

      expect(() => manager.deleteStory(story.id, false)).toThrow();
    });

    it('should delete story with confirmation', () => {
      const story = manager.createStory('To Delete', StoryType.SHORT_STORY);
      manager.deleteStory(story.id, true);

      const deleted = manager.getStory(story.id);
      expect(deleted).toBeUndefined();
    });
  });

  describe('creating versions', () => {
    it('should create version from existing story', () => {
      const story = manager.createStory('My Story', StoryType.SHORT_STORY);
      const version = manager.createVersion(story.id, 'revision-1');

      expect(version.id).toBeDefined();
      expect(version.gitBranch).toBe('revision-1');
      expect(version.storyId).toBe(story.id);
    });

    it('should throw error for non-existent story', () => {
      expect(() => manager.createVersion('nonexistent', 'new-version')).toThrow();
    });

    it('should validate version name', () => {
      const story = manager.createStory('My Story', StoryType.SHORT_STORY);

      expect(() => manager.createVersion(story.id, '')).toThrow(ValidationError);
    });

    it('should persist version to repository', () => {
      const story = manager.createStory('My Story', StoryType.SHORT_STORY);
      const version = manager.createVersion(story.id, 'revision-1');

      const persisted = versionRepo.findById(version.id);
      expect(persisted).toBeDefined();
      expect(persisted?.gitBranch).toBe('revision-1');
    });
  });

  describe('getting story files', () => {
    it('should return files for story type', () => {
      const story = manager.createStory('Novel', StoryType.NOVEL);
      const files = manager.getStoryFiles(story.type);

      expect(files).toBeDefined();
      expect(Object.keys(files!).length).toBeGreaterThan(0);
      expect(files!['story.md']).toBeDefined();
    });

    it('should return undefined for unknown type', () => {
      const files = manager.getStoryFiles('unknown' as StoryType);
      expect(files).toBeUndefined();
    });
  });
});
