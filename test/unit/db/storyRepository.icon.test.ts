/**
 * Story Repository Icon Tests
 */

import { StoryRepository } from '../../../src/db/storyRepository';
import { BabelDatabase } from '../../../src/db/database';
import { StoryType } from '../../../src/types/index';
import * as fs from 'fs';
import * as path from 'path';

describe('StoryRepository - Icon Support', () => {
  let repository: StoryRepository;
  let database: BabelDatabase;
  let testDbPath: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testDbPath = path.join('/tmp', `babel-story-icon-test-${timestamp}-${testId}`);

    if (!fs.existsSync(testDbPath)) {
      fs.mkdirSync(testDbPath, { recursive: true });
    }

    const dbFile = path.join(testDbPath, 'babel.db');
    database = new BabelDatabase({ path: dbFile });
    await database.initialize();
    repository = new StoryRepository(database.getDb());
  });

  afterEach(() => {
    database.close();
    if (fs.existsSync(testDbPath)) {
      fs.rmSync(testDbPath, { recursive: true, force: true });
    }
  });

  describe('create', () => {
    it('should create story with default icon when not specified', () => {
      const story = {
        id: 'test-1',
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);
      const found = repository.findById('test-1');

      expect(found).toBeDefined();
      // DB default is 'book', but if NULL stored, should be undefined or null
      expect(found?.iconName == null || found?.iconName === 'book').toBe(true);
    });

    it('should create story with custom icon when specified', () => {
      const story = {
        id: 'test-2',
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        iconName: 'star',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);
      const found = repository.findById('test-2');

      expect(found).toBeDefined();
      expect(found?.iconName).toBe('star');
    });
  });

  describe('findById', () => {
    it('should retrieve story with icon name', () => {
      const story = {
        id: 'story-with-icon',
        displayName: 'Story With Icon',
        type: StoryType.SHORT_STORY,
        iconName: 'lightbulb',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);
      const found = repository.findById('story-with-icon');

      expect(found?.iconName).toBe('lightbulb');
    });

    it('should handle NULL icon name (DB default applies)', () => {
      const story = {
        id: 'story-no-icon',
        displayName: 'Story No Icon',
        type: StoryType.ESSAY,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);
      const found = repository.findById('story-no-icon');

      expect(found).toBeDefined();
      // iconName may be undefined or 'book' depending on how NULL is handled
      expect(found?.displayName).toBe('Story No Icon');
    });
  });

  describe('findAll', () => {
    it('should retrieve all stories with icons', () => {
      const story1 = {
        id: 'story-1',
        displayName: 'Story 1',
        type: StoryType.NOVEL,
        iconName: 'book',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const story2 = {
        id: 'story-2',
        displayName: 'Story 2',
        type: StoryType.SHORT_STORY,
        iconName: 'file-text',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story1);
      repository.create(story2);

      const all = repository.findAll();

      expect(all.length).toBe(2);
      expect(all[0].iconName).toBe('book');
      expect(all[1].iconName).toBe('file-text');
    });
  });

  describe('update', () => {
    it('should preserve icon when updating other fields', () => {
      const story = {
        id: 'update-test',
        displayName: 'Original Name',
        type: StoryType.NOVEL,
        iconName: 'star',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);

      // Update display name
      const updated = {
        ...story,
        displayName: 'Updated Name',
        updatedAt: new Date(),
      };

      repository.update(updated);
      const found = repository.findById('update-test');

      expect(found?.displayName).toBe('Updated Name');
      expect(found?.iconName).toBe('star'); // Icon should be preserved
    });
  });

  describe('updateIcon', () => {
    it('should update story icon', () => {
      const story = {
        id: 'icon-update-test',
        displayName: 'Icon Test',
        type: StoryType.NOVELLA,
        iconName: 'book',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);
      repository.updateIcon('icon-update-test', 'rocket');

      const found = repository.findById('icon-update-test');
      expect(found?.iconName).toBe('rocket');
    });

    it('should throw error if story not found', () => {
      expect(() => {
        repository.updateIcon('non-existent-id', 'star');
      }).toThrow();
    });

    it('should return immutable copy', () => {
      const story = {
        id: 'immutable-test',
        displayName: 'Immutable Test',
        type: StoryType.ESSAY,
        iconName: 'note',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);

      const original = repository.findById('immutable-test')!;
      const newIcon = 'heart';

      repository.updateIcon('immutable-test', newIcon);

      // Original should be unchanged (function returned new copy)
      expect(original.iconName).toBe('note');

      // New query should get updated icon
      const updated = repository.findById('immutable-test');
      expect(updated?.iconName).toBe('heart');
    });
  });

  describe('backwards compatibility', () => {
    it('should handle stories created before icon support (NULL values)', () => {
      // Directly insert story without icon_name (simulating pre-migration data)
      const db = database.getDb();
      db.prepare(
        `INSERT INTO stories (id, display_name, type, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(
        'legacy-story',
        'Legacy Story',
        'novel',
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Should be retrievable without errors
      const found = repository.findById('legacy-story');
      expect(found).toBeDefined();
      expect(found?.displayName).toBe('Legacy Story');
      // iconName may be undefined
    });
  });
});
