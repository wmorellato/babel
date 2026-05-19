# TreeView Reveal Feature Design

**Date:** 2026-05-07  
**Feature:** Auto-reveal story in tree view when editor opens/switches to story files  
**Status:** Design approved

---

## Overview

When a user opens or switches to a story markdown file in the editor, the corresponding story and file are automatically revealed (scrolled to and highlighted) in the Stories tree view sidebar. This provides visual context about which story you're currently editing.

**Key behavior:**
- Only triggers for story files (UUID-based story IDs in path)
- Reveals the specific file, auto-expands its parent story
- 100ms debounce on rapid editor switches
- Tree view item is selected but does not steal focus from editor
- Non-story files (config, README, etc.) are ignored

---

## Architecture

### Components

**1. Tree Provider Enhancement** (`src/views/storyTreeDataProvider.ts`)
- Add `getParent(element)` method (required by VS Code reveal API)
- Add `getFileTreeItem(storyId, filePath)` helper for lookup
- Cache story items during tree construction for getParent queries

**2. Reveal Handler** (`src/extension/initialize-reveal.ts` — new file)
- Registers editor change listener via `ListenerCoordinator`
- Extracts storyId + filePath from active editor
- Validates storyId is UUID format
- Implements 100ms debounce
- Calls `treeView.reveal()` on matching FileTreeItem

### Data Flow

```
User switches editor
    ↓
onDidChangeActiveTextEditor fires
    ↓
Extract storyId + filePath from editor URI
    ↓
Validate storyId (UUID pattern)
    ↓
Debounce 100ms (collect rapid switches)
    ↓
Call treeDataProvider.getFileTreeItem(storyId, filePath)
    ↓
If found: call treeView.reveal(item, { select: true, focus: false })
         → reveal() uses getParent() to auto-expand story
If not found: log debug message, continue silently
```

---

## Implementation Details

### getParent() Implementation

```typescript
// In BabelStoriesTreeDataProvider
getParent(element: vscode.TreeItem): vscode.TreeItem | null {
  // If it's a FileTreeItem, its parent is the story
  if (element instanceof FileTreeItem) {
    return this.getStoryItem(element.storyId);
  }
  // Stories are root-level, no parent
  return null;
}

// Helper: retrieve or construct StoryTreeItem
private getStoryItem(storyId: string): StoryTreeItem | null {
  const story = this.storyRepository.findById(storyId);
  if (!story) return null;
  
  const versions = this.versionRepository.findByStoryId(storyId);
  return new StoryTreeItem(story, versions.length, 'unknown');
}
```

### FileTreeItem Lookup

```typescript
// In BabelStoriesTreeDataProvider
getFileTreeItem(storyId: string, filePath: string): vscode.TreeItem | null {
  const files = this.getFilesForStory(storyId);
  return files.find(f => f.resourceUri?.fsPath === filePath) || null;
}
```

### Reveal Handler

```typescript
// In initialize-reveal.ts
export async function initializeReveal(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { coordinator, workspacePath, treeDataProvider, logger } = deps;
  
  if (!treeDataProvider) {
    logger.warn('TreeDataProvider not available, skipping reveal initialization');
    return vscode.Disposable.from();
  }

  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let revealTimer: NodeJS.Timeout | null = null;
  let pendingEditor: vscode.TextEditor | undefined;

  coordinator.registerEditorChangeHandler(async (editor) => {
    // Clear existing timer
    if (revealTimer) clearTimeout(revealTimer);
    
    // No editor or not in workspace
    if (!editor || !editor.document.fileName.startsWith(workspacePath)) {
      return;
    }

    // Extract storyId from path: workspacePath/storyId/...
    const relativePath = path.relative(workspacePath, editor.document.fileName);
    const storyId = relativePath.split(path.sep)[0];

    // Validate storyId is UUID
    if (!UUID_PATTERN.test(storyId)) {
      return; // Non-story file, ignore
    }

    pendingEditor = editor;

    // Debounce 100ms
    revealTimer = setTimeout(async () => {
      if (pendingEditor?.document.fileName !== editor.document.fileName) {
        return; // Editor changed while debouncing
      }

      try {
        const fileItem = treeDataProvider.getFileTreeItem(storyId, editor.document.fileName);
        if (fileItem) {
          await treeView.reveal(fileItem, { select: true, focus: false });
          logger.debug(`Revealed file for story ${storyId}`);
        } else {
          logger.debug(`File not found in tree: ${editor.document.fileName}`);
        }
      } catch (error) {
        logger.error(`Failed to reveal file: ${error}`);
      }
    }, 100);
  });

  logger.info('Reveal handler initialized');
  return vscode.Disposable.from();
}
```

---

## Integration

### File Changes

1. **`src/views/storyTreeDataProvider.ts`**
   - Add `getParent(element)` method
   - Add `getFileTreeItem(storyId, filePath)` method
   - Add private `getStoryItem(storyId)` helper
   - Store FileTreeItems during tree construction for getParent

2. **`src/extension/initialize-reveal.ts`** (new file)
   - Export `initializeReveal(deps)` function
   - Register with ListenerCoordinator
   - Implement 100ms debounce + reveal logic

3. **`src/extension.ts`**
   - Import `initializeReveal`
   - Call during feature initialization (after tree providers init)
   - Store disposable in context.subscriptions

4. **`src/extension/types.ts`**
   - No changes needed (treeDataProvider already in ExtensionDependencies)

---

## Error Handling

| Scenario | Behavior | Log Level |
|----------|----------|-----------|
| Non-story file opened | Skip silently | — |
| FileTreeItem not found in tree | Log and continue | Debug |
| reveal() throws | Log error, continue | Error |
| TreeDataProvider not available | Skip registration with warning | Warn |
| Editor outside workspace | Skip silently | — |
| Rapid editor switches | Debounce 100ms, coalesce into single reveal | — |

**Philosophy:** Reveal is a nice-to-have feature. Failures are silent and don't disrupt the editor.

---

## Testing Scenarios

1. ✅ Open story file → story + file highlighted in tree
2. ✅ Rapid switches between files in same story → single reveal, no flashing
3. ✅ Switch between different stories → each story reveals correctly
4. ✅ Open non-story file (README) → tree unchanged
5. ✅ Close editor / no active editor → no errors
6. ✅ Story folder deleted but editor open → reveal fails silently
7. ✅ File moved/renamed → reveal unable to find (acceptable)
8. ✅ Tree not initialized → handler skips gracefully

---

## Edge Cases Handled

- **Nested file paths:** Full path comparison avoids collisions
- **Many files in story:** O(n) iteration acceptable, logged if slow
- **Multiple rapid switches:** Debounce coalesces into single reveal
- **Deleted files:** Reveal silently fails, user can navigate manually
- **Concurrent operations:** Timer cleanup prevents race conditions

---

## What We're NOT Handling

- Following tree selection with keyboard navigation (no focus steal)
- Persisting reveal state across sessions (VS Code handles this)
- Revealing files that were deleted from disk
- Optimizing for stories with 1000+ files (edge case, acceptable O(n) cost)

---

## Dependencies

- **VS Code API:** `TreeView.reveal()`, `TreeDataProvider.getParent()`
- **Existing:** `ListenerCoordinator`, `BabelStoriesTreeDataProvider`
- **No new packages required**

---

## Future Improvements

- Cache FileTreeItems by path for O(1) lookup if reveal becomes slow
- Add configuration option to toggle reveal on/off
- Extend to reveal nested folder structures (if supported in future)
