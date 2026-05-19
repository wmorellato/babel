# Welcome View for Babel Workspace Initialization

**Date:** 2026-04-10  
**Status:** Approved  
**Scope:** Add a welcome view that appears when `.babel` directory is missing, replacing automatic initialization

---

## Problem

Currently, the Babel extension automatically creates the `.babel` directory on every folder opened with VSCode, even if the user doesn't intend to use Babel in that workspace. This creates unwanted artifacts in folders where Babel is not needed.

## Solution

Display a welcome view when opening a folder without a `.babel/babel.db` file. Users must explicitly click "Create Babel Workspace" to initialize the workspace. Only then is the `.babel` directory created and the extension fully initialized.

---

## Feature Behavior

### Startup Logic

On extension activation:

```
if (.babel/babel.db exists) {
  → Initialize extension normally (load all features)
  → Display Stories and Backups views
} else {
  → Skip feature initialization
  → Display welcome view in babelStories panel
}
```

### Welcome View Display

- **Location:** `babelStories` panel in the Babel activity bar
- **Content:** Markdown welcome message with call-to-action
- **Button:** "Create Babel Workspace" command
- **Behavior:** Replaces the Stories TreeView when no workspace is initialized

### Workspace Creation Flow

1. User clicks "Create Babel Workspace" button
2. Command handler:
   - Creates `.babel` directory
   - Initializes empty `babel.db` with schema
   - Shows success message
   - Reloads VSCode window
3. On reload, extension detects `.babel/babel.db` and initializes normally

### State Transitions

| Condition | View Displayed | Features Loaded |
|-----------|----------------|-----------------|
| No `.babel/babel.db` | Welcome view | None |
| `.babel/babel.db` exists | Stories + Backups | All |
| User deletes `.babel` | Welcome view (on reload) | None |
| User creates multiple times | Allowed (idempotent) | Works normally |

---

## Implementation Details

### 1. Package.json Contributions

Add `viewsWelcome` contribution point:

```json
{
  "contributes": {
    "viewsWelcome": [
      {
        "view": "babelStories",
        "contents": "No Babel workspace found in this folder.\n\nClick the button below to create a Babel workspace and start managing your stories.\n\n[Create Babel Workspace](command:babel.createWorkspace)"
      }
    ]
  }
}
```

Also register the new command:

```json
{
  "command": "babel.createWorkspace",
  "title": "Babel: Create Workspace",
  "category": "Babel"
}
```

### 2. Extension Activation Flow

Refactor `src/extension.ts`:

1. Check if `.babel/babel.db` exists immediately after getting workspace path
2. If missing, log that workspace is not initialized and return early (don't initialize features)
3. If present, proceed with normal initialization
4. Register `createWorkspace` command in either case (so it's available when welcome view is shown)

Pseudocode:

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const workspacePath = getWorkspacePath();
  const babelDir = path.join(workspacePath, '.babel');
  const databasePath = path.join(babelDir, 'babel.db');

  // Register workspace creation command (always available)
  context.subscriptions.push(
    vscode.commands.registerCommand('babel.createWorkspace', 
      () => createWorkspaceHandler(workspacePath, databasePath, context))
  );

  // Early exit if workspace not initialized
  if (!fs.existsSync(databasePath)) {
    logger.info('Babel workspace not initialized in this folder');
    return;
  }

  // Proceed with normal initialization...
  // [existing feature initialization code]
}
```

### 3. Create Workspace Command

New handler (`src/extension/initialize-workspace.ts`):

```typescript
export async function createWorkspaceHandler(
  workspacePath: string,
  databasePath: string,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const babelDir = path.dirname(databasePath);

    // Create directory
    if (!fs.existsSync(babelDir)) {
      fs.mkdirSync(babelDir, { recursive: true });
    }

    // Initialize database with schema
    const database = new BabelDatabase({ path: databasePath });
    await database.initialize();

    vscode.window.showInformationMessage('Babel workspace created! Reloading...');

    // Reload window to trigger full initialization
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (error) {
    logger.error('Failed to create workspace', error);
    vscode.window.showErrorMessage(
      `Failed to create Babel workspace: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
```

---

## Files Modified

- `package.json` — Add `viewsWelcome` and `babel.createWorkspace` command
- `src/extension.ts` — Add early-exit check for missing database
- `src/extension/initialize-workspace.ts` — New file with workspace creation handler

## Files Not Modified

- `src/views/storiesTreeDataProvider.ts` — Already handles empty state gracefully
- Feature initialization files — Only skipped if `.babel/babel.db` missing
- Database and repository classes — No changes needed

---

## Testing Scenarios

1. **First open, no workspace** → Welcome view appears
2. **Click button** → `.babel` created, database initialized, extension loads
3. **Open again** → Stories view loads normally
4. **Delete `.babel`** → Welcome view appears on next reload
5. **Click button multiple times** → Idempotent, works fine each time
6. **Pre-existing workspace** → Normal initialization, no welcome view

---

## Success Criteria

- [ ] Welcome view appears when `.babel/babel.db` is missing
- [ ] Extension does not initialize features without workspace
- [ ] "Create Babel Workspace" button creates `.babel` and triggers reload
- [ ] After creation, extension initializes normally
- [ ] No errors when `.babel` is recreated after deletion
- [ ] Existing workspaces unaffected (normal startup flow)
