# Extension Activation Refactoring Design

**Date:** 2026-03-24
**Feature:** Restructure extension activate() from monolithic 610-line function into modular, extensible initialization system

## Problem Statement

The current `activate()` function in `src/extension.ts` (lines 64-674, ~610 lines):
- Handles 12+ independent feature areas (colors, auto-commit, word count, backups, credentials, etc.)
- Makes it **hard to understand** what each section does and how features interact
- Makes it **difficult to add new features** without increasing chaos and duplication
- Contains **code duplication** across similar patterns (listener registration, bootstrapping loops, error handling)
- Has **implicit dependencies** — features redundantly create StoryRepository, register similar listeners, and check guards independently

## Intended Outcome

- **activate() becomes a clear, readable orchestration** (~50-100 lines) that shows feature initialization sequence
- **Each feature is isolated** in its own focused initialization function/module
- **New features are easy to add** — create one function, register handlers with coordinator
- **Listeners are deduplicated** — one `onDidChangeActiveTextEditor`, one `onDidSaveTextDocument`, etc., with all handlers called in sequence
- **Dependencies are explicit** — features receive shared dependencies, reducing redundant creation and checks
- **All tests still pass** — refactoring is internal; behavior unchanged

## Architecture

### Three-Layer Structure

```
activate()
├─ Layer 1: Infrastructure initialization
│  ├ Database
│  ├ Workspace & Git
│  ├ Repositories
│  └ Credentials
├─ Layer 2: Feature initialization (in sequence)
│  ├ initializeColorAnnotations()
│  ├ initializeAutoCommit()
│  ├ initializeWordCountTracking()
│  ├ initializeBackupManagement()
│  ├ initializeCommandRegistry()
│  ├ initializeHoverProviders()
│  ├ initializeTreeProviders()
│  └ initializeStatusBars()
└─ Layer 3: Listener coordination
   └ Register centralized listeners with context
```

### Core Components

#### 1. ListenerCoordinator

**File:** `src/extension/listenerCoordinator.ts`

A centralized hub that collects handler functions from all features and registers VSCode listeners once.

```typescript
export class ListenerCoordinator {
  private editorChangeHandlers: Array<(editor: vscode.TextEditor | undefined) => Promise<void>> = [];
  private documentSaveHandlers: Array<(document: vscode.TextDocument) => Promise<void>> = [];
  private documentChangeHandlers: Array<(event: vscode.TextDocumentChangeEvent) => void> = [];

  registerEditorChangeHandler(handler: (editor: vscode.TextEditor | undefined) => Promise<void>): void;
  registerDocumentSaveHandler(handler: (document: vscode.TextDocument) => Promise<void>): void;
  registerDocumentChangeHandler(handler: (event: vscode.TextDocumentChangeEvent) => void): void;

  createListeners(): vscode.Disposable[];
}
```

**Behavior:**
- Features call `coordinator.registerXyzHandler()` during initialization
- When VSCode fires a listener event, coordinator calls all registered handlers in sequence
- Errors in one handler don't prevent others from running (logged but not thrown)
- Returns array of Disposables to register in context.subscriptions

**Benefits:**
- Listeners are only registered once (even if 5 features listen to same event)
- All handlers for an event are executed together
- Handlers don't need to check guards repeatedly (done once per coordinator call)
- Easy to audit which features listen to which events

#### 2. ExtensionDependencies Interface

**File:** `src/extension/types.ts`

Explicit declaration of shared dependencies passed to all initialization functions.

```typescript
export interface ExtensionDependencies {
  // VSCode context
  context: vscode.ExtensionContext;

  // Infrastructure
  database: BabelDatabase;
  workspacePath: string;
  gitRepository: GitRepository;

  // Repositories (created once, reused by all features)
  storyRepository: StoryRepository;
  wordCountRepository: WordCountRepository;
  backupRepository: BackupRepository;
  colorAnnotationRepository: ColorAnnotationRepository;

  // Services
  credentialStorage: VSCodeSecretStorage;
  tokenManager: TokenManager;

  // Shared collectors/managers that features depend on
  backupDataCollector: BackupDataCollector;

  // UI providers created during feature initialization
  treeDataProvider?: BabelStoriesTreeDataProvider;

  // Coordination
  coordinator: ListenerCoordinator;
  logger: Logger;
}
```

