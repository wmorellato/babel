# Text Coloring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement inline text coloring for stories with per-version persistence and VSCode decoration-based UI.

**Architecture:** Database stores ColorAnnotation records (storyId, versionId, startPos, endPos, color). VSCode decorations render colors in editor and auto-track position changes. Sync happens only at file save (write to DB) and startup (load from DB). Commands handle user interactions via hover dialog.

**Tech Stack:** VSCode TextEditorDecorationType, Babel database (better-sqlite3), Repository pattern, TDD with Jest

---

## File Structure

### Files to Create
- `src/db/colorAnnotationRepository.ts` — Color annotation CRUD
- `src/db/migrations/v6-color-annotations.ts` — Database migration
- `src/views/colorDecorationManager.ts` — Decoration lifecycle in editor
- `src/views/colorHoverProvider.ts` — Hover UI with color palette
- `src/core/commands/applyColorCommand.ts` — Apply color to selection
- `src/core/commands/removeColorCommand.ts` — Remove color from selection
- `test/unit/db/colorAnnotationRepository.test.ts` — Repository tests
- `test/unit/views/colorDecorationManager.test.ts` — Manager tests
- `test/unit/views/colorHoverProvider.test.ts` — Hover provider tests
- `test/unit/core/commands/applyColorCommand.test.ts` — Command tests
- `test/integration/text-coloring.test.ts` — Integration tests

### Files to Modify
- `src/types/index.ts` — Add ColorAnnotation type
- `src/services/babelSettings.ts` — Add color palette settings helper
- `src/db/database.ts` — Register migration v6
- `src/extension.ts` — Wire up hooks and initialization
- `package.json` — Add color commands to contributes.commands and menus

---

## Phase 1: Types & Database Foundation

### Task 1: Define ColorAnnotation type

**Files:**
- Modify: `src/types/index.ts`
- Test: N/A (type definition only)

- [ ] **Step 1: Add ColorAnnotation type to types/index.ts**

```typescript
/**
 * Color annotation for a text range in a story version
 */
export interface ColorAnnotation {
  id: string;          // UUID
  storyId: string;     // UUID of story
  versionId: string;   // Git branch name (e.g., 'main', 'feature/xyz')
  startPos: number;    // 0-based character offset
  endPos: number;      // 0-based character offset
  color: string;       // Color name from palette (e.g., 'red', 'blue')
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Color palette configuration
 */
export interface ColorPalette {
  [colorName: string]: string; // e.g., { red: '#FF6B6B', blue: '#0066FF' }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add ColorAnnotation and ColorPalette types"
```

---

### Task 2: Create database migration for color_annotations table

**Files:**
- Create: `src/db/migrations/v6-color-annotations.ts`
- Modify: `src/db/database.ts`
- Test: N/A (migration is schema, tested by repository)

- [ ] **Step 1: Create migration file**

```typescript
// src/db/migrations/v6-color-annotations.ts
import { Migration } from '../database';

export const v6ColorAnnotations: Migration = {
  name: 'v6-add-color-annotations',
  up: (db) => {
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
      );

      CREATE INDEX idx_color_annotations_story_version
        ON color_annotations(storyId, versionId);
    `);
  },
  down: (db) => {
    db.exec('DROP TABLE color_annotations;');
  }
};
```

- [ ] **Step 2: Register migration in database.ts**

In `src/db/database.ts`, import and add to migrations array:

```typescript
import { v6ColorAnnotations } from './migrations/v6-color-annotations';

// In BabelDatabase constructor or migration registry:
private readonly migrations: Migration[] = [
  // ... existing v1-v5
  v6ColorAnnotations,
];
```

- [ ] **Step 3: Commit**

```bash
git add src/db/migrations/v6-color-annotations.ts src/db/database.ts
git commit -m "feat: add database migration for color_annotations table"
```

---

## Phase 2: Data Access Layer (Repository)

### Task 3: Implement ColorAnnotationRepository

**Files:**
- Create: `src/db/colorAnnotationRepository.ts`
- Create: `test/unit/db/colorAnnotationRepository.test.ts`
- Test: Comprehensive unit tests

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/db/colorAnnotationRepository.test.ts
import { BabelDatabase } from '../../../src/db/database';
import { ColorAnnotationRepository } from '../../../src/db/colorAnnotationRepository';
import { ColorAnnotation } from '../../../src/types';
import { v4 as uuid } from 'uuid';

describe('ColorAnnotationRepository', () => {
  let db: BabelDatabase;
  let repo: ColorAnnotationRepository;
  let storyId: string;

  beforeEach(async () => {
    db = new BabelDatabase({ path: ':memory:' });
    await db.initialize();
    repo = new ColorAnnotationRepository(db.getDb());
    storyId = uuid();

    // Seed a story
    const storyDb = db.getDb();
    storyDb.prepare(`INSERT INTO stories (id, title, type, currentWordCount) VALUES (?, ?, ?, ?)`).run(
      storyId,
      'Test Story',
      'short-story',
      1000
    );
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
```

