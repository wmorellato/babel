/**
 * ColorDecorationManager Tests
 * Tests decoration lifecycle, position tracking, and context management
 */

// Mock vscode before importing manager
jest.mock('vscode', () => ({
  DecorationRangeBehavior: {
    ClosedOpen: 1,
  },
  OverviewRulerLane: {
    Left: 1,
    Center: 2,
    Right: 4,
    Full: 7,
  },
  window: {
    createTextEditorDecorationType: jest.fn(() => ({
      dispose: jest.fn(),
    })),
  },
}));

import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../../src/views/colorDecorationManager';
import { ColorPalette, ColorAnnotation } from '../../../src/types';

// Mock Position and Range since they're not constructors in test environment
class MockPosition {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}

  isAfterOrEqual(other: MockPosition): boolean {
    if (this.line !== other.line) {
      return this.line > other.line;
    }
    return this.character >= other.character;
  }

  isBeforeOrEqual(other: MockPosition): boolean {
    if (this.line !== other.line) {
      return this.line < other.line;
    }
    return this.character <= other.character;
  }
}

class MockRange {
  constructor(
    readonly start: MockPosition,
    readonly end: MockPosition
  ) {}
}

describe('ColorDecorationManager', () => {
  let mockEditor: vscode.TextEditor;
  let manager: ColorDecorationManager;
  let mockRepository: any;
  const palette: ColorPalette = {
    red: '#FF6B6B',
    blue: '#0066FF',
    green: '#6BCB77',
  };

  beforeEach(() => {
    // Clear the mock before each test
    jest.clearAllMocks();

    // Create mock repository
    mockRepository = {
      findByStoryAndVersion: jest.fn().mockReturnValue([]),
    };

    // Create mock document with offsetAt/positionAt support
    mockEditor = {
      document: {
        getText: jest.fn().mockReturnValue('hello world\nline 2'),
        uri: { fsPath: '/test/story.md' },
        offsetAt: jest.fn((pos: any) => {
          // Simple mock for single/multi-line: line 0 starts at 0, line 1 at 12
          if (pos.line === 0) {
            return pos.character;
          }
          return 12 + pos.character; // "hello world\n" = 12 chars
        }),
        positionAt: jest.fn((offset: number) => {
          if (offset < 12) {
            return new MockPosition(0, offset);
          }
          return new MockPosition(1, offset - 12);
        }),
      } as any,
      setDecorations: jest.fn(),
    } as any;

    manager = new ColorDecorationManager(mockEditor, palette, mockRepository);
  });


  describe('applyDecoration', () => {
    it('should apply decoration for a range', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'red');

      expect(mockEditor.setDecorations).toHaveBeenCalled();
      const call = (mockEditor.setDecorations as jest.Mock).mock.calls[0];
      expect(call[1]).toContainEqual(range);
    });

    it('should handle valid color from palette', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'blue');

      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });

    it('should warn when color not in palette', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      manager.applyDecoration(range, 'nonexistent');

      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('should replace decoration when re-applied to same range', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'red');
      const firstCallCount = (mockEditor.setDecorations as jest.Mock).mock.calls.length;

      manager.applyDecoration(range, 'blue');
      const secondCallCount = (mockEditor.setDecorations as jest.Mock).mock.calls.length;

      expect(secondCallCount).toBeGreaterThan(firstCallCount);
    });

    it('should handle multi-line ranges', () => {
      const range = new MockRange(new MockPosition(0, 5), new MockPosition(1, 3));

      manager.applyDecoration(range, 'green');

      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });
  });

  describe('removeDecoration', () => {
    it('should remove decoration by offset range', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      manager.applyDecoration(range, 'red');

      expect(manager.getDecorations()).toHaveLength(1);

      manager.removeDecoration(0, 5);

      // After removal, decoration should be gone from internal state
      expect(manager.getDecorations()).toHaveLength(0);
    });

    it('should handle removing non-existent decoration', () => {
      // Should not throw
      expect(() => manager.removeDecoration(999, 1000)).not.toThrow();
    });
  });

  describe('getDecorations', () => {
    it('should return empty array when no decorations applied', () => {
      const annotations = manager.getDecorations();
      expect(annotations).toEqual([]);
    });

    it('should return ColorAnnotation array with current decorations', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.setContext('story-123', 'main');
      manager.applyDecoration(range, 'red');

      const annotations = manager.getDecorations();

      expect(annotations).toHaveLength(1);
      expect(annotations[0]).toMatchObject({
        storyId: 'story-123',
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
      });
      expect(annotations[0].id).toBeDefined();
      expect(annotations[0].createdAt).toBeDefined();
      expect(annotations[0].updatedAt).toBeDefined();
    });

    it('should track multiple decorations', () => {
      manager.setContext('story-123', 'main');

      const range1 = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      const range2 = new MockRange(new MockPosition(0, 6), new MockPosition(0, 11));

      manager.applyDecoration(range1, 'red');
      manager.applyDecoration(range2, 'blue');

      const annotations = manager.getDecorations();

      expect(annotations).toHaveLength(2);
      expect(annotations[0].color).toBe('red');
      expect(annotations[1].color).toBe('blue');
    });

    it('should use offsetAt for multi-line position tracking', () => {
      manager.setContext('story-123', 'main');

      // Range on line 1, chars 3-8
      const range = new MockRange(new MockPosition(1, 3), new MockPosition(1, 8));

      manager.applyDecoration(range, 'green');

      const annotations = manager.getDecorations();

      // offsetAt should convert line 1 char 3-8 to offsets 15-20 (12 + 3 to 12 + 8)
      expect(annotations[0].startPos).toBe(15);
      expect(annotations[0].endPos).toBe(20);
    });
  });

  describe('setContext', () => {
    it('should store storyId and versionId', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.setContext('story-456', 'develop');
      manager.applyDecoration(range, 'red');

      const annotations = manager.getDecorations();

      expect(annotations[0].storyId).toBe('story-456');
      expect(annotations[0].versionId).toBe('develop');
    });
  });

  describe('unloadVersion', () => {
    it('should clear all decorations', () => {
      manager.setContext('story-123', 'main');

      const range1 = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      const range2 = new MockRange(new MockPosition(0, 6), new MockPosition(0, 11));

      manager.applyDecoration(range1, 'red');
      manager.applyDecoration(range2, 'blue');

      manager.unloadVersion();

      const annotations = manager.getDecorations();
      expect(annotations).toHaveLength(0);
    });

    it('should dispose all decoration types', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      manager.applyDecoration(range, 'red');

      manager.unloadVersion();

      // After unload, applying new decorations should work
      manager.applyDecoration(range, 'blue');
      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });
  });

  describe('handleDocumentChange', () => {
    it('should remove decoration when text is deleted within range', () => {
      manager.setContext('story-123', 'main');
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'red');
      expect(manager.getDecorations()).toHaveLength(1);

      // Simulate deletion of the decorated text
      const event: vscode.TextDocumentChangeEvent = {
        document: mockEditor.document as any,
        contentChanges: [
          {
            range: new MockRange(new MockPosition(0, 0), new MockPosition(0, 5)),
            text: '', // deletion
            rangeLength: 5,
          } as any,
        ],
        reason: undefined,
      } as any;

      manager.handleDocumentChange(event);

      expect(manager.getDecorations()).toHaveLength(0);
    });

    it('should not remove decoration when text is added', () => {
      manager.setContext('story-123', 'main');
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'red');
      expect(manager.getDecorations()).toHaveLength(1);

      // Simulate text insertion (not deletion)
      const event: vscode.TextDocumentChangeEvent = {
        document: mockEditor.document as any,
        contentChanges: [
          {
            range: new MockRange(new MockPosition(0, 10), new MockPosition(0, 10)),
            text: 'new text',
            rangeLength: 0,
          } as any,
        ],
        reason: undefined,
      } as any;

      manager.handleDocumentChange(event);

      expect(manager.getDecorations()).toHaveLength(1);
    });

    it('should handle multiple document changes', () => {
      manager.setContext('story-123', 'main');
      const range1 = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      const range2 = new MockRange(new MockPosition(0, 10), new MockPosition(0, 15));

      manager.applyDecoration(range1, 'red');
      manager.applyDecoration(range2, 'blue');

      expect(manager.getDecorations()).toHaveLength(2);

      // Delete the first decoration
      const event: vscode.TextDocumentChangeEvent = {
        document: mockEditor.document as any,
        contentChanges: [
          {
            range: new MockRange(new MockPosition(0, 0), new MockPosition(0, 5)),
            text: '',
            rangeLength: 5,
          } as any,
        ],
        reason: undefined,
      } as any;

      manager.handleDocumentChange(event);

      expect(manager.getDecorations()).toHaveLength(1);
      expect(manager.getDecorations()[0].color).toBe('blue');
    });
  });

  describe('loadVersion', () => {
    it('should load annotations from repository and apply decorations', async () => {
      const mockAnnotations: ColorAnnotation[] = [
        {
          id: 'anno-1',
          storyId: 'story-123',
          versionId: 'main',
          startPos: 0,
          endPos: 5,
          color: 'red',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'anno-2',
          storyId: 'story-123',
          versionId: 'main',
          startPos: 6,
          endPos: 11,
          color: 'blue',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findByStoryAndVersion.mockReturnValue(mockAnnotations);

      await manager.loadVersion('story-123', 'main');

      // Should have loaded both annotations
      const decorations = manager.getDecorations();
      expect(decorations).toHaveLength(2);
      expect(mockRepository.findByStoryAndVersion).toHaveBeenCalledWith(
        'story-123',
        'main'
      );
    });

    it('should handle no repository gracefully', async () => {
      const managerNoRepo = new ColorDecorationManager(mockEditor, palette);

      // Should not throw
      await expect(managerNoRepo.loadVersion('story-123', 'main')).resolves.not.toThrow();
    });

    it('should skip out-of-bounds annotations', async () => {
      const mockAnnotations: ColorAnnotation[] = [
        {
          id: 'anno-1',
          storyId: 'story-123',
          versionId: 'main',
          startPos: 0,
          endPos: 5,
          color: 'red',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'anno-2',
          storyId: 'story-123',
          versionId: 'main',
          startPos: 100, // Out of bounds (doc is "hello world\nline 2" = 18 chars)
          endPos: 200,
          color: 'blue',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findByStoryAndVersion.mockReturnValue(mockAnnotations);

      await manager.loadVersion('story-123', 'main');

      // Should have loaded only the valid annotation
      const decorations = manager.getDecorations();
      expect(decorations).toHaveLength(1);
      expect(decorations[0].color).toBe('red');
    });

    it('should clear existing decorations before loading new version', async () => {
      manager.setContext('story-123', 'main');
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));
      manager.applyDecoration(range, 'red');

      expect(manager.getDecorations()).toHaveLength(1);

      const mockAnnotations: ColorAnnotation[] = [
        {
          id: 'anno-1',
          storyId: 'story-456',
          versionId: 'develop',
          startPos: 6,
          endPos: 11,
          color: 'blue',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockRepository.findByStoryAndVersion.mockReturnValue(mockAnnotations);

      await manager.loadVersion('story-456', 'develop');

      // Old decorations should be cleared
      const decorations = manager.getDecorations();
      expect(decorations).toHaveLength(1);
      expect(decorations[0].color).toBe('blue');
      expect(decorations[0].storyId).toBe('story-456');
    });

    it('should handle empty annotations list', async () => {
      mockRepository.findByStoryAndVersion.mockReturnValue([]);

      await manager.loadVersion('story-123', 'main');

      const decorations = manager.getDecorations();
      expect(decorations).toHaveLength(0);
    });
  });

  describe('integration scenarios', () => {
    it('should handle apply, context, and get workflow', () => {
      const range = new MockRange(new MockPosition(0, 0), new MockPosition(0, 5));

      manager.applyDecoration(range, 'red');
      manager.setContext('story-789', 'feature-branch');

      const annotations = manager.getDecorations();

      expect(annotations).toHaveLength(1);
      expect(annotations[0]).toMatchObject({
        color: 'red',
        storyId: 'story-789',
        versionId: 'feature-branch',
        startPos: 0,
        endPos: 5,
      });
    });

    it('should handle unload and reload workflow', () => {
      manager.setContext('story-100', 'main');

      const range = new MockRange(new MockPosition(0, 2), new MockPosition(0, 7));
      manager.applyDecoration(range, 'green');

      expect(manager.getDecorations()).toHaveLength(1);

      manager.unloadVersion();

      expect(manager.getDecorations()).toHaveLength(0);

      // Reload with new context
      manager.setContext('story-200', 'develop');
      manager.applyDecoration(range, 'blue');

      const annotations = manager.getDecorations();
      expect(annotations).toHaveLength(1);
      expect(annotations[0].storyId).toBe('story-200');
      expect(annotations[0].color).toBe('blue');
    });
  });
});
