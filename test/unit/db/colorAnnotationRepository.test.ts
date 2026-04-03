/**
 * Color annotation repository tests
 */

import { IDatabase } from '../../../src/db/database';
import { ColorAnnotationRepository } from '../../../src/db/colorAnnotationRepository';
import { ColorAnnotation } from '../../../src/types';
import { createTestDatabase, seedTestStory } from '../../helpers/database';
import { v4 as uuid } from 'uuid';

describe('ColorAnnotationRepository', () => {
  let db: IDatabase;
  let repo: ColorAnnotationRepository;
  let storyId: string;

  beforeEach(() => {
    db = createTestDatabase();
    db.exec(`
      CREATE TABLE color_annotations (
        id TEXT PRIMARY KEY,
        storyId TEXT NOT NULL,
        versionId TEXT NOT NULL,
        startPos INTEGER NOT NULL,
        endPos INTEGER NOT NULL,
        color TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(storyId, versionId, startPos, endPos),
        FOREIGN KEY(storyId) REFERENCES stories(id)
      )
    `);
    db.exec(`
      CREATE INDEX idx_color_annotations_story_version
        ON color_annotations(storyId, versionId)
    `);

    repo = new ColorAnnotationRepository(db);
    storyId = uuid();

    // Seed a story
    seedTestStory(db, { id: storyId });
  });

  afterEach(() => {
    db.close();
  });

  describe('save', () => {
    it('should save a new color annotation', () => {
      const annotation: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 10,
        endPos: 20,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const saved = repo.save(annotation);

      expect(saved.id).toBe(annotation.id);
      expect(saved.color).toBe('red');
      expect(saved.startPos).toBe(10);
    });

    it('should update existing annotation with same range', () => {
      const id = uuid();
      const annotation: ColorAnnotation = {
        id,
        storyId,
        versionId: 'main',
        startPos: 5,
        endPos: 15,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation);

      const updated: ColorAnnotation = { ...annotation, color: 'blue' };
      const result = repo.save(updated);

      expect(result.color).toBe('blue');
      expect(repo.findByRange(storyId, 'main', 5, 15)?.color).toBe('blue');
    });
  });

  describe('findByStoryAndVersion', () => {
    it('should return all annotations for a story version', () => {
      const ann1: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 0,
        endPos: 10,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ann2: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 20,
        endPos: 30,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(ann1);
      repo.save(ann2);

      const results = repo.findByStoryAndVersion(storyId, 'main');

      expect(results).toHaveLength(2);
      expect(results.map((a) => a.color)).toEqual(['red', 'blue']);
    });

    it('should return empty array for non-existent version', () => {
      const results = repo.findByStoryAndVersion(storyId, 'nonexistent');
      expect(results).toEqual([]);
    });
  });

  describe('findByRange', () => {
    it('should return annotation for exact range match', () => {
      const annotation: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 5,
        endPos: 15,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation);

      const result = repo.findByRange(storyId, 'main', 5, 15);

      expect(result).toBeDefined();
      expect(result?.color).toBe('red');
    });

    it('should return undefined for non-existent range', () => {
      const result = repo.findByRange(storyId, 'main', 99, 100);
      expect(result).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('should delete annotation by id', () => {
      const id = uuid();
      const annotation: ColorAnnotation = {
        id,
        storyId,
        versionId: 'main',
        startPos: 0,
        endPos: 10,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation);
      repo.delete(id);

      const result = repo.findByRange(storyId, 'main', 0, 10);
      expect(result).toBeUndefined();
    });
  });

  describe('deleteByRange', () => {
    it('should delete annotation by exact range', () => {
      const annotation: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 5,
        endPos: 15,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation);
      repo.deleteByRange(storyId, 'main', 5, 15);

      const result = repo.findByRange(storyId, 'main', 5, 15);
      expect(result).toBeUndefined();
    });
  });

  describe('deleteByVersion', () => {
    it('should delete all annotations for a story version', () => {
      const ann1: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 0,
        endPos: 10,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const ann2: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'feature',
        startPos: 0,
        endPos: 10,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(ann1);
      repo.save(ann2);

      repo.deleteByVersion(storyId, 'main');

      expect(repo.findByStoryAndVersion(storyId, 'main')).toHaveLength(0);
      expect(repo.findByStoryAndVersion(storyId, 'feature')).toHaveLength(1);
    });
  });

  describe('unique constraint', () => {
    it('should enforce unique (storyId, versionId, startPos, endPos)', () => {
      const annotation: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 5,
        endPos: 15,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation);

      const duplicate: ColorAnnotation = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 5,
        endPos: 15,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      expect(() => repo.save(duplicate)).toThrow();
    });
  });
});