- [ ] **Step 2: Run tests to verify they all fail**

```bash
npm test -- test/unit/db/colorAnnotationRepository.test.ts
```

Expected: All tests FAIL with "ColorAnnotationRepository not found"

- [ ] **Step 3: Implement ColorAnnotationRepository**

```typescript
// src/db/colorAnnotationRepository.ts
import { Database } from 'better-sqlite3';
import { Repository } from './repository';
import { ColorAnnotation } from '../types';
import { Logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

const logger = new Logger('ColorAnnotationRepository');

export class ColorAnnotationRepository extends Repository<ColorAnnotation> {
  constructor(db: Database) {
    super(db, 'color_annotations');
  }

  save(annotation: ColorAnnotation): ColorAnnotation {
    try {
      const now = Date.now();
      const existing = this.db
        .prepare(
          'SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?'
        )
        .get(annotation.storyId, annotation.versionId, annotation.startPos, annotation.endPos);

      if (existing) {
        // Update existing
        this.db
          .prepare(
            'UPDATE color_annotations SET color = ?, updatedAt = ? WHERE id = ?'
          )
          .run(annotation.color, now, annotation.id);

        return {
          ...annotation,
          updatedAt: new Date(now),
        };
      } else {
        // Insert new
        this.db
          .prepare(
            'INSERT INTO color_annotations (id, storyId, versionId, startPos, endPos, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
          )
          .run(
            annotation.id || uuid(),
            annotation.storyId,
            annotation.versionId,
            annotation.startPos,
            annotation.endPos,
            annotation.color,
            annotation.createdAt.getTime(),
            annotation.updatedAt.getTime()
          );

        return annotation;
      }
    } catch (error) {
      logger.error('Failed to save color annotation', { error, annotation });
      throw error;
    }
  }

  findByStoryAndVersion(storyId: string, versionId: string): ColorAnnotation[] {
    try {
      const rows = this.db
        .prepare('SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? ORDER BY startPos')
        .all(storyId, versionId) as any[];

      return rows.map((row) => this.mapRowToAnnotation(row));
    } catch (error) {
      logger.error('Failed to find annotations by story and version', { error, storyId, versionId });
      return [];
    }
  }

  findByRange(
    storyId: string,
    versionId: string,
    startPos: number,
    endPos: number
  ): ColorAnnotation | undefined {
    try {
      const row = this.db
        .prepare(
          'SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?'
        )
        .get(storyId, versionId, startPos, endPos) as any;

      return row ? this.mapRowToAnnotation(row) : undefined;
    } catch (error) {
      logger.error('Failed to find annotation by range', { error, storyId, versionId, startPos, endPos });
      return undefined;
    }
  }

  delete(id: string): void {
    try {
      this.db.prepare('DELETE FROM color_annotations WHERE id = ?').run(id);
    } catch (error) {
      logger.error('Failed to delete annotation', { error, id });
      throw error;
    }
  }

  deleteByRange(storyId: string, versionId: string, startPos: number, endPos: number): void {
    try {
      this.db
        .prepare(
          'DELETE FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?'
        )
        .run(storyId, versionId, startPos, endPos);
    } catch (error) {
      logger.error('Failed to delete annotation by range', { error, storyId, versionId, startPos, endPos });
      throw error;
    }
  }

  deleteByVersion(storyId: string, versionId: string): void {
    try {
      this.db
        .prepare('DELETE FROM color_annotations WHERE storyId = ? AND versionId = ?')
        .run(storyId, versionId);
    } catch (error) {
      logger.error('Failed to delete annotations by version', { error, storyId, versionId });
      throw error;
    }
  }

  private mapRowToAnnotation(row: any): ColorAnnotation {
    return {
      id: row.id,
      storyId: row.storyId,
      versionId: row.versionId,
      startPos: row.startPos,
      endPos: row.endPos,
      color: row.color,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
```

- [ ] **Step 4: Run tests to verify they all pass**

```bash
npm test -- test/unit/db/colorAnnotationRepository.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/colorAnnotationRepository.ts test/unit/db/colorAnnotationRepository.test.ts
git commit -m "feat: implement ColorAnnotationRepository with full CRUD and version queries"
```

---

## Phase 3: Decoration Manager (Core Logic)

### Task 4: Implement ColorDecorationManager

