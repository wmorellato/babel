# Text Coloring Feature Design
**Date:** 2026-03-24
**Feature:** Inline text coloring for story editing with version-scoped persistence

## Overview

Enable writers to highlight story text with colors for editorial feedback, scene organization, or other collaborative markup. Users select text, hover to see a color palette dialog (with configurable colors), click a color to apply, and colors persist across file saves and VSCode restarts. Colors are stored per-version so different branches can have different highlighting schemes.

## Requirements

- **Selection hover:** Colored circle codicons (🔴🔵🟢🟡🟣...) appear when hovering over selected text
- **Color application:** Click codicon to apply color to selection; click same color again = no-op
- **Color switching:** Click different color to change selection's color
- **Eraser button:** Click eraser codicon to remove all color from selection
- **Position tracking:** Colors stay anchored to character positions; survive text edits before/after/within colored ranges
- **Persistence:** Colors persist across file saves and VSCode restarts
- **Per-version scope:** Colors are stored per git branch/version, not shared across versions
- **Configurable palette:** Users can customize color palette via settings with harmonic defaults
- **Sync strategy:** Decorations live in editor memory; only synced to database on file save and loaded on startup/version-switch

## Architecture

### Storage Model

**ColorAnnotation Table**
```
id: uuid (primary key)
storyId: uuid (foreign key to stories)
versionId: string (git branch identifier)
startPos: number (0-based character offset in file)
endPos: number (0-based character offset in file)
color: string (from configured palette, e.g., "red", "blue")
createdAt: timestamp
updatedAt: timestamp

Indices:
  - (storyId, versionId) for version-scoped lookups
  - Constraint: unique (storyId, versionId, startPos, endPos)
```

### Rendering Model

**VSCode TextEditorDecorationType** — Use VSCode's built-in decoration system to render colored text. VSCode automatically tracks range positions as the document changes, handling insertions/deletions/splits without manual position math.

### Sync Strategy

**Volatile Decorations, Durable Database**
- Decorations are ephemeral (live in editor memory only)
- Database is source of truth for persistence
- Clear sync points prevent complexity:
  - **On startup:** Load annotations from DB → create decorations
  - **On file save:** Extract decoration positions → upsert to DB
  - **On version switch:** Unload current version's decorations → load new version's decorations

## Key Implementation Details

### File Path → StoryId Resolution
Stories are stored as directories under the workspace root. Extract story ID from file path:
```typescript
// In extension.ts or wherever active editor changes
const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
const filePath = editor.document.uri.fsPath
const storyId = path.relative(workspacePath, filePath).split(path.sep)[0]
// Example: if file is /workspace/abc-123-def/story.md → storyId = 'abc-123-def'
```

### VersionId Resolution
Get current git branch to determine version scope:
```typescript
const versionId = await gitRepository.getCurrentBranch()
// Returns: 'main', 'feature/xyz', etc.
```

### onDidChangeTextDocument Handler
When document changes, update or remove annotations based on whether decorated ranges are affected:
```typescript
vscode.workspace.onDidChangeTextDocument((event) => {
  if (event.document !== editor.document) return

  colorDecorationManager.handleDocumentChange(event)
  // Manager checks: for each contentChange, does it overlap any decoration?
  // If entire range deleted: remove decoration from memory
  // If partial delete: decoration shrinks (VSCode Range auto-tracks)
  // On next save, getDecorations() returns updated positions
})
```

---

## Component Design

### 1. ColorAnnotationRepository
**File:** `src/db/colorAnnotationRepository.ts`
**Responsibility:** Database access layer for color annotations

