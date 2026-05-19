# Welcome View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display a welcome view when opening a folder without `.babel/babel.db`, preventing automatic workspace creation until the user explicitly clicks a button.

**Architecture:** On activation, check for `.babel/babel.db`. If missing, skip all feature initialization and rely on `viewsWelcome` to display a welcome message in the Stories panel. Register a `babel.createWorkspace` command that creates the directory, initializes the database, and reloads the window.

**Tech Stack:** VSCode API (`viewsWelcome`, `registerCommand`), TypeScript, existing Babel database initialization

---

## Task 1: Create Workspace Initialization Handler

**Files:**
- Create: `src/extension/initialize-workspace.ts`

The handler will be called when the user clicks the "Create Babel Workspace" button. It creates the `.babel` directory, initializes the database, shows a success message, and reloads the window.

- [ ] **Step 1: Create initialize-workspace.ts with workspace creation handler**

Create file at `src/extension/initialize-workspace.ts`:

```typescript
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { BabelDatabase } from '../db/database';

const logger = new Logger('InitializeWorkspace');

export async function createWorkspaceHandler(
  workspacePath: string,
  databasePath: string,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const babelDir = path.dirname(databasePath);

    // Create .babel directory if it doesn't exist
    if (!fs.existsSync(babelDir)) {
      fs.mkdirSync(babelDir, { recursive: true });
      logger.info(`Created .babel directory at ${babelDir}`);
    }

    // Initialize database with schema
    const database = new BabelDatabase({ path: databasePath });
    await database.initialize();
    logger.info('Babel database initialized');

    vscode.window.showInformationMessage('Babel workspace created! Reloading...');

    // Reload window to trigger full extension initialization
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (error) {
    logger.error('Failed to create workspace', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create Babel workspace: ${errorMessage}`);
  }
}
```

- [ ] **Step 2: Verify file syntax**

Check the file compiles:
```bash
npx tsc --noEmit src/extension/initialize-workspace.ts
```

Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/extension/initialize-workspace.ts
git commit -m "feat: add workspace initialization handler"
```

---

## Task 2: Update package.json Contributions

**Files:**
- Modify: `package.json` (two sections: `viewsWelcome` and `commands`)

Add the welcome view markdown and register the new command.

- [ ] **Step 1: Add viewsWelcome contribution**

In `package.json`, find the `"contributes"` object. Add this section after `"views"`:

```json
"viewsWelcome": [
  {
    "view": "babelStories",
    "contents": "No Babel workspace found in this folder.\n\nClick the button below to create a Babel workspace and start managing your stories.\n\n[Create Babel Workspace](command:babel.createWorkspace)"
  }
]
```

- [ ] **Step 2: Add createWorkspace command to commands array**

In `package.json`, find the `"commands"` array in `"contributes"`. Add this object to the end of the array:

```json
{
  "command": "babel.createWorkspace",
  "title": "Babel: Create Workspace",
  "category": "Babel"
}
```

- [ ] **Step 3: Verify JSON syntax**

Run:
```bash
jq empty package.json
```

Expected: No errors (output is empty)

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add welcome view and createWorkspace command to manifest"
```

---

## Task 3: Modify Extension Activation Logic

**Files:**
- Modify: `src/extension.ts` (lines 41–72, activation function)

Add early-exit check for missing database and register the workspace command.

- [ ] **Step 1: Import the new handler**

At the top of `src/extension.ts`, after the existing imports (around line 35), add:

```typescript
import { createWorkspaceHandler } from './extension/initialize-workspace';
```

- [ ] **Step 2: Add early-exit check and command registration**

In the `activate` function, after the babelDir and databasePath are set (after line 55), and **before** the migration check, insert this code block:

```typescript
    // Register workspace creation command (always available, even if workspace not initialized)
    context.subscriptions.push(
      vscode.commands.registerCommand('babel.createWorkspace', () =>
        createWorkspaceHandler(workspacePath, databasePath, context)
      )
    );

    // Early exit if workspace not initialized
    if (!fs.existsSync(databasePath)) {
      logger.info('Babel workspace not initialized in this folder');
      return;
    }