**Files:**
- Create: `src/views/colorDecorationManager.ts`
- Create: `test/unit/views/colorDecorationManager.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/views/colorDecorationManager.test.ts
import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../../src/views/colorDecorationManager';
import { ColorPalette } from '../../../src/types';

describe('ColorDecorationManager', () => {
  let mockEditor: vscode.TextEditor;
  let manager: ColorDecorationManager;
  const palette: ColorPalette = {
    red: '#FF6B6B',
    blue: '#0066FF',
    green: '#6BCB77',
  };

  beforeEach(() => {
    // Mock editor
    mockEditor = {
      document: {
        getText: jest.fn().mockReturnValue('hello world'),
        uri: { fsPath: '/test/story.md' },
      } as any,
      setDecorations: jest.fn(),
    } as any;

    manager = new ColorDecorationManager(mockEditor, palette);
  });

  describe('applyDecoration', () => {
    it('should create a decoration for a range', () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));

      manager.applyDecoration(range, 'red');

      expect(mockEditor.setDecorations).toHaveBeenCalled();
    });

    it('should update existing decoration when re-applied', () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));

      manager.applyDecoration(range, 'red');
      manager.applyDecoration(range, 'blue');

      // Should have 2 calls (one for red, one for updating to blue)
      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeDecoration', () => {
    it('should remove decoration for a range', () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));
      manager.applyDecoration(range, 'red');

      manager.removeDecoration(0, 5);

      expect(mockEditor.setDecorations).toHaveBeenCalledTimes(2); // apply + remove
    });
  });

  describe('getDecorations', () => {
    it('should return current decorations as ColorAnnotation objects', () => {
      const range1 = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));
      const range2 = new vscode.Range(new vscode.Position(0, 6), new vscode.Position(0, 11));

      manager.applyDecoration(range1, 'red');
      manager.applyDecoration(range2, 'blue');

      // Mock: setContext method
      manager.setContext('story-123', 'main');

      const annotations = manager.getDecorations();

      expect(annotations).toHaveLength(2);
      expect(annotations[0]).toMatchObject({
        startPos: 0,
        endPos: 5,
        color: 'red',
        storyId: 'story-123',
        versionId: 'main',
      });
    });
  });

  describe('unloadVersion', () => {
    it('should clear all decorations', () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));
      manager.applyDecoration(range, 'red');

      manager.unloadVersion();

      const annotations = manager.getDecorations();
      expect(annotations).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- test/unit/views/colorDecorationManager.test.ts
```

Expected: FAIL with "ColorDecorationManager not found"

- [ ] **Step 3: Implement ColorDecorationManager**

```typescript
// src/views/colorDecorationManager.ts
import * as vscode from 'vscode';
import { ColorAnnotation, ColorPalette } from '../types';
import { Logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

const logger = new Logger('ColorDecorationManager');

interface DecorationType {
  range: vscode.Range;
  color: string;
  type: vscode.TextEditorDecorationType;
}

export class ColorDecorationManager {
  private decorations: Map<string, DecorationType> = new Map();
  private storyId: string = '';
  private versionId: string = '';

  constructor(
    private editor: vscode.TextEditor,
    private colorPalette: ColorPalette
  ) {}

  setContext(storyId: string, versionId: string): void {
    this.storyId = storyId;
    this.versionId = versionId;
  }

  applyDecoration(range: vscode.Range, color: string): void {
    try {
      const key = this.rangeKey(range);

      // Remove old decoration if exists
      if (this.decorations.has(key)) {
        this.decorations.get(key)?.type.dispose();
      }

      // Create new decoration type with color
      const hexColor = this.colorPalette[color];
      if (!hexColor) {
        logger.warn(`Color '${color}' not found in palette`);
        return;
      }

      const decorationType = vscode.window.createTextEditorDecorationType({
        backgroundColor: hexColor,
        isWholeLine: false,
        rangeBehavior: vscode.DecorationRangeBehavior.ClosedOpen,
      });

      // Apply decoration
      this.editor.setDecorations(decorationType, [range]);

      // Store decoration
      this.decorations.set(key, {
        range,
        color,
        type: decorationType,
      });

      logger.debug(`Applied decoration: ${color} at ${key}`);
    } catch (error) {
      logger.error('Failed to apply decoration', { error, color });
    }
  }

  removeDecoration(startPos: number, endPos: number): void {
    try {
      const key = this.rangeKey(startPos, endPos);
      const decoration = this.decorations.get(key);

      if (decoration) {
        decoration.type.dispose();
        this.decorations.delete(key);
        logger.debug(`Removed decoration at ${key}`);
      }
    } catch (error) {
      logger.error('Failed to remove decoration', { error });
    }
  }

  unloadVersion(): void {
    try {
      for (const decoration of this.decorations.values()) {
        decoration.type.dispose();
      }
      this.decorations.clear();
      logger.debug('Unloaded all decorations');
    } catch (error) {
      logger.error('Failed to unload version', { error });
    }
  }

  async loadVersion(storyId: string, versionId: string): Promise<void> {
    this.storyId = storyId;
    this.versionId = versionId;
    // Note: Actual loading will happen when repository is passed in
    // For now, just set context
  }

  getDecorations(): ColorAnnotation[] {
    const annotations: ColorAnnotation[] = [];

    for (const decoration of this.decorations.values()) {
      annotations.push({
        id: uuid(),
        storyId: this.storyId,
        versionId: this.versionId,
        startPos: decoration.range.start.character,
        endPos: decoration.range.end.character,
        color: decoration.color,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return annotations;
  }

  handleDocumentChange(event: vscode.TextDocumentChangeEvent): void {
    try {
      for (const change of event.contentChanges) {
        // Check if change overlaps any decorated range
        // If a decorated range is entirely deleted, remove that decoration
        for (const decoration of this.decorations.values()) {
          const changeStart = this.editor.document.offsetAt(change.range.start);
          const changeEnd = this.editor.document.offsetAt(change.range.end);
          const decorationStart = this.editor.document.offsetAt(decoration.range.start);
          const decorationEnd = this.editor.document.offsetAt(decoration.range.end);

          // If decorated range is entirely within deleted range, remove decoration
          if (decorationStart >= changeStart && decorationEnd <= changeEnd && change.text === '') {
            const key = this.rangeKey(decoration.range.start.character, decoration.range.end.character);
            this.removeDecoration(decoration.range.start.character, decoration.range.end.character);
          }
        }
      }
    } catch (error) {
      logger.debug('Error handling document change', { error });
    }
  }

  private rangeKey(range: vscode.Range): string {
    // Use document offset for multi-line support
    const startOffset = this.editor.document.offsetAt(range.start);
    const endOffset = this.editor.document.offsetAt(range.end);
    return `${startOffset},${endOffset}`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/views/colorDecorationManager.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/colorDecorationManager.ts test/unit/views/colorDecorationManager.test.ts
git commit -m "feat: implement ColorDecorationManager with decoration lifecycle"
```

