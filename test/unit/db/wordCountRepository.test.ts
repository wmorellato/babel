/**
 * Word count repository tests
 */

import { IDatabase } from '../../../src/db/database';
import { WordCountRepository } from '../../../src/db/wordCountRepository';
import { WordCountEntry } from '../../../src/types';
import { ValidationError } from '../../../src/utils/errorHandler';
import { createTestDatabase, seedTestStory } from '../../helpers/database';

describe('WordCountRepository', () => {
  let db: IDatabase;
  let repository: WordCountRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new WordCountRepository(db);
    seedTestStory(db, { id: 'story-1' });
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create word count entry', () => {
      const entry: WordCountEntry = {
        id: 'entry-1',
        storyId: 'story-1',
        date: new Date('2024-01-01'),
        wordCount: 1000,
      };

      repository.create(entry);

      const created = repository.findByStoryAndDate('story-1', new Date('2024-01-01'));
      expect(created).toBeDefined();
      expect(created?.wordCount).toBe(1000);
    });

    it('should replace entry if same story and date exist', () => {
      repository.create({
        id: 'entry-1',
        storyId: 'story-1',
        date: new Date('2024-01-01'),
        wordCount: 1000,
      });

      repository.create({
        id: 'entry-2',
        storyId: 'story-1',
        date: new Date('2024-01-01'),
        wordCount: 1200,
      });

      const entries = repository.findByStoryId('story-1');
      expect(entries).toHaveLength(1);
      expect(entries[0].wordCount).toBe(1200);
      expect(entries[0].id).toBe('entry-2');
    });

    it('should throw validation error if missing id', () => {
      const entry: WordCountEntry = {
        id: '',
        storyId: 'story-1',
        date: new Date(),
        wordCount: 1000,
      };

      expect(() => repository.create(entry)).toThrow(ValidationError);
    });

    it('should throw validation error if missing storyId', () => {
      const entry: WordCountEntry = {
        id: 'entry-1',
        storyId: '',
        date: new Date(),
        wordCount: 1000,
      };

      expect(() => repository.create(entry)).toThrow(ValidationError);
    });

    it('should throw validation error if negative word count', () => {
      const entry: WordCountEntry = {
        id: 'entry-1',
        storyId: 'story-1',
        date: new Date(),
        wordCount: -100,
      };

      expect(() => repository.create(entry)).toThrow(ValidationError);
    });
  });

  describe('findByStoryId', () => {
    it('should return entries ordered by date', () => {
      repository.create({
        id: 'e1',
        storyId: 'story-1',
        date: new Date('2024-01-03'),
        wordCount: 1000,
      });
      repository.create({
        id: 'e2',
        storyId: 'story-1',
        date: new Date('2024-01-01'),
        wordCount: 800,
      });
      repository.create({
        id: 'e3',
        storyId: 'story-1',
        date: new Date('2024-01-02'),
        wordCount: 900,
      });

      const entries = repository.findByStoryId('story-1');

      expect(entries).toHaveLength(3);
      expect(entries.map((e) => e.wordCount)).toEqual([800, 900, 1000]);
    });

    it('should return empty array if story has no entries', () => {
      const entries = repository.findByStoryId('story-1');

      expect(entries).toEqual([]);
    });
  });

  describe('findByStoryAndDate', () => {
    it('should find entry by story and date', () => {
      const date = new Date('2024-01-01');
      repository.create({
        id: 'e1',
        storyId: 'story-1',
        date,
        wordCount: 1000,
      });

      const found = repository.findByStoryAndDate('story-1', date);

      expect(found).toBeDefined();
      expect(found?.wordCount).toBe(1000);
    });

    it('should return undefined if entry not found', () => {
      const found = repository.findByStoryAndDate('story-1', new Date('2024-01-01'));

      expect(found).toBeUndefined();
    });
  });

  describe('getLatest', () => {
    it('should return latest entry by date', () => {
      repository.create({
        id: 'e1',
        storyId: 'story-1',
        date: new Date('2024-01-01'),
        wordCount: 1000,
      });
      repository.create({
        id: 'e2',
        storyId: 'story-1',
        date: new Date('2024-01-03'),
        wordCount: 1200,
      });
      repository.create({
        id: 'e3',
        storyId: 'story-1',
        date: new Date('2024-01-02'),
        wordCount: 1100,
      });

      const latest = repository.getLatest('story-1');

      expect(latest).toBeDefined();
      expect(latest?.wordCount).toBe(1200);
    });

    it('should return undefined if no entries exist', () => {
      const latest = repository.getLatest('story-1');

      expect(latest).toBeUndefined();
    });
  });
});
