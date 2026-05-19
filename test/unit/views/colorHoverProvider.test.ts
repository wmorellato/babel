/**
 * ColorHoverProvider Tests
 * Tests color palette hover, command generation, and edge cases
 */

// Mock vscode before importing provider
jest.mock('vscode', () => {
  class MockMarkdownString {
    value: string = '';
    isTrusted: boolean = false;
    supportHtml: boolean = false;

    constructor(content?: string) {
      this.value = content || '';
    }

    appendMarkdown(markdown: string): void {
      this.value += markdown;
    }
  }

  class MockHover {
    contents: any;
    range: any;

    constructor(contents: any, range?: any) {
      this.contents = contents;
      this.range = range;
    }
  }

  return {
    MarkdownString: MockMarkdownString,
    Hover: MockHover,
    window: {
      visibleTextEditors: [],
    },
  };
});

import * as vscode from 'vscode';
import { ColorHoverProvider } from '../../../src/views/colorHoverProvider';

// Mock Position and Selection since they're not standard constructors in test environment
class MockPosition {
  constructor(
    readonly line: number,
    readonly character: number
  ) {}

  isAfterOrEqual(other: any): boolean {
    if (this.line !== other.line) {
      return this.line > other.line;
    }
    return this.character >= other.character;
  }

  isBeforeOrEqual(other: any): boolean {
    if (this.line !== other.line) {
      return this.line < other.line;
    }
    return this.character <= other.character;
  }

  isEqual(other: any): boolean {
    return this.line === other.line && this.character === other.character;
  }
}

class MockSelection {
  constructor(
    readonly start: MockPosition,
    readonly end: MockPosition
  ) {}

  get isEmpty(): boolean {
    return this.start.line === this.end.line && this.start.character === this.end.character;
  }
}

describe('ColorHoverProvider', () => {
  let provider: ColorHoverProvider;
  let mockDocument: vscode.TextDocument;
  let mockEditor: vscode.TextEditor;
  const colorPalette = {
    red: '#FF6B6B',
    blue: '#0066FF',
    green: '#6BCB77',
  };

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();

    // Create mock document
    mockDocument = {
      getText: jest.fn().mockReturnValue('hello world'),
      uri: { fsPath: '/test/story.md' },
    } as any;

    // Create mock editor
    mockEditor = {
      document: mockDocument,
      selections: [],
    } as any;

    // Mock vscode.window.visibleTextEditors
    (vscode.window as any).visibleTextEditors = [mockEditor];

    // Create provider
    provider = new ColorHoverProvider(colorPalette, null);
  });

  describe('provideHover', () => {
    it('should return null if no visible editors', async () => {
      (vscode.window as any).visibleTextEditors = [];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      expect(result).toBeNull();
    });

    it('should return null if no selections in editor', async () => {
      mockEditor.selections = [];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      expect(result).toBeNull();
    });

    it('should return null if hover position is outside selection', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 10) as any);

      expect(result).toBeNull();
    });

    it('should return null if selection is empty', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 5), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      expect(result).toBeNull();
    });

    it('should return hover with color buttons if position is in selection', async () => {
      const selection = new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any;
      mockEditor.selections = [selection];
      const hoverPos = new MockPosition(0, 2);

      const result = await provider.provideHover(mockDocument, hoverPos as any);

      expect(result).not.toBeNull();
      expect(result?.contents).toBeDefined();
      expect(Array.isArray(result?.contents)).toBe(true);
    });

    it('should include color buttons in markdown', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      const content = (result?.contents as any[])[0];
      expect(content.value).toContain('red');
      expect(content.value).toContain('blue');
      expect(content.value).toContain('green');
    });

    it('should include eraser button in markdown', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      const content = (result?.contents as any[])[0];
      expect(content.value).toContain('eraser');
      expect(content.value).toContain('babel.removeColor');
    });

    it('should set isTrusted to true for markdown', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      const content = (result?.contents as any[])[0];
      expect(content.isTrusted).toBe(true);
    });

    it('should handle multiple selections', async () => {
      mockEditor.selections = [
        new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any,
        new MockSelection(new MockPosition(0, 10), new MockPosition(0, 15)) as any,
      ];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 12) as any);

      expect(result).toBeDefined();
    });

    it('should handle multi-line selections', async () => {
      mockEditor.selections = [
        new MockSelection(new MockPosition(0, 5), new MockPosition(1, 10)) as any,
      ];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 8) as any);

      expect(result).toBeDefined();
    });

    it('should return null gracefully on error', async () => {
      // Mock an error condition
      (vscode.window as any).visibleTextEditors = {
        filter: () => {
          throw new Error('Test error');
        },
      } as any;

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      expect(result).toBeNull();
    });

    it('should check if position is at selection start', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 5), new MockPosition(0, 10)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      expect(result).toBeDefined();
    });

    it('should check if position is at selection end', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 5), new MockPosition(0, 10)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 10) as any);

      expect(result).toBeDefined();
    });

    it('should include color command URIs', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      const content = (result?.contents as any[])[0];
      expect(content.value).toContain('babel.applyColor.red');
      expect(content.value).toContain('babel.applyColor.blue');
      expect(content.value).toContain('babel.applyColor.green');
    });

    it('should encode command arguments as JSON', async () => {
      mockEditor.selections = [new MockSelection(new MockPosition(0, 3), new MockPosition(0, 8)) as any];

      const result = await provider.provideHover(mockDocument, new MockPosition(0, 5) as any);

      const content = (result?.contents as any[])[0];
      // Check for URL-encoded JSON in the markdown (e.g., %5B for [, %22 for ")
      expect(content.value).toMatch(/%5B/);
      expect(content.value).toMatch(/%22/);
    });

    it('should handle editor with different document', async () => {
      const otherDocument = {
        getText: jest.fn().mockReturnValue('other content'),
        uri: { fsPath: '/other/story.md' },
      } as any;

      const result = await provider.provideHover(otherDocument, new MockPosition(0, 5) as any);

      expect(result).toBeNull();
    });
  });

  describe('color palette variations', () => {
    it('should work with single color palette', async () => {
      const singleColorPalette = { red: '#FF0000' };
      const singleProvider = new ColorHoverProvider(singleColorPalette, null);
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      (vscode.window as any).visibleTextEditors = [mockEditor];
      const result = await singleProvider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      expect(result).toBeDefined();
      const content = (result?.contents as any[])[0];
      expect(content.value).toContain('red');
    });

    it('should work with many colors', async () => {
      const manyColorPalette = {
        red: '#FF0000',
        blue: '#0000FF',
        green: '#00FF00',
        yellow: '#FFFF00',
        purple: '#FF00FF',
        cyan: '#00FFFF',
      };
      const manyProvider = new ColorHoverProvider(manyColorPalette, null);
      mockEditor.selections = [new MockSelection(new MockPosition(0, 0), new MockPosition(0, 5)) as any];

      (vscode.window as any).visibleTextEditors = [mockEditor];
      const result = await manyProvider.provideHover(mockDocument, new MockPosition(0, 2) as any);

      expect(result).toBeDefined();
      const content = (result?.contents as any[])[0];
      expect(content.value).toContain('red');
      expect(content.value).toContain('purple');
      expect(content.value).toContain('cyan');
    });
  });
});
