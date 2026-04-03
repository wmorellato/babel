/**
 * Text Coloring Integration Tests
 * End-to-end workflow tests for color annotations across editor, database, and version switching
 */

import * as vscode from 'vscode';
import { BabelDatabase } from '../../src/db/database';
import { ColorAnnotationRepository } from '../../src/db/colorAnnotationRepository';
import { ColorDecorationManager } from '../../src/views/colorDecorationManager';
import { v4 as uuid } from 'uuid';

describe('Text Coloring Integration', () => {
  let db: BabelDatabase;
  let repo: ColorAnnotationRepository;
  let mockEditor: any;
  let manager: ColorDecorationManager;
  let storyId: string;

  beforeEach(async () => {
    // Initialize database with migrations
    db = new BabelDatabase({ path: ':memory:' });
    await db.initialize();
    repo = new ColorAnnotationRepository(db.getDb());

    // Seed a story
    storyId = uuid();
    db.getDb().prepare(
      `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      storyId,
      'Test Story',
      'short-story',
      1000,
      new Date().toISOString(),
      new Date().toISOString()
    );

    // Create mock editor with document
    mockEditor = {
      document: {
        getText: jest.fn().mockReturnValue('hello world test document'),
        offsetAt: jest.fn((pos: any) => {
          // Mock offsetAt: for line 0, return character position
          if (pos.line === 0) {
            return pos.character;
          }
          return pos.character;
        }),
        positionAt: jest.fn((offset: number) => ({
          line: 0,
          character: offset,
        })),
      },
      setDecorations: jest.fn(),
    };

    manager = new ColorDecorationManager(mockEditor, {
      red: '#FF6B6B',
      blue: '#0066FF',
      green: '#51CF66',
    }, repo);

    manager.setContext(storyId, 'main');
  });

  afterEach(() => {
    manager.unloadVersion();
    db.close();
  });

  describe('End-to-end coloring workflow', () => {
    it('should apply color decoration without errors', () => {
      // Create a mock range
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      };

      // Step 1: Apply color in editor - should not throw
      expect(() => {
        manager.applyDecoration(range, 'red');
      }).not.toThrow();
    });

    it('should handle color replacement on same range', () => {
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      };

      // Apply initial color
      expect(() => {
        manager.applyDecoration(range, 'red');
        // Replace with different color on same range
        manager.applyDecoration(range, 'blue');
      }).not.toThrow();
    });

    it('should remove color by range without errors', () => {
      const range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      };

      // Apply color
      expect(() => {
        manager.applyDecoration(range, 'red');
        // Remove by character positions
        manager.removeDecoration(0, 5);
      }).not.toThrow();
    });

    it('should apply multiple colors to different ranges', () => {
      const range1 = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: 5 },
      };

      const range2 = {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
      };

      // Apply colors to both ranges - should not throw
      expect(() => {
        manager.applyDecoration(range1, 'red');
        manager.applyDecoration(range2, 'blue');
      }).not.toThrow();
    });
  });

  describe('Version-scoped colors', () => {
    it('should store colors per version', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Multi-Version Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Create annotations for main branch
      const annotation1 = {
        id: uuid(),
        storyId: testStoryId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Create annotations for feature branch
      const annotation2 = {
        id: uuid(),
        storyId: testStoryId,
        versionId: 'feature/edits',
        startPos: 0,
        endPos: 5,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Save to different versions
      repo.save(annotation1);
      repo.save(annotation2);

      // Query by version
      const mainColors = repo.findByStoryAndVersion(testStoryId, 'main');
      const featureColors = repo.findByStoryAndVersion(testStoryId, 'feature/edits');

      expect(mainColors.length).toBe(1);
      expect(mainColors[0].color).toBe('red');
      expect(mainColors[0].versionId).toBe('main');

      expect(featureColors.length).toBe(1);
      expect(featureColors[0].color).toBe('blue');
      expect(featureColors[0].versionId).toBe('feature/edits');
    });

    it('should isolate colors between versions', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Isolated Versions Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Main version: color at position 0-5
      const mainAnnotation = {
        id: uuid(),
        storyId: testStoryId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.save(mainAnnotation);

      // Feature version: color at position 6-11
      const featureAnnotation = {
        id: uuid(),
        storyId: testStoryId,
        versionId: 'feature/review',
        startPos: 6,
        endPos: 11,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.save(featureAnnotation);

      // Query main version
      const mainDecorations = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(mainDecorations.length).toBe(1);
      expect(mainDecorations[0].versionId).toBe('main');
      expect(mainDecorations[0].startPos).toBe(0);
      expect(mainDecorations[0].color).toBe('red');

      // Query feature version
      const featureDecorations = repo.findByStoryAndVersion(testStoryId, 'feature/review');
      expect(featureDecorations.length).toBe(1);
      expect(featureDecorations[0].versionId).toBe('feature/review');
      expect(featureDecorations[0].startPos).toBe(6);
      expect(featureDecorations[0].color).toBe('blue');
    });
  });

  describe('Database persistence', () => {
    it('should persist and query annotations correctly', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Persistence Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Create multiple annotations
      const annotations = [
        {
          id: uuid(),
          storyId: testStoryId,
          versionId: 'main',
          startPos: 0,
          endPos: 5,
          color: 'red',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuid(),
          storyId: testStoryId,
          versionId: 'main',
          startPos: 6,
          endPos: 11,
          color: 'blue',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuid(),
          storyId: testStoryId,
          versionId: 'main',
          startPos: 12,
          endPos: 20,
          color: 'green',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      // Save all
      annotations.forEach(a => repo.save(a));

      // Query all for main version
      const saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(3);
      expect(saved[0].startPos).toBe(0);
      expect(saved[1].startPos).toBe(6);
      expect(saved[2].startPos).toBe(12);
    });

    it('should update existing annotation', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Update Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      const annotationId = uuid();

      // Save initial annotation
      const annotation1 = {
        id: annotationId,
        storyId: testStoryId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.save(annotation1);

      // Update same annotation with new color
      const annotation2 = {
        id: annotationId,
        storyId: testStoryId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'blue',
        createdAt: annotation1.createdAt,
        updatedAt: new Date(),
      };
      repo.save(annotation2);

      // Verify only one exists and color is updated
      const saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(1);
      expect(saved[0].color).toBe('blue');
      expect(saved[0].id).toBe(annotationId);
    });

    it('should delete annotation by range', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Delete Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      const annotation = {
        id: uuid(),
        storyId: testStoryId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      repo.save(annotation);

      // Verify exists
      let saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(1);

      // Delete by range
      repo.deleteByRange(testStoryId, 'main', 0, 5);

      // Verify deleted
      saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(0);
    });

    it('should delete all annotations for a version', async () => {
      const testStoryId = uuid();
      db.getDb().prepare(
        `INSERT INTO stories (id, display_name, type, current_word_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      ).run(
        testStoryId,
        'Clear Version Story',
        'short-story',
        1000,
        new Date().toISOString(),
        new Date().toISOString()
      );

      // Create multiple annotations
      for (let i = 0; i < 3; i++) {
        repo.save({
          id: uuid(),
          storyId: testStoryId,
          versionId: 'main',
          startPos: i * 10,
          endPos: (i + 1) * 10,
          color: 'red',
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }

      // Verify all exist
      let saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(3);

      // Delete all for version
      repo.deleteByVersion(testStoryId, 'main');

      // Verify all deleted
      saved = repo.findByStoryAndVersion(testStoryId, 'main');
      expect(saved.length).toBe(0);
    });
  });

  describe('Manager unload and clear', () => {
    it('should unload all decorations from editor', () => {
      // The manager.unloadVersion() should clear internal state without errors
      expect(() => {
        manager.unloadVersion();
      }).not.toThrow();
    });
  });
});
