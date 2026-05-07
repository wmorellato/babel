# TreeView Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-reveal story files in the tree view when editors open/switch to story markdown files.

**Architecture:** Hook into editor change listener via ListenerCoordinator. Extract storyId + file path from active editor. Find matching FileTreeItem in tree and reveal it using VS Code's TreeView.reveal() API, which auto-expands ancestors via getParent().

**Tech Stack:** VS Code API (TreeView, TextEditor), TypeScript, Jest for unit tests

---

## Task 1: Add getParent() and Helper Methods to BabelStoriesTreeDataProvider

**Files:**
- Modify: `src/views/storyTreeDataProvider.ts`
- Create: `src/views/__tests__/storyTreeDataProvider.test.ts` (if doesn't exist)

### Step 1.1: Write unit tests for getParent() and getFileTreeItem()

Create/update `src/views/__tests__/storyTreeDataProvider.test.ts`:

```typescript
import { BabelStoriesTreeDataProvider } from '../storyTreeDataProvider';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';
import { StoryTreeItem } from '../storyTreeItem';
import { FileTreeItem } from '../fileTreeItem';
import { Story, StoryType } from '../../types/index';

describe('BabelStoriesTreeDataProvider', () => {
  let provider: BabelStoriesTreeDataProvider;
  let storyRepository: jest.Mocked<StoryRepository>;
  let versionRepository: jest.Mocked<VersionRepository>;
  let gitRepository: jest.Mocked<GitRepository>;

  beforeEach(() => {
    storyRepository = {
      findAll: jest.fn(() => []),
      findById: jest.fn(),
    } as any;

    versionRepository = {
      findByStoryId: jest.fn(() => []),
    } as any;

    gitRepository = {} as any;

    provider = new BabelStoriesTreeDataProvider(
      storyRepository,
      versionRepository,
      gitRepository,
      '/workspace'
    );
  });

  describe('getParent', () => {
    it('returns null for StoryTreeItem (root level)', () => {
      const story: Story = {
        id: '12345678-1234-1234-1234-123456789012',
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        createdAt: Date.now(),
        currentWordCount: 1000,
      };
      const storyItem = new StoryTreeItem(story);

      const parent = provider.getParent(storyItem);
      expect(parent).toBeNull();
    });

    it('returns StoryTreeItem for FileTreeItem (file is child of story)', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const story: Story = {
        id: storyId,
        displayName: 'Test Story',
        type: StoryType.NOVEL,
        createdAt: Date.now(),
        currentWordCount: 1000,
      };

      storyRepository.findById.mockReturnValue(story);
      versionRepository.findByStoryId.mockReturnValue([]);

      const fileItem = new FileTreeItem('chapter1.md', '/workspace/storyId/chapter1.md', storyId);
      const parent = provider.getParent(fileItem);

      expect(parent).toBeInstanceOf(StoryTreeItem);
      expect((parent as StoryTreeItem).storyId).toBe(storyId);
    });

    it('returns null for FileTreeItem if story not found', () => {
      storyRepository.findById.mockReturnValue(null);

      const fileItem = new FileTreeItem('chapter1.md', '/workspace/storyId/chapter1.md', 'nonexistent');
      const parent = provider.getParent(fileItem);

      expect(parent).toBeNull();
    });
  });

  describe('getFileTreeItem', () => {
    it('returns FileTreeItem if file exists in story', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const filePath = '/workspace/12345678-1234-1234-1234-123456789012/chapter1.md';

      // Mock getFilesForStory to return a file
      jest.spyOn(provider as any, 'getFilesForStory').mockReturnValue([
        new FileTreeItem('chapter1.md', filePath, storyId),
      ]);

      const result = provider.getFileTreeItem(storyId, filePath);

      expect(result).toBeInstanceOf(FileTreeItem);
      expect(result?.resourceUri?.fsPath).toBe(filePath);
    });

    it('returns null if file not found in story', () => {
      const storyId = '12345678-1234-1234-1234-123456789012';
      const filePath = '/workspace/12345678-1234-1234-1234-123456789012/notfound.md';

      jest.spyOn(provider as any, 'getFilesForStory').mockReturnValue([
        new FileTreeItem('chapter1.md', '/workspace/12345678-1234-1234-1234-123456789012/chapter1.md', storyId),
      ]);

      const result = provider.getFileTreeItem(storyId, filePath);

      expect(result).toBeNull();
    });
  });
});
```

- [ ] **Step 1.2: Run tests to verify they fail**

```bash
npm test -- src/views/__tests__/storyTreeDataProvider.test.ts
```

Expected output: Tests fail with "getParent is not a function" and "getFileTreeItem is not a function"

- [ ] **Step 1.3: Implement getParent() in BabelStoriesTreeDataProvider**

In `src/views/storyTreeDataProvider.ts`, add after the `getChildren()` method (around line 118):

```typescript
  /**
   * Get parent of a tree item (required for reveal API)
   */
  getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    // If it's a FileTreeItem, its parent is the story
    if (element instanceof FileTreeItem) {
      const storyItem = this.getStoryItem(element.storyId);
      return storyItem;
    }
    // Stories are root-level, no parent
    return null;
  }

  /**
   * Get or construct StoryTreeItem by ID
   */
  private getStoryItem(storyId: string): StoryTreeItem | null {
    const story = this.storyRepository.findById(storyId);
    if (!story) {
      return null;
    }

    const versions = this.versionRepository.findByStoryId(storyId);
    const versionCount = versions.length;

    return new StoryTreeItem(story, versionCount, 'unknown');
  }
```

- [ ] **Step 1.4: Implement getFileTreeItem() in BabelStoriesTreeDataProvider**

Add after the `getStoryItem()` method:

```typescript
  /**
   * Get FileTreeItem by story ID and file path
   * Used by reveal feature to find the file to highlight
   */
  getFileTreeItem(storyId: string, filePath: string): vscode.TreeItem | null {
    const files = this.getFilesForStory(storyId);
    return files.find(f => f.resourceUri?.fsPath === filePath) || null;
  }
```

- [ ] **Step 1.5: Run tests to verify they pass**

```bash
npm test -- src/views/__tests__/storyTreeDataProvider.test.ts
```

Expected output: All tests pass

- [ ] **Step 1.6: Run TypeScript compiler to check for errors**

```bash
npm run compile:check
```

Expected output: No errors

- [ ] **Step 1.7: Commit**

```bash
git add src/views/storyTreeDataProvider.ts src/views/__tests__/storyTreeDataProvider.test.ts
git commit -m "feat: add getParent and getFileTreeItem methods to tree provider"
```

---

## Task 2: Create initialize-reveal.ts with Reveal Handler

**Files:**
- Create: `src/extension/initialize-reveal.ts`

- [ ] **Step 2.1: Create the reveal initialization file**

Create `src/extension/initialize-reveal.ts`:

```typescript
/**
 * Reveal Feature
 * Auto-reveals story file in tree view when editor opens/switches to story markdown files
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionDependencies } from './types';
import { Logger } from '../utils/logger';

const logger = new Logger('RevealFeature');
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBOUNCE_MS = 100;

/**
 * Initialize reveal feature
 * Hooks into editor changes to auto-reveal the current story file in the tree view
 */
export async function initializeReveal(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { coordinator, workspacePath, treeDataProvider, logger: depsLogger } = deps;

  if (!treeDataProvider) {
    depsLogger.warn('TreeDataProvider not available, skipping reveal initialization');
    return vscode.Disposable.from();
  }

  // Get the TreeView instance registered for 'babelStories'
  const treeView = vscode.window.createTreeView('babelStories', {
    treeDataProvider,
  });

  let revealTimer: NodeJS.Timeout | null = null;
  let pendingEditor: vscode.TextEditor | undefined;

  /**
   * Handler for editor changes - reveals the story file in the tree
   */
  const editorChangeHandler = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    // Clear existing timer
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    // No editor or file is outside workspace
    if (!editor || !editor.document.fileName.startsWith(workspacePath)) {
      return;
    }

    const fileName = editor.document.fileName;

    // Extract storyId from path: workspacePath/storyId/...
    const relativePath = path.relative(workspacePath, fileName);
    const pathSegments = relativePath.split(path.sep);
    
    if (pathSegments.length === 0) {
      return;
    }

    const storyId = pathSegments[0];

    // Validate storyId is UUID format (ignore non-story files)
    if (!UUID_PATTERN.test(storyId)) {
      return;
    }

    // Store reference to detect if editor changes while debouncing
    pendingEditor = editor;

    // Debounce: wait 100ms to batch rapid editor switches
    revealTimer = setTimeout(async () => {
      // Check if editor changed while we were debouncing
      if (pendingEditor?.document.fileName !== fileName) {
        return;
      }

      try {
        // Find the FileTreeItem in the tree
        const fileItem = treeDataProvider.getFileTreeItem(storyId, fileName);

        if (fileItem) {
          // Reveal the file item (auto-expands story via getParent)
          await treeView.reveal(fileItem, {
            select: true,  // Highlight/select the item
            focus: false,  // Don't steal focus from editor
          });

          depsLogger.debug(`Revealed file for story ${storyId}: ${path.basename(fileName)}`);
        } else {
          // File not found in tree - this can happen if file was just created or not yet in tree
          depsLogger.debug(`File not found in tree: ${fileName}`);
        }
      } catch (error) {
        depsLogger.error(`Failed to reveal file: ${error}`);
      }
    }, DEBOUNCE_MS);
  };

  // Register the editor change handler with the coordinator
  coordinator.registerEditorChangeHandler(editorChangeHandler);

  depsLogger.info('Reveal feature initialized');

  // Return disposable for cleanup
  return vscode.Disposable.from(treeView);
}
```

- [ ] **Step 2.2: Verify syntax with TypeScript compiler**

```bash
npm run compile:check
```

Expected output: No errors in `initialize-reveal.ts`

- [ ] **Step 2.3: Commit**

```bash
git add src/extension/initialize-reveal.ts
git commit -m "feat: create reveal feature handler with debounce"
```

---

## Task 3: Integrate Reveal into Extension Initialization

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 3.1: Add import for initializeReveal**

In `src/extension.ts`, find the imports section (around line 1-30) and add:

```typescript
import { initializeReveal } from './extension/initialize-reveal';
```

Add it after the other initialize imports (after `initializeAutoCommit`, `initializeCommands`, etc.)

- [ ] **Step 3.2: Call initializeReveal during extension activation**

In the `activate()` function, find the "FEATURE INITIALIZATION" section (around line 157-169). The order matters: reveal must be called AFTER tree providers are initialized (so treeDataProvider is available) but can be before or after other features.

Find this block:
```typescript
    // 2. Initialize core features
    const colorDisposable = await initializeColorAnnotations(deps);
    const autoCommitDisposable = await initializeAutoCommit(deps);
    const wordCountDisposable = await initializeWordCount(deps);

    // 3. Initialize features that depend on tree provider (must come after tree init)
    const commandDisposable = initializeCommands(deps);
```

Add the reveal initialization after wordCount but before or after commands:

```typescript
    // 2. Initialize core features
    const colorDisposable = await initializeColorAnnotations(deps);
    const autoCommitDisposable = await initializeAutoCommit(deps);
    const wordCountDisposable = await initializeWordCount(deps);
    const revealDisposable = await initializeReveal(deps);

    // 3. Initialize features that depend on tree provider (must come after tree init)
    const commandDisposable = initializeCommands(deps);
```

- [ ] **Step 3.3: Register the reveal disposable**

In the same section, find where disposables are registered (around line 190):

```typescript
    context.subscriptions.push(
      treeProviderDisposable,
      statusBarDisposable,
      // ... other disposables
    );
```

Add `revealDisposable` to the array:

```typescript
    context.subscriptions.push(
      treeProviderDisposable,
      statusBarDisposable,
      colorDisposable,
      autoCommitDisposable,
      wordCountDisposable,
      revealDisposable,  // Add this line
      commandDisposable,
      // ... rest of disposables
    );
```

- [ ] **Step 3.4: Verify TypeScript compilation**

```bash
npm run compile:check
```

Expected output: No errors

- [ ] **Step 3.5: Verify the build works**

```bash
npm run compile
```

Expected output: Successfully compiled, creates `dist/extension.js` (~2.2mb)

- [ ] **Step 3.6: Commit**

```bash
git add src/extension.ts
git commit -m "feat: integrate reveal feature into extension initialization"
```

---

## Task 4: Manual Testing and Verification

**Files:** None (testing only)

- [ ] **Step 4.1: Start the extension in debug mode**

Open the project in VS Code and press `F5` to launch the debug instance of the extension.

Expected: Extension loads without errors, you see "Reveal feature initialized" in the debug console.

- [ ] **Step 4.2: Test basic reveal functionality**

In the debug instance:

1. Open a story markdown file (e.g., click on a file in the Babel Stories tree view)
2. Verify the file appears highlighted in the tree view
3. Verify the story is expanded to show the file
4. Verify the tree view did NOT steal focus (you can still type in the editor)

Expected: File is highlighted and visible in tree, story is expanded

- [ ] **Step 4.3: Test debounce on rapid switches**

In the debug instance:

1. Click rapidly between 3-4 different files in the same story
2. Watch the tree view

Expected: Tree view updates smoothly, no excessive flashing (debounce is working)

- [ ] **Step 4.4: Test switching between different stories**

In the debug instance:

1. Open a file from Story A
2. Verify Story A is revealed
3. Open a file from Story B
4. Verify Story B is revealed (previous story may collapse)

Expected: Each story reveals correctly when you switch files

- [ ] **Step 4.5: Test non-story files are ignored**

In the debug instance:

1. If there's a README.md or .md file in the root workspace
2. Open it
3. Verify the tree view does NOT change

Expected: Non-story files don't trigger reveal

- [ ] **Step 4.6: Test closing the editor**

In the debug instance:

1. Close the active editor (Ctrl+W)
2. Verify no errors occur

Expected: No errors in debug console

- [ ] **Step 4.7: Verify no regressions in other features**

In the debug instance:

1. Create a new story (should work as before)
2. Switch versions (should work as before)
3. Auto-commit a file with word count change (should work as before)
4. Test keyboard shortcuts still work

Expected: All existing features work normally

- [ ] **Step 4.8: Check logs for expected debug messages**

Open Debug Console (View → Debug Console or Ctrl+Shift+Y):

1. Switch between files
2. Look for debug messages like: "Revealed file for story 12345678-1234-1234-1234-123456789012: chapter1.md"

Expected: You see appropriate debug messages, no error messages

- [ ] **Step 4.9: Commit test results (if making any doc changes)**

If you made any notes/changes during testing, commit them:

```bash
git add .
git commit -m "test: verify reveal feature works end-to-end"
```

---

## Spec Coverage Checklist

- ✅ **getParent() method** → Task 1 (steps 1.3-1.7)
- ✅ **getFileTreeItem() helper** → Task 1 (steps 1.4-1.7)
- ✅ **initialize-reveal.ts creation** → Task 2 (steps 2.1-2.3)
- ✅ **Debounce 100ms** → Task 2, step 2.1 (DEBOUNCE_MS = 100, setTimeout)
- ✅ **UUID validation for story files** → Task 2, step 2.1 (UUID_PATTERN check)
- ✅ **TreeView.reveal() call** → Task 2, step 2.1 (treeView.reveal with select/focus)
- ✅ **Integration into extension.ts** → Task 3 (steps 3.1-3.6)
- ✅ **Error handling (silent fails)** → Task 2, step 2.1 (try/catch, debug logging)
- ✅ **Editor change listener registration** → Task 2, step 2.1 (coordinator.registerEditorChangeHandler)
- ✅ **Unit tests** → Task 1, steps 1.1-1.7

---

## Summary

**Total Tasks:** 4  
**Estimated Time:** 30-45 minutes  
**Key Commits:** 3 feature commits + 1 test commit  

Each task is independent and testable:
- Task 1: Tree provider methods (unit tested)
- Task 2: Reveal handler logic (code review)
- Task 3: Extension integration (build verified)
- Task 4: End-to-end manual testing