---

## Phase 4: Hover Provider (UI)

### Task 5: Implement ColorHoverProvider

**Files:**
- Create: `src/views/colorHoverProvider.ts`
- Create: `test/unit/views/colorHoverProvider.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// test/unit/views/colorHoverProvider.test.ts
import * as vscode from 'vscode';
import { ColorHoverProvider } from '../../../src/views/colorHoverProvider';

describe('ColorHoverProvider', () => {
  let provider: ColorHoverProvider;
  let mockDocument: vscode.TextDocument;
  let mockEditor: vscode.TextEditor;

  beforeEach(() => {
    mockDocument = {
      getText: jest.fn().mockReturnValue('hello world'),
      lineAt: jest.fn(),
    } as any;

    mockEditor = {
      document: mockDocument,
      selections: [],
      visibleTextEditors: [],
    } as any;

    // Mock vscode.window
    (vscode.window as any).visibleTextEditors = [mockEditor];

    provider = new ColorHoverProvider(
      { red: '#FF6B6B', blue: '#0066FF' },
      null // colorAnnotationRepository will be mocked
    );
  });

  describe('provideHover', () => {
    it('should return null if no selection contains hover position', async () => {
      mockEditor.selections = [];

      const result = await provider.provideHover(mockDocument, new vscode.Position(0, 5));

      expect(result).toBeNull();
    });

    it('should return hover with color buttons if position is in selection', async () => {
      const selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 5));
      mockEditor.selections = [selection];

      mockDocument.getText = jest.fn().mockReturnValue('hello world');

      const result = await provider.provideHover(mockDocument, new vscode.Position(0, 2));

      expect(result).toBeDefined();
      expect(result?.contents).toBeDefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- test/unit/views/colorHoverProvider.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement ColorHoverProvider**

```typescript
// src/views/colorHoverProvider.ts
import * as vscode from 'vscode';
import { ColorPalette } from '../types';
import { ColorAnnotationRepository } from '../db/colorAnnotationRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('ColorHoverProvider');

