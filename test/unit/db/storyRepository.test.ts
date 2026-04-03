/**
 * Story repository tests
 */

import { IDatabase } from '../../../src/db/database';
import { StoryRepository } from '../../../src/db/storyRepository';
import { Story, StoryType } from '../../../src/types';
import { ValidationError } from '../../../src/utils/errorHandler';
import { createTestDatabase, seedTestStory } from '../../helpers/database';

describe('StoryRepository', () => {
  let db: IDatabase;
  let repository: StoryRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new StoryRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a story', () => {
      const story: Story = {
        id: 'story-1',
        displayName: 'My Story',
        type: StoryType.SHORT_STORY,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repository.create(story);

      const created = repository.findById('story-1');
      expect(created).toBeDefined();
      expect(created?.displayName).toBe('My Story');
      expect(created?.type).toBe(StoryType.SHORT_STORY);
    });

    it('should throw validation error if missing id', () => {
      const story: Story = {
        id: '',
        displayName: 'My Story',
        type: StoryType.NOVEL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => repository.create(story)).toThrow(ValidationError);
    });

    it('should throw validation error if missing displayName', () => {
      const story: Story = {
        id: 'story-1',
        displayName: '',
        type: StoryType.NOVEL,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => repository.create(story)).toThrow(ValidationError);
    });

    it('should throw validation error if missing type', () => {
      const story: Story = {
        id: 'story-1',
        displayName: 'My Story',
        type: undefined as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => repository.create(story)).toThrow(ValidationError);
    });
  });

  describe('findById', () => {
    it('should find existing story', () => {
      seedTestStory(db, { id: 'story-1', displayName: 'Test Story' });

      const story = repository.findById('story-1');

      expect(story).toBeDefined();
      expect(story?.displayName).toBe('Test Story');
      expect(story?.id).toBe('story-1');
    });

    it('should return undefined for non-existent story', () => {
      const story = repository.findById('nonexistent');

      expect(story).toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('should return all stories', () => {
      seedTestStory(db, { id: 'story-1' });
      seedTestStory(db, { id: 'story-2' });
      seedTestStory(db, { id: 'story-3' });

      const stories = repository.findAll();

      expect(stories).toHaveLength(3);
      expect(stories.map((s) => s.id)).toEqual(['story-1', 'story-2', 'story-3']);
    });

    it('should return empty array when no stories exist', () => {
      const stories = repository.findAll();

      expect(stories).toEqual([]);
    });
  });

  describe('update', () => {
    it('should update story', () => {
      seedTestStory(db, { id: 'story-1', displayName: 'Original' });

      const original = repository.findById('story-1')!;
      const updated = {
        ...original,
        displayName: 'Updated',
        updatedAt: new Date(),
      };

      repository.update(updated);

      const persisted = repository.findById('story-1');
      expect(persisted?.displayName).toBe('Updated');
    });

    it('should throw validation error if story does not exist', () => {
      const story: Story = {
        id: 'nonexistent',
        displayName: 'Test',
        type: StoryType.SHORT_STORY,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => repository.update(story)).toThrow(ValidationError);
    });
  });

  describe('delete', () => {
    it('should delete story', () => {
      seedTestStory(db, { id: 'story-1' });

      repository.delete('story-1');

      const deleted = repository.findById('story-1');
      expect(deleted).toBeUndefined();
    });

    it('should not throw error if story does not exist', () => {
      expect(() => repository.delete('nonexistent')).not.toThrow();
    });
  });

  describe('updateWordCount', () => {
    it('should update word count for existing story', () => {
      seedTestStory(db, { id: 'story-1' });

      repository.updateWordCount('story-1', 1234);

      const updated = repository.findById('story-1');
      expect(updated?.currentWordCount).toBe(1234);
    });

    it('should update timestamp when word count changes', () => {
      seedTestStory(db, { id: 'story-1' });
      const before = repository.findById('story-1')?.updatedAt;

      // Wait a tiny bit to ensure timestamps differ
      const start = Date.now();
      while (Date.now() - start < 1) {
        // Busy wait for at least 1ms
      }

      repository.updateWordCount('story-1', 5000);

      const after = repository.findById('story-1')?.updatedAt;
      expect(after?.getTime()).toBeGreaterThan(before?.getTime() || 0);
    });

    it('should throw error if story does not exist', () => {
      expect(() => repository.updateWordCount('nonexistent', 100)).toThrow(ValidationError);
    });

    it('should default to 0 for stories without word count', () => {
      seedTestStory(db, { id: 'story-1' });

      const story = repository.findById('story-1');
      expect(story?.currentWordCount).toBe(0);
    });
  });
});