**Methods:**
```typescript
class ColorAnnotationRepository extends Repository {
  // Retrieve all annotations for a story version
  findByStoryAndVersion(storyId: string, versionId: string): ColorAnnotation[]

  // Retrieve annotation for a specific range (for hover detection)
  findByRange(storyId: string, versionId: string, startPos: number, endPos: number): ColorAnnotation | undefined

  // Save or update an annotation
  save(annotation: ColorAnnotation): ColorAnnotation

  // Delete by ID
  delete(id: string): void

  // Delete all annotations for a range (used when removing color)
  deleteByRange(storyId: string, versionId: string, startPos: number, endPos: number): void

  // Delete all annotations for a story version (used on version deletion)
  deleteByVersion(storyId: string, versionId: string): void
}
```

### 2. ColorDecorationManager
**File:** `src/views/colorDecorationManager.ts`
**Responsibility:** Manage decoration lifecycle in the active editor

**Methods:**
```typescript
class ColorDecorationManager {
  constructor(editor: vscode.TextEditor, colorSettings: ColorPalette)

  // Apply or update a decoration for a range
  applyDecoration(range: vscode.Range, color: string): void

  // Remove a decoration for a range
  removeDecoration(startPos: number, endPos: number): void

  // Load all decorations for a version from DB
  async loadVersion(storyId: string, versionId: string): Promise<void>

  // Unload all decorations for current version
  unloadVersion(): void

  // Get current decorations as annotation objects (for saving to DB)
  getDecorations(): ColorAnnotation[]

  // Handle editor changes (cleanup if decorated ranges are deleted)
  handleDocumentChange(event: vscode.TextDocumentChangeEvent): void
}
```

**Internal State:**
```typescript
// Map indexed by "(startPos,endPos)" string key for O(1) lookup of existing decorations
private decorations: Map<string, {
  range: vscode.Range,
  color: string,
  decorationType: vscode.TextEditorDecorationType
}>

// Helper to create key
private key(startPos: number, endPos: number): string {
  return `${startPos},${endPos}`
}
```

- Current story/version context
- Reference to active editor (single editor per manager instance)

### 3. ColorHoverProvider
**File:** `src/views/colorHoverProvider.ts`
**Responsibility:** Show color palette and eraser button on selection hover

**Pattern:** Extends `vscode.HoverProvider`, follows existing `SelectionWordCountHover` pattern

**Logic:**
1. Detect if hover position is within a non-empty selection
2. Query `ColorAnnotationRepository.findByRange(storyId, versionId, selection.start, selection.end)` to get existing color
3. Create hover with:
   - All palette color buttons (from settings palette)
   - Eraser button (only if `findByRange()` returns non-null)
   - Visual indicator for current color (if already colored)
4. Each button is a `vscode.Command` that triggers apply/remove command with selection context

**Command format:**
```typescript
new vscode.Command('Apply Red', 'babel.applyColor.red', editor, selection, 'red')
new vscode.Command('Remove Color', 'babel.removeColor', editor, selection)
```

### 4. Color Commands
**Files:** `src/core/commands/applyColorCommand.ts`, `src/core/commands/removeColorCommand.ts`

**ApplyColorCommand**
```typescript
// Registered as: babel.applyColor.<colorName>
// Called with (editor, selection, colorName)
// Updates decoration immediately
// Mark for DB sync on next file save
```

**RemoveColorCommand**
```typescript
// Registered as: babel.removeColor
// Called with (editor, selection)
// Remove decoration immediately
// Mark for DB sync on next file save
```

### 5. Extension Integration Hooks

**On startup (in extension.ts activate()):**
```typescript
// Initialize color annotation repository and settings
const colorAnnotationRepository = new ColorAnnotationRepository(database.getDb())
const colorSettings = BabelSettings.getColorPalette() // or vscode.workspace.getConfiguration('babel.colors')

// When editor opens, load decorations for current story/version
let colorDecorationManager: ColorDecorationManager | null = null

const updateColorDecorations = async (editor: vscode.TextEditor | undefined) => {
  if (!editor || !gitRepository) return

  const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  if (!workspacePath || !editor.document.uri.fsPath.startsWith(workspacePath)) return

  const storyId = path.relative(workspacePath, editor.document.uri.fsPath).split(path.sep)[0]
  const versionId = await gitRepository.getCurrentBranch()

  colorDecorationManager = new ColorDecorationManager(editor, colorSettings)
  await colorDecorationManager.loadVersion(storyId, versionId)
}

// Initial load for active editor
await updateColorDecorations(vscode.window.activeTextEditor)

// Reload when switching editors
const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(updateColorDecorations)
context.subscriptions.push(editorChangeListener)
```