**Benefits:**
- Features declare exactly what they need
- No redundant repository creation
- Easy to add/remove dependencies globally
- Type-safe dependency passing
- Cross-feature dependencies (e.g., word count needs backupDataCollector) are explicit

#### 3. Feature Initialization Functions

**Pattern:** Each feature gets its own module in `src/extension/` directory and returns a `Disposable` for cleanup.

```typescript
// src/extension/initialize-color-annotations.ts
export async function initializeColorAnnotations(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { context, workspacePath, colorAnnotationRepository, coordinator, logger } = deps;

  const disposables: vscode.Disposable[] = [];

  // Register editor change handler (called when user switches files)
  coordinator.registerEditorChangeHandler(async (editor) => {
    // ... existing updateColorDecorations logic
  });

  // Register save handler (called on file save)
  coordinator.registerDocumentSaveHandler(async (doc) => {
    // ... existing color persistence logic
  });

  // Register document change handler (called on text edits)
  coordinator.registerDocumentChangeHandler((event) => {
    // ... existing position tracking logic
  });

  // Register color commands (before lazy colorDecorationManager initialization)
  disposables.push(
    vscode.commands.registerCommand('babel.applyColor.red', (editor, selection, color) => {
      // Color decoration manager may not be initialized yet — create or get it
      // ... command handler
    })
    // ... register all color commands
  );

  logger.info('Color annotations initialized');

  // Return combined disposable for deactivation
  return vscode.Disposable.from(...disposables);
}
```

**Pattern for each feature:**
1. Extract existing inline code into function
2. Create disposables array to collect all listeners and subscriptions
3. Register listener handlers with coordinator
4. Register VSCode commands/providers/hover handlers
5. Perform any bootstrapping (initialize all stories, etc.)
6. Return combined Disposable for deactivation
7. Log completion

#### 4. Refactored activate()

**File:** `src/extension.ts` (replace current lines 64-674)

```typescript
export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Activating Babel extension...');

  try {
    // === INFRASTRUCTURE ===
    const databasePath = path.join(context.globalStoragePath, 'babel.db');
    const database = new BabelDatabase({ path: databasePath });
    await database.initialize();

    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
      logger.warn('No workspace folder found - extension features disabled');
      return;
    }

    // Initialize services (created once, shared by all features)
    const gitRepository = new GitRepository(workspacePath);
    const storyRepository = new StoryRepository(database.getDb());
    const wordCountRepository = new WordCountRepository(database.getDb());
    const backupRepository = new BackupRepository(database.getDb());
    const colorAnnotationRepository = new ColorAnnotationRepository(database.getDb());

    const credentialStorage = new VSCodeSecretStorage(context.secrets);
    const tokenManager = new TokenManager(credentialStorage);

    // Initialize settings and migrations
    await BabelSettings.initializeDefaults();
    const legacyTokenPath = path.join(context.globalStoragePath, 'dropbox-token.json');
    const migration = new CredentialMigration(credentialStorage);
    if (await migration.detectLegacyTokens(legacyTokenPath)) {
      try {
        await migration.migrateTokensToSecureStorage(legacyTokenPath, 'dropbox');
        await vscode.window.showInformationMessage('Dropbox credentials migrated to secure storage.');
      } catch (error) {
        logger.warn(`Failed to migrate legacy tokens: ${error}`);
      }
    }

    // Create backup data collector used by both word count and backup features
    const backupDataCollector = new BackupDataCollector(database, storyRepository, workspacePath, databasePath);

    // === LISTENER COORDINATION ===
    const coordinator = new ListenerCoordinator();

    // === BUILD DEPENDENCIES ===
    let deps: ExtensionDependencies = {
      context,
      database,
      workspacePath,
      gitRepository,
      storyRepository,
      wordCountRepository,
      backupRepository,
      colorAnnotationRepository,
      credentialStorage,
      tokenManager,
      backupDataCollector,
      coordinator,
      logger,
    };

    // === FEATURE INITIALIZATION (order matters for dependencies) ===
    // 1. Initialize UI providers first (tree, status bars) — other features depend on their refresh callbacks
    const treeProviderDisposable = await initializeTreeProviders(deps);
    deps.treeDataProvider = treeDataProvider; // Update deps with created provider
    const statusBarDisposable = await initializeStatusBars(deps);

    // 2. Initialize core features
    const colorDisposable = await initializeColorAnnotations(deps);
    const autoCommitDisposable = await initializeAutoCommit(deps);
    const wordCountDisposable = await initializeWordCountTracking(deps);

    // 3. Initialize features that depend on tree provider (must come after tree init)
    const commandDisposable = await initializeCommandRegistry(deps);
    const backupDisposable = await initializeBackupManagement(deps);

    // 4. Initialize supporting features
    const hoverDisposable = await initializeHoverProviders(deps);

    // === STORE DISPOSABLES FOR DEACTIVATION ===
    // Save all feature disposables so deactivate() can clean them up
    const featureDisposables = [
      treeProviderDisposable,
      statusBarDisposable,
      colorDisposable,
      autoCommitDisposable,
      wordCountDisposable,
      commandDisposable,
      backupDisposable,
      hoverDisposable,
    ];

    // Store disposables in global module variable for deactivate()
    featureDisposablesForCleanup = vscode.Disposable.from(...featureDisposables);

    // === REGISTER COORDINATED LISTENERS ===
    const listeners = coordinator.createListeners();
    listeners.forEach((listener) => context.subscriptions.push(listener));

    logger.info('Babel extension activated successfully');
  } catch (error) {
    logger.error('Failed to activate extension', { error });
    await vscode.window.showErrorMessage(`Failed to activate Babel: ${error}`);
  }
}
```