```

This should be inserted right before line 63 (the migration check). The exact location: after setting `babelDir` and `databasePath`, before `const { MigrationInitializer } = await import(...)`.

- [ ] **Step 3: Verify the activation function structure**

Open `src/extension.ts` and verify:
- Lines 54–55 define `babelDir` and `databasePath`
- Lines 56–60 are where you added the command registration and early exit
- Lines 61+ continue with the migration check (unchanged)

The file should compile without errors:

```bash
npx tsc --noEmit src/extension.ts
```

Expected: No errors

- [ ] **Step 4: Review the modified section**

The activation function should now look like:

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Activating Babel extension...');

  try {
    // === INFRASTRUCTURE ===
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Babel requires a workspace folder to be open');
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const babelDir = path.join(workspacePath, '.babel');
    const databasePath = path.join(babelDir, 'babel.db');

    // Register workspace creation command (always available, even if workspace not initialized)
    context.subscriptions.push(
      vscode.commands.registerCommand('babel.createWorkspace', () =>
        createWorkspaceHandler(workspacePath, databasePath, context)
      )
    );

    // Early exit if workspace not initialized
    if (!fs.existsSync(databasePath)) {
      logger.info('Babel workspace not initialized in this folder');
      return;
    }

    // Check for v1 migration on startup
    const { MigrationInitializer } = await import('./extension/initialize-migration');
    // ... rest of initialization continues unchanged
```

- [ ] **Step 5: Commit**

```bash
git add src/extension.ts
git commit -m "feat: add database check and workspace command registration on activation"
```

---

## Task 4: Manual Testing

**Test the feature end-to-end in VSCode.**

- [ ] **Step 1: Build the extension**

```bash
npm run compile
```

Expected: Build succeeds, `dist/extension.js` is updated

- [ ] **Step 2: Open the extension in debug mode**

Open VSCode and press `F5` to start debugging. A new VSCode window opens with the extension loaded.

- [ ] **Step 3: Open a folder without .babel**

In the debug window, open a folder (File > Open Folder) that does **not** contain a `.babel` directory. For example, a temporary empty folder or a different project folder.

Expected behavior:
- The "Babel Stories" panel in the activity bar is visible
- The panel shows the welcome message with the "Create Babel Workspace" button
- No errors in the debug console

- [ ] **Step 4: Click "Create Babel Workspace"**

Click the button in the welcome view.

Expected behavior:
- A notification "Babel workspace created! Reloading..." appears
- The window reloads
- After reload, the extension initializes normally
- The Stories panel now shows the empty stories tree (or migration UI if applicable)
- `.babel/babel.db` file exists in the opened folder

- [ ] **Step 5: Open the folder again**

Close and reopen the same folder.

Expected behavior:
- `.babel/babel.db` is found
- Extension initializes normally
- Welcome view is NOT shown
- Stories panel displays the tree view

- [ ] **Step 6: Test deletion and recovery**

Delete the `.babel` directory from the opened folder (via file explorer or `rm -rf .babel`).

Reload the VSCode window (Ctrl+R / Cmd+R).

Expected behavior:
- Welcome view reappears
- Clicking the button again works and recreates `.babel/babel.db`

- [ ] **Step 7: Test with existing workspace**

Open a folder that already has a `.babel/babel.db` file (e.g., your actual Babel project).

Expected behavior:
- Welcome view is NOT shown
- Extension initializes normally
- Stories panel displays stories tree

- [ ] **Step 8: Verify no errors in debug console**

Check the debug console for any errors or warnings. Expected: Clean activation log with no errors.

- [ ] **Step 9: Commit (if testing reveals no issues)**

If all tests pass, create a final verification commit:

```bash
git commit --allow-empty -m "test: manual verification of welcome view feature - all scenarios pass"
```

---

## Summary

| Task | Scope | Time |
|------|-------|------|
| 1 | Create workspace handler | 2-3 min |
| 2 | Update manifest | 2 min |
| 3 | Modify activation logic | 3-4 min |
| 4 | Manual testing | 5-10 min |

**Total: ~15-20 minutes**

All tasks commit frequently to maintain a clean git history.