**On file save:**
```typescript
const saveListener = vscode.workspace.onDidSaveTextDocument(async (doc) => {
  if (!colorDecorationManager || doc !== colorDecorationManager.editor.document) return

  try {
    const annotations = colorDecorationManager.getDecorations()
    for (const annotation of annotations) {
      await colorAnnotationRepository.save(annotation)
    }
    logger.debug(`Saved ${annotations.length} color annotations for ${doc.uri.fsPath}`)
  } catch (error) {
    logger.error('Failed to save color annotations', { error })
  }
})
context.subscriptions.push(saveListener)
```

**On document change (position tracking):**
```typescript
const changeListener = vscode.workspace.onDidChangeTextDocument((event) => {
  if (!colorDecorationManager || event.document !== colorDecorationManager.editor.document) return

  try {
    colorDecorationManager.handleDocumentChange(event)
  } catch (error) {
    logger.debug('Error handling document change for color decorations', { error })
  }
})
context.subscriptions.push(changeListener)
```

**On version switch (in VersionSwitcher after git checkout):**
```typescript
// After successfully switching branches
colorDecorationManager?.unloadVersion()

const versionId = await gitRepository.getCurrentBranch()
const storyId = /* extract from current editor */
await colorDecorationManager?.loadVersion(storyId, versionId)

// Or call updateColorDecorations to reload completely
await updateColorDecorations(vscode.window.activeTextEditor)
```

**Register color commands (in CommandRegistry):**
```typescript
// For each color in palette
for (const colorName of Object.keys(colorSettings.palette)) {
  vscode.commands.registerCommand(`babel.applyColor.${colorName}`, (editor, selection, color) => {
    if (!colorDecorationManager || !editor || !selection) {
      vscode.window.showErrorMessage('No text selected')
      return
    }
    const range = new vscode.Range(selection.start, selection.end)
    colorDecorationManager.applyDecoration(range, colorName)
  })
}

// Eraser command
vscode.commands.registerCommand('babel.removeColor', (editor, selection) => {
  if (!colorDecorationManager || !editor || !selection) {
    vscode.window.showErrorMessage('No text selected')
    return
  }
  colorDecorationManager.removeDecoration(selection.start.character, selection.end.character)
})
```

## Data Flow

### User Colors Text (Happy Path)
```
User selects "hello" → hovers
  ↓
ColorHoverProvider.provideHover() fires
  ↓
Create hover with [🔴🔵🟢 | eraser]
  ↓
User clicks 🔴
  ↓
ApplyColorCommand('red', selection) fires
  ↓
ColorDecorationManager.applyDecoration(range, 'red')
  ↓
VSCode renders decoration immediately
  ↓
User saves file
  ↓
onDidSaveTextDocument fires
  ↓
colorDecorationManager.getDecorations() → [{storyId, versionId, startPos, endPos, 'red'}]
  ↓
ColorAnnotationRepository.save()
  ↓
Annotation persisted to DB
```

### VSCode Restart
```
Extension activates
  ↓
User opens story file
  ↓
Determine storyId, versionId from file path
  ↓
ColorAnnotationRepository.findByStoryAndVersion(storyId, versionId)
  ↓
Get: [{startPos: 5, endPos: 10, color: 'red'}, ...]
  ↓
For each, create Range(startPos, endPos) and apply TextEditorDecorationType
  ↓
Decorations visible in editor
```