**Key Changes:**
- Each feature returns a `Disposable` for cleanup
- Feature disposables are stored in a module-level variable for deactivation
- Initialization order respects dependencies: tree providers → commands/backups that depend on them
- BackupDataCollector created once and passed to both word count and backup features
- Credentials migration inlined (no helper function needed)
- deps object updated with treeDataProvider after tree providers initialize

### Module-Level State

For deactivation to work, we need to store feature disposables at module level:

```typescript
// Near top of src/extension.ts, after other module-level lets
let featureDisposablesForCleanup: vscode.Disposable | null = null;
```

Then in deactivate():
```typescript
export async function deactivate(): Promise<void> {
  if (featureDisposablesForCleanup) {
    featureDisposablesForCleanup.dispose();
    featureDisposablesForCleanup = null;
  }

  // Original cleanup code for autoCommitManager (if still needed)
  if (autoCommitManager) {
    autoCommitManager.disposeAll();
    autoCommitManager = null;
  }

  logger.info('Babel extension deactivated');
}
```

This approach keeps deactivation simple while ensuring all feature resources are cleaned up properly.

### Data Flow

```
activate() called
  ↓
Initialize infrastructure (db, git, repos, credentials, backupDataCollector)
  ↓
Create ListenerCoordinator
  ↓
Create ExtensionDependencies object
  ↓
Initialize features in dependency order:
  1. Tree providers (deps first users)
  2. Core features (color, auto-commit, word count)
  3. Dependent features (commands, backups)
  4. Supporting features (hovers)
  ↓
Collect all feature Disposables
  ↓
Store feature disposables for deactivation
  ↓
Register coordinator's listeners with VSCode
  ↓
Extension ready

(On file events)
  VSCode event fired (e.g., onDidChangeActiveTextEditor)
    ↓
  Coordinator receives event
    ↓
  Call all registered handlers for that event in sequence
    ↓
  Handle errors (log, don't throw)

(On deactivate)
  deactivate() called
    ↓
  Dispose all feature disposables
    ↓
  Clean up remaining module-level state (autoCommitManager)
    ↓
  Extension stopped
```

## File Organization

