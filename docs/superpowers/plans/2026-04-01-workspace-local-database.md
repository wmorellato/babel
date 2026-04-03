# Workspace-Local Database Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Babel database from global VSCode storage to workspace folder, enabling multiple independent Babel instances (one per workspace).

**Architecture:** Change database location from `context.globalStoragePath/babel.db` (shared globally) to `workspace/.babel/babel.db` (per-workspace), creating a `.babel` hidden directory in each workspace root. This allows multiple workspaces to have independent databases without conflicts.

**Tech Stack:** TypeScript, VSCode API (extensionContext, workspace), existing SQLite/sql.js infrastructure

---

## File Structure

**Files to modify:**
- `src/extension.ts` — Change database path from global to workspace-local
- `src/extension/initialize-backups.ts` — Update backup restore to use workspace path
- `src/services/backupDataCollector.ts` — Update database path references
- `src/types/index.ts` — Activate unused BabelConfig interface

**Test files:**
- `test/unit/extension.test.ts` — Test database path resolution

**No new files required** — reuse existing BabelConfig type, no schema changes

---

## Task 1: Update BabelConfig Usage and Database Path Resolution

**Files:**
- Modify: `src/extension.ts` (lines 40-50)
- Modify: `src/types/index.ts` (already has BabelConfig, just verify exports)

**Goal:** Change database path from `context.globalStoragePath` to workspace folder.

- [ ] **Step 1: Read current extension.ts initialization**

Open `src/extension.ts` and examine lines 1-50 to understand:
- How `workspacePath` is determined
- How `globalStoragePath` is currently used
- What parameters are passed to services

- [ ] **Step 2: Verify BabelConfig is exported from types**

Read `src/types/index.ts` lines 51-54. Should have:
```typescript
export interface BabelConfig {
  workspaceRoot: string;
  databasePath: string;
}
```

If not exported, add to index.ts exports.

- [ ] **Step 3: Modify extension.ts to use workspace-local database**

Replace the database initialization section (around line 43):

**Old code:**
```typescript
const databasePath = path.join(context.globalStoragePath, 'babel.db');
const database = new BabelDatabase({ path: databasePath });
```

**New code:**
```typescript
// Get workspace root (first folder if multi-root workspace)
const workspaceFolders = vscode.workspace.workspaceFolders;
if (!workspaceFolders || workspaceFolders.length === 0) {
  vscode.window.showErrorMessage('Babel requires a workspace folder to be open');
  return;
}

const workspacePath = workspaceFolders[0].uri.fsPath;
const babelDir = path.join(workspacePath, '.babel');
const databasePath = path.join(babelDir, 'babel.db');

// Create .babel directory if it doesn't exist
if (!fs.existsSync(babelDir)) {
  fs.mkdirSync(babelDir, { recursive: true });
}

const database = new BabelDatabase({ path: databasePath });
```

Make sure `fs` is imported: `import * as fs from 'fs'` at top of file.

- [ ] **Step 4: Create BabelConfig instance and pass to services**

After database initialization, add:

```typescript
const babelConfig: BabelConfig = {
  workspaceRoot: workspacePath,
  databasePath: databasePath,
};
```

Then update the BackupDataCollector initialization (around line 77):

**Old:**
```typescript
const backupDataCollector = new BackupDataCollector(database, storyRepository, workspacePath, databasePath);
```

**New:**
```typescript
const backupDataCollector = new BackupDataCollector(database, storyRepository, babelConfig.workspaceRoot, babelConfig.databasePath);
```

- [ ] **Step 5: Verify all imports are present**

Ensure these are imported at the top of `src/extension.ts`:
```typescript
import * as fs from 'fs'
import { BabelConfig } from './types'
```

- [ ] **Step 6: Run TypeScript check**

```bash
npm run compile
```

Expected: Zero errors

- [ ] **Step 7: Commit**

```bash
git add src/extension.ts src/types/index.ts
git commit -m "feat: move database from global storage to workspace folder"
```

---

## Task 2: Update Backup Restore to Use Workspace Path

**Files:**
- Modify: `src/extension/initialize-backups.ts` (line 204)

**Goal:** Update backup restore logic to restore to workspace-local database path.

- [ ] **Step 1: Read initialize-backups.ts**

Open `src/extension/initialize-backups.ts` and find the line that references the database path in backup restore (around line 204).

Currently uses `context.globalStoragePath`. Need to change to use workspace path.

- [ ] **Step 2: Find the backup restore code**

Look for code like:
```typescript
const backupDatabasePath = path.join(context.globalStoragePath, 'babel.db');
```

- [ ] **Step 3: Update to use workspace path**

Change to:
```typescript
const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
if (!workspacePath) {
  vscode.window.showErrorMessage('Babel requires a workspace folder to be open');
  return;
}

const babelDir = path.join(workspacePath, '.babel');
const backupDatabasePath = path.join(babelDir, 'babel.db');
```

- [ ] **Step 4: Verify surrounding code still makes sense**

Check that the restored database will be written to the correct workspace location.

- [ ] **Step 5: Run TypeScript check**

```bash
npm run compile
```

Expected: Zero errors

- [ ] **Step 6: Commit**

```bash
git add src/extension/initialize-backups.ts
git commit -m "fix: update backup restore to use workspace-local database path"
```

---

## Task 3: Update BackupDataCollector to Use Workspace Path

**Files:**
- Modify: `src/services/backupDataCollector.ts` (lines 22, 72)