### Version Switch
```
User switches branch (e.g., via VersionSwitcher)
  ↓
colorDecorationManager.unloadVersion()
  ↓
All decorations removed from editor
  ↓
ColorAnnotationRepository.findByStoryAndVersion(storyId, newVersionId)
  ↓
Get annotations for new version
  ↓
colorDecorationManager.loadVersion(storyId, newVersionId)
  ↓
Decorations for new version applied to editor
```

## Error Handling

**Position Out of Bounds**
- On file open: validate stored `(startPos, endPos)` against actual file length
- If out of bounds: skip annotation with warning log
- Rationale: File may have been edited externally; gracefully degrade

**Overlapping Annotations**
- DB constraint ensures unique `(storyId, versionId, startPos, endPos)`
- Applying new color overwrites old (expected: re-paint)
- No merge conflicts possible

**Empty Selection**
- `ColorHoverProvider` checks `selection.isEmpty`
- Skip if true; user must select actual text

**Orphaned Annotations**
- If story deleted: annotations remain in DB (inert)
- Optional future: cleanup task to delete annotations for non-existent stories

**Document Changes During Session**
- `ColorDecorationManager.handleDocumentChange()` listens to `onDidChangeTextDocument`
- If decorated range is deleted: remove annotation from memory
- On next save: deletion synced to DB

## Testing Strategy

**Unit Tests**
- `ColorAnnotationRepository`: CRUD operations, queries, constraints
- `ColorDecorationManager`: decoration lifecycle, range tracking, version loading
- `ColorHoverProvider`: hover detection, button generation
- Command handlers: color/remove execution

**Integration Tests**
- Color → save → DB verify
- Load version → decorations appear
- Switch version → decorations swap
- Delete range → annotation removed

**E2E Tests**
- Full workflow: open file → select text → color → save → close/reopen VSCode → verify color persists
- Version switch preserves correct colors per version
- External file edits don't break annotation positions

## Configuration

**New settings (babel.colors.*)**
```json
{
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
    "description": "Custom color palette for text highlighting (hex values)"
  }
}
```

Writers can override in their VSCode settings to add/remove/customize colors.

## Migration & Backward Compatibility

**Database Migration**
- Add `color_annotations` table with schema above
- No breaking changes to existing tables
- Safe to deploy: old stories unaffected

**Migration file template (src/db/migrations/v6-color-annotations.ts):**
```typescript
import { Migration } from '../database'

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
    `)
  },
  down: (db) => {
    db.exec('DROP TABLE color_annotations')
  }
}
```

Register in database.ts: add `v6ColorAnnotations` to migrations array in order.

**Feature Flag (Optional)**
- Initially enable for opt-in testing
- Toggle: `babel.colors.enabled` (default: true after stabilization)

## Performance Considerations

- Typical story: <100 color annotations
- DB query `(storyId, versionId)`: O(log N) with index
- Decoration rendering: VSCode handles efficiently
- Memory footprint: negligible (~1KB per annotation)
- No real-time sync overhead (sync only on save/startup)

## Known Limitations (MVP)

1. **Single editor per story** — ColorDecorationManager handles one editor at a time. If user opens same story in split pane (2 editor groups), only the active editor gets decorations. Non-blocking for MVP; future enhancement: multiple managers, one per editor.

2. **No undo/redo integration** — Color changes don't integrate with VSCode undo stack. User can undo text edits but not color operations. Acceptable for MVP; future enhancement: integrate commands with VSCode undo system.

3. **No merge conflict handling** — If multiple git branches have colors for the same line, switching branches shows the version's colors. If same range is colored differently in two branches, visual conflict when switching. Expected behavior; document for users.

## Future Extensions

- **Undo/redo integration** — Currently colors are permanent until manually removed; could integrate with VSCode undo stack
- **Multiple editor support** — Handle split pane scenarios with decorations in all editor groups
- **Color categories** — Semantic meanings (e.g., "edit-needed", "reviewed") with category-specific styling
- **Export annotations** — Output colored sections as a report for editorial workflow
- **Collaborative coloring** — With multi-user support (future)
- **Color history** — Track who colored what when (requires user identity)