export class ColorHoverProvider implements vscode.HoverProvider {
  constructor(
    private colorPalette: ColorPalette,
    private colorRepository: ColorAnnotationRepository | null
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    try {
      // Get all visible editors for this document
      const editors = vscode.window.visibleTextEditors.filter((e) => e.document === document);

      if (editors.length === 0) {
        return null;
      }

      // Check if position is within any selection
      for (const editor of editors) {
        for (const selection of editor.selections) {
          if (selection.isEmpty) {
            continue;
          }

          // Check if hover position is within selection
          if (position.isAfterOrEqual(selection.start) && position.isBeforeOrEqual(selection.end)) {
            return this.createColorHover(selection);
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error in color hover provider: ${error}`);
      return null;
    }
  }

  private createColorHover(selection: vscode.Selection): vscode.Hover {
    const contents: (string | vscode.MarkdownString)[] = [];

    // Create buttons for each color using numeric offsets (serializable)
    const startOffset = selection.start.character;
    const endOffset = selection.end.character;

    const colorButtons = Object.keys(this.colorPalette)
      .map(
        (colorName) =>
          `[🔴 ${colorName}](command:babel.applyColor.${colorName}?${encodeURIComponent(
            JSON.stringify([colorName, startOffset, endOffset])
          )})`
      )
      .join(' ');

    // Add eraser button with numeric offsets
    const eraserButton = `[🗑️ Erase](command:babel.removeColor?${encodeURIComponent(
      JSON.stringify([startOffset, endOffset])
    )})`;

    const markdown = new vscode.MarkdownString(`${colorButtons} ${eraserButton}`);
    markdown.isTrusted = true;

    contents.push(markdown);

    return new vscode.Hover(contents, selection);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/views/colorHoverProvider.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/views/colorHoverProvider.ts test/unit/views/colorHoverProvider.test.ts
git commit -m "feat: implement ColorHoverProvider with color palette UI"
```

---

## Phase 5: Commands

### Task 6: Implement ApplyColorCommand and RemoveColorCommand

**Files:**
- Create: `src/core/commands/applyColorCommand.ts`
- Create: `src/core/commands/removeColorCommand.ts`
- Create: `test/unit/core/commands/applyColorCommand.test.ts`

- [ ] **Step 1: Write failing tests for ApplyColorCommand**

```typescript
// test/unit/core/commands/applyColorCommand.test.ts
import * as vscode from 'vscode';
import { ApplyColorCommand } from '../../../src/core/commands/applyColorCommand';

describe('ApplyColorCommand', () => {
  let command: ApplyColorCommand;
  let mockManager: any;

  beforeEach(() => {
    mockManager = {
      applyDecoration: jest.fn(),
    };

    command = new ApplyColorCommand(mockManager);
  });

  describe('execute', () => {
    it('should apply color to selection', async () => {
      const selection = new vscode.Selection(new vscode.Position(0, 0), new vscode.Position(0, 5));

      await command.execute(selection, 'red');

      expect(mockManager.applyDecoration).toHaveBeenCalledWith(
        expect.objectContaining({
          start: selection.start,
          end: selection.end,
        }),
        'red'
      );
    });

    it('should show error if no selection', async () => {
      const mockShowError = jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined as any);

      await command.execute(null as any, 'red');

      expect(mockShowError).toHaveBeenCalledWith('No text selected');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- test/unit/core/commands/applyColorCommand.test.ts
```

Expected: FAIL

- [ ] **Step 3: Implement ApplyColorCommand**

```typescript
// src/core/commands/applyColorCommand.ts
import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../views/colorDecorationManager';
import { Logger } from '../../utils/logger';

const logger = new Logger('ApplyColorCommand');

export class ApplyColorCommand {
  constructor(private colorManager: ColorDecorationManager) {}

  async execute(selection: vscode.Selection, color: string): Promise<void> {
    try {
      if (!selection || selection.isEmpty) {
        await vscode.window.showErrorMessage('No text selected');
        return;
      }

      const range = new vscode.Range(selection.start, selection.end);
      this.colorManager.applyDecoration(range, color);

      logger.debug(`Applied color '${color}' to selection`);
    } catch (error) {
      logger.error('Failed to apply color', { error });
      await vscode.window.showErrorMessage(`Failed to apply color: ${error}`);
    }
  }

  static register(context: vscode.ExtensionContext, colorManager: ColorDecorationManager, palette: ColorPalette): void {
    // Register command for each color in palette (dynamic)
    for (const colorName of Object.keys(palette)) {
      const disposable = vscode.commands.registerCommand(
        `babel.applyColor.${colorName}`,
        (colorNameArg: string, startOffset: number, endOffset: number) => {
          // Reconstruct range from offsets
          const editor = vscode.window.activeTextEditor;
          if (!editor) return;

          const range = new vscode.Range(
            editor.document.positionAt(startOffset),
            editor.document.positionAt(endOffset)
          );
          return new ApplyColorCommand(colorManager).execute(
            new vscode.Selection(range.start, range.end),
            colorNameArg
          );
        }
      );
      context.subscriptions.push(disposable);
    }

    logger.info('ApplyColorCommand registered for all colors in palette');
  }
}
```

- [ ] **Step 4: Implement RemoveColorCommand**

```typescript
// src/core/commands/removeColorCommand.ts
import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../views/colorDecorationManager';
import { Logger } from '../../utils/logger';

const logger = new Logger('RemoveColorCommand');

export class RemoveColorCommand {
  constructor(private colorManager: ColorDecorationManager) {}

  async execute(selection: vscode.Selection): Promise<void> {
    try {
      if (!selection || selection.isEmpty) {
        await vscode.window.showErrorMessage('No text selected');
        return;
      }

      this.colorManager.removeDecoration(selection.start.character, selection.end.character);

      logger.debug('Removed color from selection');
    } catch (error) {
      logger.error('Failed to remove color', { error });
      await vscode.window.showErrorMessage(`Failed to remove color: ${error}`);
    }
  }

  static register(context: vscode.ExtensionContext, colorManager: ColorDecorationManager): void {
    const disposable = vscode.commands.registerCommand(
      'babel.removeColor',
      (selection: vscode.Selection) => new RemoveColorCommand(colorManager).execute(selection)
    );
    context.subscriptions.push(disposable);

    logger.info('RemoveColorCommand registered');
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npm test -- test/unit/core/commands/applyColorCommand.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/commands/applyColorCommand.ts src/core/commands/removeColorCommand.ts test/unit/core/commands/applyColorCommand.test.ts
git commit -m "feat: implement color command handlers (apply and remove)"
```

---

## Phase 6: Settings & Configuration

### Task 7: Add color palette settings

**Files:**
- Modify: `package.json`
- Modify: `src/services/babelSettings.ts` (or create if needed)

- [ ] **Step 1: Add commands to package.json**

In `contributes.commands` array, add:

```json
{
  "command": "babel.applyColor.red",
  "title": "Babel: Apply Red Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.blue",
  "title": "Babel: Apply Blue Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.green",
  "title": "Babel: Apply Green Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.yellow",
  "title": "Babel: Apply Yellow Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.purple",
  "title": "Babel: Apply Purple Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.orange",
  "title": "Babel: Apply Orange Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.cyan",
  "title": "Babel: Apply Cyan Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.applyColor.pink",
  "title": "Babel: Apply Pink Color",
  "icon": "$(circle-filled)"
},
{
  "command": "babel.removeColor",
  "title": "Babel: Remove Color",
  "icon": "$(circle-outline)"
}
```

- [ ] **Step 2: Add color palette configuration to package.json**

In `contributes.configuration.properties`, add:

```json
"babel.colors.palette": {
  "type": "object",
  "default": {
    "red": "#FF6B6B",
    "orange": "#FFA94D",
    "yellow": "#FFD93D",
    "green": "#6BCB77",
    "cyan": "#4D96FF",
    "blue": "#0066FF",
    "purple": "#B366FF",
    "pink": "#FF66B2"
  },
  "description": "Custom color palette for text highlighting (hex color values)"
}
```

- [ ] **Step 3: Add helper to BabelSettings for color palette**

In `src/services/babelSettings.ts`, add:

```typescript
/**
 * Get configured color palette with defaults
 */
static getColorPalette(): ColorPalette {
  const config = vscode.workspace.getConfiguration('babel.colors');
  return config.get<ColorPalette>('palette') || {
    red: '#FF6B6B',
    orange: '#FFA94D',
    yellow: '#FFD93D',
    green: '#6BCB77',
    cyan: '#4D96FF',
    blue: '#0066FF',
    purple: '#B366FF',
    pink: '#FF66B2',
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add package.json src/services/babelSettings.ts
git commit -m "feat: add color palette configuration and settings"
```

---

## Phase 7: Extension Integration

### Task 8: Wire up extension.ts hooks

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Import new modules**

At top of `src/extension.ts`, add:

```typescript
import { ColorAnnotationRepository } from './db/colorAnnotationRepository';
import { ColorDecorationManager } from './views/colorDecorationManager';
import { ColorHoverProvider } from './views/colorHoverProvider';
import { ApplyColorCommand } from './core/commands/applyColorCommand';
import { RemoveColorCommand } from './core/commands/removeColorCommand';
import { ColorPalette } from './types';
```

- [ ] **Step 2: Initialize color repositories and managers**

In `activate()` function, after database initialization, add:

```typescript
// Initialize color annotation repository
let colorAnnotationRepository: ColorAnnotationRepository | null = null;
let colorDecorationManager: ColorDecorationManager | null = null;

if (database) {
  colorAnnotationRepository = new ColorAnnotationRepository(database.getDb());
  logger.info('Color annotation repository initialized');
}
```

- [ ] **Step 3: Add onDidChangeActiveTextEditor hook for loading decorations**

NOTE: Also call this function on initial activation for the currently-open editor.

After the existing editor change listener, add:

```typescript
// Load color decorations when switching editors
if (colorAnnotationRepository && workspacePath) {
  const colorHookListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
    if (!editor || !colorAnnotationRepository || !workspacePath) return;

    const filePath = editor.document.uri.fsPath;
    if (!filePath.startsWith(workspacePath)) return;

    const storyId = path.relative(workspacePath, filePath).split(path.sep)[0];
    const versionId = await gitRepository?.getCurrentBranch();

    if (!versionId) return;

    // Create or update decoration manager for this editor
    colorDecorationManager = new ColorDecorationManager(editor, BabelSettings.getColorPalette());
    colorDecorationManager.setContext(storyId, versionId);

    try {
      const annotations = colorAnnotationRepository.findByStoryAndVersion(storyId, versionId);
      for (const annotation of annotations) {
        const range = new vscode.Range(
          new vscode.Position(0, annotation.startPos),
          new vscode.Position(0, annotation.endPos)
        );
        colorDecorationManager.applyDecoration(range, annotation.color);
      }
      logger.debug(`Loaded ${annotations.length} color annotations for ${storyId}`);
    } catch (error) {
      logger.error('Failed to load color annotations', { error });
    }
  });

  context.subscriptions.push(colorHookListener);
  logger.info('Color editor change listener registered');
}
```

- [ ] **Step 4: Add onDidSaveTextDocument hook for persisting colors**

After backup save handlers, add:

```typescript
// Persist color annotations on file save
if (colorAnnotationRepository) {
  const colorSaveListener = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (!colorDecorationManager) return;

    try {
      const annotations = colorDecorationManager.getDecorations();
      for (const annotation of annotations) {
        await colorAnnotationRepository.save(annotation);
      }
      logger.debug(`Saved ${annotations.length} color annotations for ${doc.uri.fsPath}`);
    } catch (error) {
      logger.error('Failed to save color annotations', { error });
    }
  });

  context.subscriptions.push(colorSaveListener);
  logger.info('Color save listener registered');
}
```

- [ ] **Step 5: Add onDidChangeTextDocument hook for tracking position changes**

Add:

```typescript
// Handle document changes to track color annotation positions
if (colorDecorationManager) {
  const colorChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
    if (!colorDecorationManager || event.document !== colorDecorationManager.editor.document) return;

    try {
      colorDecorationManager.handleDocumentChange(event);
    } catch (error) {
      logger.debug('Error handling document change for colors', { error });
    }
  });

  context.subscriptions.push(colorChangeListener);
}
```

- [ ] **Step 6: Register color hover provider**

Add:

```typescript
// Register color hover provider for markdown files
if (colorAnnotationRepository && database) {
  const colorHoverProvider = new ColorHoverProvider(
    BabelSettings.getColorPalette(),
    colorAnnotationRepository
  );

  const hoverRegistration = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'markdown' },
    colorHoverProvider
  );

  context.subscriptions.push(hoverRegistration);
  logger.info('Color hover provider registered');
}
```

- [ ] **Step 7: Register color commands**

Add (in CommandRegistry or extension init):

```typescript
// Register color commands
if (colorDecorationManager) {
  ApplyColorCommand.register(context, colorDecorationManager);
  RemoveColorCommand.register(context, colorDecorationManager);
  logger.info('Color commands registered');
}
```

- [ ] **Step 8: Commit**

```bash
git add src/extension.ts
git commit -m "feat: wire up color annotation hooks in extension.ts"
```

---

## Phase 8: Testing

### Task 9: Write integration tests

**Files:**
- Create: `test/integration/text-coloring.test.ts`

- [ ] **Step 1: Write integration test**

```typescript
// test/integration/text-coloring.test.ts
import * as vscode from 'vscode';
import { BabelDatabase } from '../../src/db/database';
import { ColorAnnotationRepository } from '../../src/db/colorAnnotationRepository';
import { ColorDecorationManager } from '../../src/views/colorDecorationManager';
import { ColorHoverProvider } from '../../src/views/colorHoverProvider';
import { v4 as uuid } from 'uuid';
import * as path from 'path';

describe('Text Coloring Integration', () => {
  let db: BabelDatabase;
  let repo: ColorAnnotationRepository;
  let mockEditor: vscode.TextEditor;
  let manager: ColorDecorationManager;

  beforeEach(async () => {
    db = new BabelDatabase({ path: ':memory:' });
    await db.initialize();
    repo = new ColorAnnotationRepository(db.getDb());

    // Seed a story
    const storyId = uuid();
    db.getDb().prepare('INSERT INTO stories (id, title, type, currentWordCount) VALUES (?, ?, ?, ?)').run(
      storyId,
      'Test Story',
      'short-story',
      1000
    );

    mockEditor = {
      document: {
        getText: jest.fn().mockReturnValue('hello world'),
        uri: { fsPath: '/test/story.md' },
      } as any,
      setDecorations: jest.fn(),
    } as any;

    manager = new ColorDecorationManager(mockEditor, {
      red: '#FF6B6B',
      blue: '#0066FF',
    });
    manager.setContext(storyId, 'main');
  });

  afterEach(() => {
    db.close();
  });

  describe('End-to-end coloring workflow', () => {
    it('should color text, save to DB, load from DB', async () => {
      const storyId = uuid();
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));

      // Step 1: User colors text
      manager.applyDecoration(range, 'red');

      // Step 2: Get annotations (simulate save)
      const annotations = manager.getDecorations();
      expect(annotations).toHaveLength(1);
      expect(annotations[0].color).toBe('red');

      // Step 3: Save to DB
      const saved = repo.save(annotations[0]);
      expect(saved.id).toBeDefined();

      // Step 4: Load from DB
      const loaded = repo.findByStoryAndVersion(storyId, 'main');
      expect(loaded).toHaveLength(1);
      expect(loaded[0].color).toBe('red');
    });

    it('should handle color replacement', async () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));

      // Apply red
      manager.applyDecoration(range, 'red');
      let annotations = manager.getDecorations();
      expect(annotations[0].color).toBe('red');

      // Replace with blue
      manager.applyDecoration(range, 'blue');
      annotations = manager.getDecorations();
      expect(annotations[0].color).toBe('blue');
    });

    it('should remove color', async () => {
      const range = new vscode.Range(new vscode.Position(0, 0), new vscode.Position(0, 5));

      manager.applyDecoration(range, 'red');
      expect(manager.getDecorations()).toHaveLength(1);

      manager.removeDecoration(0, 5);
      expect(manager.getDecorations()).toHaveLength(0);
    });
  });

  describe('Version-scoped colors', () => {
    it('should store colors per version', async () => {
      const storyId = uuid();

      // Create story
      db.getDb().prepare('INSERT INTO stories (id, title, type, currentWordCount) VALUES (?, ?, ?, ?)').run(
        storyId,
        'Test Story',
        'short-story',
        1000
      );

      // Color on main
      const annotation1 = {
        id: uuid(),
        storyId,
        versionId: 'main',
        startPos: 0,
        endPos: 5,
        color: 'red',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Color on feature
      const annotation2 = {
        id: uuid(),
        storyId,
        versionId: 'feature',
        startPos: 0,
        endPos: 5,
        color: 'blue',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      repo.save(annotation1);
      repo.save(annotation2);

      const mainColors = repo.findByStoryAndVersion(storyId, 'main');
      const featureColors = repo.findByStoryAndVersion(storyId, 'feature');

      expect(mainColors[0].color).toBe('red');
      expect(featureColors[0].color).toBe('blue');
    });
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
npm test -- test/integration/text-coloring.test.ts
```

Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add test/integration/text-coloring.test.ts
git commit -m "test: add text coloring integration tests"
```

---

## Phase 9: Polish & Finalization

### Task 10: Documentation and final checks

- [ ] **Step 1: Verify all tests pass**

```bash
npm test
```

Expected: All tests pass (859+ tests)

- [ ] **Step 2: Verify TypeScript compilation**

```bash
npm run compile
```

Expected: Zero errors, zero warnings

- [ ] **Step 3: Create feature documentation**

Create `docs/FEATURES.md` (if not exists) and add:

```markdown
## Text Coloring

Select any text in a story and hover to see a color palette. Click a color to highlight that text. Click the eraser to remove highlighting.

Colors are stored per-version, so different branches can have different highlighting schemes. Changes persist to disk on file save.

### Configuration

Customize the color palette in VSCode settings:

```json
{
  "babel.colors.palette": {
    "custom-red": "#FF0000",
    "custom-blue": "#0000FF"
  }
}
```

### Known Limitations

- Colors are stored by character position; if you delete text before or within a colored range, the colors shift or disappear
- Undo/redo don't affect colors (colors are independent of text edits)
- Only one editor window per story can have decorations active
```

- [ ] **Step 4: Update CHANGELOG (if exists)**

Add entry:

```markdown
## [0.2.0] - 2026-03-24

### Added
- Text coloring feature: Select text, hover to see color palette, click to highlight
- Per-version color annotations stored in database
- Configurable color palette via settings (babel.colors.palette)
- Color decorations with VSCode integration
```

- [ ] **Step 5: Final commit**

```bash
git add docs/FEATURES.md CHANGELOG.md
git commit -m "docs: add text coloring feature documentation"
```

---

## Summary

**Total tasks:** 10 + 1 documentation
**Estimated effort:** 25-30 hours
**Key deliverables:**
- ✅ Database migration and repository
- ✅ Decoration manager with VSCode integration
- ✅ Hover provider with color palette UI
- ✅ Color command handlers
- ✅ Extension.ts hooks for full lifecycle
- ✅ Settings and configuration
- ✅ Comprehensive test coverage
- ✅ Feature documentation

**Critical path dependencies:**
1. Types & Database (Task 1-2)
2. Repository (Task 3) ← depends on 1-2
3. DecorationManager (Task 4) ← depends on 1
4. HoverProvider (Task 5) ← depends on 1, 3
5. Commands (Task 6) ← depends on 4
6. Settings (Task 7) ← depends on 6
7. Extension integration (Task 8) ← depends on all
8. Testing (Task 9) ← can run parallel
9. Polish (Task 10) ← final pass

**Test coverage target:** 80%+ of new code