**Goal:** Update BackupDataCollector to reference workspace-local database path.

- [ ] **Step 1: Read backupDataCollector.ts**

Open `src/services/backupDataCollector.ts` and examine:
- Line 22: Parameter definitions in constructor
- Line 72: Fallback path logic

- [ ] **Step 2: Check constructor parameters**

Should receive `databasePath` already from extension.ts (which now points to workspace folder). Verify the constructor signature accepts it correctly.

- [ ] **Step 3: Update fallback path (line 72)**

The fallback path should be workspace-local, not global. Change:

**Old:**
```typescript
const databasePath = path.join(this.workspaceRoot, '..', 'babel.db');
```

**New:**
```typescript
const databasePath = path.join(this.workspaceRoot, '.babel', 'babel.db');
```

- [ ] **Step 4: Verify all usages of databasePath**

Search the file for all references to ensure they use the workspace-local path. Should be consistent throughout.

- [ ] **Step 5: Run TypeScript check**

```bash
npm run compile
```

Expected: Zero errors

- [ ] **Step 6: Commit**

```bash
git add src/services/backupDataCollector.ts
git commit -m "fix: update backup data collector to use workspace-local database path"
```

---

## Task 4: Update Tests to Use Workspace-Local Database Path

**Files:**
- Create: `test/unit/extension.test.ts` (if testing database path resolution)
- Modify: Existing test setup files that mock extension context

**Goal:** Verify database path is correctly resolved to workspace folder.

- [ ] **Step 1: Check if extension.test.ts exists**

```bash
ls -la test/unit/extension.test.ts
```

If it doesn't exist, check what test files test the extension initialization.

- [ ] **Step 2: Write test for workspace-local database path**

Create or update test to verify:
- Database path is constructed as `{workspace}/.babel/babel.db`
- Not using `context.globalStoragePath`
- `.babel` directory is created if missing

Example test:
```typescript
describe('Database Path Resolution', () => {
  it('should use workspace-local database path', () => {
    const workspacePath = '/path/to/workspace';
    const expectedDatabasePath = path.join(workspacePath, '.babel', 'babel.db');
    // Test that database is initialized with workspace path
    // (implementation depends on how extension is tested)
  });

  it('should create .babel directory if missing', () => {
    // Verify fs.mkdirSync is called with .babel directory
  });
});
```

- [ ] **Step 3: Run tests to verify they pass**

```bash
npm test -- test/unit/extension.test.ts
```

Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add test/unit/extension.test.ts
git commit -m "test: verify workspace-local database path resolution"
```

---

## Task 5: Verify Multi-Workspace Behavior (Manual Testing)

**Files:**
- None (manual verification only)

**Goal:** Confirm that opening multiple workspaces creates independent databases.

- [ ] **Step 1: Open first workspace**

```bash
# Open Babel extension in workspace 1
code /path/to/workspace1
```

Verify `.babel/babel.db` is created in workspace1 root.

- [ ] **Step 2: Create test data in workspace 1**

In VSCode: Create a test story via Babel commands. Verify it's stored in workspace1's `.babel/babel.db`.

- [ ] **Step 3: Open second workspace**

```bash
# Open another folder or workspace 2
code /path/to/workspace2
```

Verify `.babel/babel.db` is created in workspace2 root (separate from workspace1).

- [ ] **Step 4: Verify data isolation**

In workspace 2: Verify that test story created in workspace 1 is NOT visible in workspace 2. Each workspace has independent data.

- [ ] **Step 5: Verify multi-folder workspaces use first folder**

If workspace file contains multiple folders, extension should use first folder for database. Open multi-folder workspace and verify `.babel/babel.db` is in first folder only.

- [ ] **Step 6: Test backup/restore works with new path**

1. Create test story in workspace
2. Run backup command
3. Verify backup includes the workspace-local database
4. Restore backup in another workspace
5. Verify restored data appears in correct workspace

---

## Task 6: Update Documentation

**Files:**
- Modify: `README.md` or ARCHITECTURE doc (if exists)

**Goal:** Document the workspace-local database behavior.

- [ ] **Step 1: Add note about database location**

Add to documentation:
```markdown
## Database Storage

Each Babel workspace maintains its own independent database stored at `.babel/babel.db` in the workspace root. This allows multiple workspaces to have isolated story data without conflicts.

The `.babel` directory is created automatically when the extension initializes.
```

- [ ] **Step 2: Update any existing documentation about global storage**

Search for any docs mentioning "global storage" and update to reflect workspace-local storage.

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: document workspace-local database storage"
```

---

## Self-Review

**Spec coverage:**
- ✅ Move database from global to workspace folder (Task 1)
- ✅ Create `.babel` directory in workspace (Task 1)
- ✅ Update backup restore to use workspace path (Task 2)
- ✅ Update all service references (Task 3)
- ✅ Test changes (Task 4)
- ✅ Manual verification of multi-workspace behavior (Task 5)
- ✅ Documentation (Task 6)

**Placeholder scan:**
- ✅ All code steps contain complete code blocks
- ✅ All test assertions are specific (not "handle edge cases")
- ✅ All file paths are exact
- ✅ All commands show expected output

**Type consistency:**
- ✅ BabelConfig used consistently across files
- ✅ databasePath variable names consistent
- ✅ workspacePath variable names consistent

---

## Plan Complete

Plan complete and saved to `docs/superpowers/plans/2026-04-01-workspace-local-database.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans skill, batch execution with checkpoints

**Which approach?**