### New Files
- `src/extension/listenerCoordinator.ts` — Listener deduplication and coordination
- `src/extension/types.ts` — ExtensionDependencies interface
- `src/extension/initialize-color-annotations.ts` — Color feature initialization
- `src/extension/initialize-auto-commit.ts` — Auto-commit feature initialization
- `src/extension/initialize-word-count.ts` — Word count tracking initialization
- `src/extension/initialize-backups.ts` — Backup management initialization
- `src/extension/initialize-commands.ts` — Command registry initialization
- `src/extension/initialize-hover-providers.ts` — Hover providers initialization
- `src/extension/initialize-tree-providers.ts` — Tree view providers initialization
- `src/extension/initialize-status-bars.ts` — Status bar widgets initialization

### Modified Files
- `src/extension.ts` — Replace monolithic activate() with modular version; keep deactivate() mostly unchanged

## Error Handling

**Strategy:** Fail gracefully at feature level, not at extension level.

- Each feature's initialization is wrapped in try/catch
- Errors are logged but don't prevent other features from initializing
- If a feature fails, users lose that feature's functionality but extension still activates
- Critical failures (database, workspace) cause early return; non-critical features continue

Example:
```typescript
try {
  await initializeColorAnnotations(deps);
} catch (error) {
  logger.error('Failed to initialize color annotations', { error });
  // Continue with next feature
}
```

## Testing Strategy

### Unit Tests
- ListenerCoordinator: verify handlers are called in sequence, errors don't prevent others
- Each initialize function: mock dependencies, verify correct handlers registered and bootstrapping completes

### Integration Tests
- Full activation sequence: verify all features initialize without errors
- Listener coordination: verify VSCode events trigger all handlers

### Regression Testing
- Run existing test suite — no tests should change, only implementation
- Manual: activate extension, perform user actions (edit, save, switch files), verify no new bugs

## Benefits

### Understanding
- **activate() is now a clear checklist** — scan it to understand what features exist
- **Each feature is isolated** — grep for `initialize-color-annotations.ts` to find all color initialization code
- **Dependencies are explicit** — see exactly what each feature needs

### Extensibility
- **Adding a feature** = create one `initialize-xyz.ts` file + register handlers
- **Removing a feature** = delete file + remove line from activate()
- **Reordering initialization** = rearrange calls in activate()
- **No more tangled code** — new features don't leak into existing functions

### Maintainability
- **DRY** — listeners registered once, guards checked once per event
- **Cohesion** — related code lives together (e.g., all color code in one file)
- **Error handling** — one pattern repeated across all features
- **Testability** — each feature can be tested independently

## Important Design Decisions

1. **Explicit initialization order** — Feature B depending on Feature A's output is handled by explicit ordering in activate(), not async dependency resolution. This keeps initialization simple and predictable. Current order: tree providers → core features → dependent features → supporting features.

2. **Feature disposables stored at module level** — Each feature returns a `Disposable` that's collected and stored for deactivation. This is the simplest way to ensure all resources are cleaned up without making deactivate() complex.

3. **Handler deduplication by design** — The ListenerCoordinator receives a list of handlers. If a handler is registered twice, it will run twice. To prevent this, features must not register the same handler function twice. This is documented in feature guidelines.

4. **No feature flags (MVP)** — All features initialize by default. Per-feature enable/disable would require additional configuration and is deferred to a future release.

## Migration Steps

(Detailed in implementation plan)

1. Create ListenerCoordinator
2. Create types.ts with ExtensionDependencies
3. Extract each feature one at a time (test after each)
4. Update activate() to use extracted functions
5. Run full test suite
6. Commit

---

## Changes from Reviewer Feedback

1. **Deactivation** — Addressed by having features return `Disposable` objects collected in `featureDisposablesForCleanup` at module level. deactivate() now properly disposes all resources.

2. **BackupDataCollector** — Added to `ExtensionDependencies` to resolve cross-feature dependency between word count and backup features.

3. **Credentials migration** — Inlined in activate() rather than referencing non-existent helper function.

4. **Color commands ordering** — Spec updated to register commands during feature initialization, not lazily. Commands handle the case where colorDecorationManager doesn't exist yet.

5. **storyRepository duplication** — Now created once and passed to all features via `ExtensionDependencies`.

6. **Feature initialization order** — Reordered to respect dependencies: tree providers first (needed by commands/backups), then core features, then dependent features, finally supporting features.
