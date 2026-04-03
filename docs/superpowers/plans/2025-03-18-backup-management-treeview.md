# Backup Management TreeView Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a backup management tree view to the VSCode sidebar showing backup history, provider status, and inline actions (restore/delete/toggle providers).

**Architecture:** New `BackupTreeDataProvider` following the existing `BabelStoriesTreeDataProvider` pattern. BackupManager emits events on backup lifecycle (complete/restore/delete) which trigger tree refresh. Provider toggles update VSCode settings and refresh the view. Inline action commands reuse existing `babel.restoreBackup` and new `babel.deleteBackup` commands.

**Tech Stack:** VSCode TreeDataProvider API, existing BackupManager/BackupRepository, Settings API (vscode.workspace.getConfiguration)

---

## File Structure

```
NEW FILES:
- src/views/backupTreeDataProvider.ts       (BackupTreeDataProvider class)
- src/views/backupTreeItem.ts               (ProviderGroup and Backup tree items)
- src/core/commands/toggleBackupCommand.ts  (Toggle provider commands)
- test/unit/views/backupTreeDataProvider.test.ts
- test/unit/views/backupTreeItem.test.ts
- test/unit/core/commands/toggleBackupCommand.test.ts

MODIFIED FILES:
- src/services/backupManager.ts             (Add event emitters)
- src/core/commands/commandRegistry.ts      (Register toggle/delete commands)
- src/extension.ts                          (Register tree view)
- package.json                              (Add babelBackups view)
```

---

## Task 1: Add Event Emitters to BackupManager

**Files:**
- Modify: `src/services/backupManager.ts`
- Test: `test/unit/services/backupManager.test.ts` (add to existing tests)

**Goal:** Enable BackupManager to broadcast backup lifecycle events so BackupTreeDataProvider can refresh reactively.

- [ ] **Step 1: Read BackupManager to understand current structure**

Run: `head -50 src/services/backupManager.ts`

Expected: See current class definition, constructor, and public methods.

- [ ] **Step 2: Add event emitter fields to BackupManager class**

In `src/services/backupManager.ts`, after line 14 (after `const logger = new Logger...`), add:

```typescript
/**
 * Backup lifecycle events for UI updates
 */
const onBackupCompleteEmitter = new vscode.EventEmitter<BackupPoint>();
const onRestoreCompleteEmitter = new vscode.EventEmitter<void>();
const onDeleteCompleteEmitter = new vscode.EventEmitter<void>();
```

⚠️ **Note:** These need to be imported at the top: `import * as vscode from 'vscode';`

- [ ] **Step 3: Add event properties to the class**

After the emitters, add public event properties:

```typescript
export class BackupManager {
  private config: BackupConfig;
  private backupRepository: BackupRepository;
  private localBackupService: LocalBackupService;
  private cloudBackupService?: IBackupProvider;
  private scheduledBackupId: NodeJS.Timeout | null = null;
  private lastBackupTime: Map<string, Date> = new Map();
  private onScheduledBackup?: () => Promise<void>;

  // ADD THESE:
  private onBackupCompleteEmitter = new vscode.EventEmitter<BackupPoint>();
  private onRestoreCompleteEmitter = new vscode.EventEmitter<void>();
  private onDeleteCompleteEmitter = new vscode.EventEmitter<void>();

  readonly onBackupComplete = this.onBackupCompleteEmitter.event;
  readonly onRestoreComplete = this.onRestoreCompleteEmitter.event;
  readonly onDeleteComplete = this.onDeleteCompleteEmitter.event;

  // ... rest of class
}
```

- [ ] **Step 4: Fire events in backup() method**

In the `backup()` method (around line 48), after the line `this.backupRepository.create(backup);`, add:

```typescript
this.onBackupCompleteEmitter.fire(backup);
```

- [ ] **Step 5: Fire events in restore() method**

In the `restore()` method (around line 70), after `return await this.localBackupService.restoreBackup(backupId);`, add:

```typescript
this.onRestoreCompleteEmitter.fire();
```

- [ ] **Step 6: Create a deleteBackup() method**

After the `restore()` method, add:

```typescript
/**
 * Delete a backup
 */
async deleteBackup(backupId: string): Promise<void> {
  try {
    const backup = this.backupRepository.findById(backupId);
    if (!backup) {
      throw new BackupError(`Backup not found: ${backupId}`);
    }

    await this.localBackupService.deleteBackup(backupId);
    this.backupRepository.delete(backupId);
    this.onDeleteCompleteEmitter.fire();
    logger.info('Backup deleted', { id: backupId });
  } catch (error) {
    throw new BackupError(`Failed to delete backup: ${error}`);
  }
}
```

- [ ] **Step 7: Add test for event emission**

In `test/unit/services/backupManager.test.ts`, add a new describe block:

```typescript
describe('BackupManager - Events', () => {
  it('should emit onBackupComplete when backup finishes', async () => {
    const backupListener = jest.fn();
    manager.onBackupComplete(backupListener);

    await manager.backup(mockBackupData, { type: 'full' });

    expect(backupListener).toHaveBeenCalledWith(expect.objectContaining({ id: expect.any(String) }));
  });

  it('should emit onDeleteComplete when backup is deleted', async () => {
    const deleteListener = jest.fn();
    manager.onDeleteComplete(deleteListener);

    // Create a backup first
    const backup = await manager.backup(mockBackupData, { type: 'full' });

    // Delete it
    await manager.deleteBackup(backup.id);

    expect(deleteListener).toHaveBeenCalled();
  });
});
```

- [ ] **Step 8: Run tests to verify events work**

Run: `npm test -- --testPathPattern="backupManager" 2>&1 | tail -30`

Expected: Both new tests pass. Existing tests still pass.

- [ ] **Step 9: Compile and verify no TypeScript errors**

Run: `npm run compile 2>&1`

Expected: No errors.

- [ ] **Step 10: Commit**

```bash
git add src/services/backupManager.ts test/unit/services/backupManager.test.ts
git commit -m "feat: Add lifecycle events to BackupManager

- Add onBackupComplete, onRestoreComplete, onDeleteComplete events
- Fire events when backups are created, restored, or deleted
- Enable UI to refresh reactively on backup changes
- Add deleteBackup() method to BackupManager
- Tests: Verify events emit correctly"
```

---

## Task 2: Create BackupTreeDataProvider

**Files:**
- Create: `src/views/backupTreeDataProvider.ts`
- Create: `src/views/backupTreeItem.ts`
- Create: `test/unit/views/backupTreeDataProvider.test.ts`

**Goal:** Implement TreeDataProvider that displays backups organized by provider (Local/Cloud) with proper labels, icons, and structure.

- [ ] **Step 1: Create backupTreeItem.ts**

Create `src/views/backupTreeItem.ts`:

```typescript
/**
 * Backup Tree Items
 * Custom tree items for provider groups and backup entries
 */

import * as vscode from 'vscode';

export class ProviderGroupItem extends vscode.TreeItem {
  constructor(
    public readonly providerName: string,  // "Local Backups" or "Cloud Backups"
    public readonly isEnabled: boolean,
    public readonly isCloud: boolean      // true for cloud, false for local
  ) {
    super(
      `${providerName} [${isEnabled ? '✓' : '✗'}]`,
      vscode.TreeItemCollapsibleState.Expanded
    );

    // Set icon
    this.iconPath = isCloud
      ? new vscode.ThemeIcon('cloud')
      : new vscode.ThemeIcon('folder');

    this.contextValue = 'providerGroup';
  }
}

export class BackupItem extends vscode.TreeItem {
  constructor(
    public readonly backupId: string,
    public readonly timestamp: Date,
    public readonly size: number,        // in bytes
    public readonly type: 'full' | 'incremental'
  ) {
    const dateStr = timestamp.toLocaleString();
    const sizeStr = (size / 1024 / 1024).toFixed(1);
    const label = `${dateStr} (${sizeStr} MB) [${type}]`;

    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = type;
    this.iconPath = new vscode.ThemeIcon('file');
    this.contextValue = 'backup';
  }
}
```

- [ ] **Step 2: Create backupTreeDataProvider.ts**

Create `src/views/backupTreeDataProvider.ts`:

```typescript
/**
 * Backup Tree Data Provider
 * Displays backup history organized by provider (Local/Cloud)
 */

import * as vscode from 'vscode';
import { BackupRepository } from '../db/backupRepository';
import { BackupManager } from '../services/backupManager';
import { Logger } from '../utils/logger';
import { ProviderGroupItem, BackupItem } from './backupTreeItem';

const logger = new Logger('BackupTreeDataProvider');

export class BackupTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private backupRepository: BackupRepository,
    private backupManager: BackupManager
  ) {
    // Subscribe to backup lifecycle events
    this.backupManager.onBackupComplete(() => this.refresh());
    this.backupManager.onRestoreComplete(() => this.refresh());
    this.backupManager.onDeleteComplete(() => this.refresh());
  }

  refresh(): void {
    logger.debug('Refreshing backup tree');
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      // Root: return provider groups
      if (!element) {
        const config = vscode.workspace.getConfiguration('babel.backup');
        const localEnabled = config.get<boolean>('enabled') ?? true;
        const cloudEnabled = config.get<boolean>('googleDrive.enabled') ?? false;

        return [
          new ProviderGroupItem('Local Backups', localEnabled, false),
          new ProviderGroupItem('Cloud Backups', cloudEnabled, true),
        ];
      }

      // Provider group: return backups
      if (element instanceof ProviderGroupItem) {
        const allBackups = this.backupRepository.findAll();

        // Filter by provider (for now, all backups are local)
        // TODO: When cloud backups exist, filter by provider
        const backups = element.isCloud ? [] : allBackups;

        return backups.map(
          (backup) =>
            new BackupItem(
              backup.id,
              backup.timestamp,
              backup.storageSize,
              backup.type as 'full' | 'incremental'
            )
        );
      }

      return [];
    } catch (error) {
      logger.error(`Error getting children: ${error}`);
      return [];
    }
  }

  /**
   * Toggle cloud backup provider
   */
  async toggleCloudBackup(): Promise<void> {
    const config = vscode.workspace.getConfiguration('babel.backup');
    const currentState = config.get<boolean>('googleDrive.enabled') ?? false;
    await config.update('googleDrive.enabled', !currentState, true);
    logger.info('Cloud backup toggled', { enabled: !currentState });
    this.refresh();
  }

  /**
   * Toggle local backup provider
   */
  async toggleLocalBackup(): Promise<void> {
    const config = vscode.workspace.getConfiguration('babel.backup');
    const currentState = config.get<boolean>('enabled') ?? true;
    await config.update('enabled', !currentState, true);
    logger.info('Local backup toggled', { enabled: !currentState });
    this.refresh();
  }
}
```

- [ ] **Step 3: Create unit tests for BackupTreeDataProvider**

Create `test/unit/views/backupTreeDataProvider.test.ts`:

```typescript
/**
 * BackupTreeDataProvider Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { BackupTreeDataProvider } from '../../../src/views/backupTreeDataProvider';
import { ProviderGroupItem, BackupItem } from '../../../src/views/backupTreeItem';
import { createTestDatabase } from '../../helpers/database';
import { BackupRepository } from '../../../src/db/backupRepository';
import { BackupManager } from '../../../src/services/backupManager';

describe('BackupTreeDataProvider', () => {
  let provider: BackupTreeDataProvider;
  let backupRepository: BackupRepository;
  let backupManager: any; // Mock

  beforeEach(() => {
    // Create mock database and repositories
    const db = createTestDatabase();
    backupRepository = new BackupRepository(db);

    // Create mock BackupManager with event emitters
    backupManager = {
      onBackupComplete: jest.fn((listener) => {}),
      onRestoreComplete: jest.fn((listener) => {}),
      onDeleteComplete: jest.fn((listener) => {}),
    };

    provider = new BackupTreeDataProvider(backupRepository, backupManager);
  });

  it('should return provider groups at root', async () => {
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(ProviderGroupItem);
    expect(children[1]).toBeInstanceOf(ProviderGroupItem);
    expect((children[0] as ProviderGroupItem).providerName).toBe('Local Backups');
    expect((children[1] as ProviderGroupItem).providerName).toBe('Cloud Backups');
  });

  it('should show provider enabled state in label', async () => {
    const children = (await provider.getChildren()) as ProviderGroupItem[];

    // Local should be enabled by default
    expect(children[0].label).toContain('✓');

    // Cloud should be disabled by default
    expect(children[1].label).toContain('✗');
  });

  it('should return backups under local provider group', async () => {
    // Create a mock backup in repository
    const mockBackup = {
      id: 'test-backup-1',
      timestamp: new Date(),
      storageSize: 1024 * 1024, // 1 MB
      type: 'full',
      status: 'verified',
    };
    backupRepository.create(mockBackup as any);

    const localGroup = new ProviderGroupItem('Local Backups', true, false);
    const children = await provider.getChildren(localGroup);

    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(BackupItem);
    expect((children[0] as BackupItem).backupId).toBe('test-backup-1');
  });

  it('should return empty list for cloud provider when disabled', async () => {
    const cloudGroup = new ProviderGroupItem('Cloud Backups', false, true);
    const children = await provider.getChildren(cloudGroup);

    expect(children).toHaveLength(0);
  });

  it('should refresh on backup complete event', () => {
    const refreshSpy = jest.spyOn(provider, 'refresh');

    // Simulate event subscription
    const listeners: Function[] = [];
    (backupManager.onBackupComplete as jest.Mock).mockImplementation((listener) => {
      listeners.push(listener);
    });

    // Re-create provider to trigger subscriptions
    new BackupTreeDataProvider(backupRepository, backupManager);

    // Fire the event
    listeners.forEach((listener) => listener());

    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should toggle cloud backup setting', async () => {
    await provider.toggleCloudBackup();

    const config = vscode.workspace.getConfiguration('babel.backup');
    const enabled = config.get('googleDrive.enabled');
    expect(enabled).toBe(true); // Was false, now true
  });
});
```

- [ ] **Step 4: Run tests to verify provider works**

Run: `npm test -- --testPathPattern="backupTreeDataProvider" 2>&1 | tail -30`

Expected: All tests pass.

- [ ] **Step 5: Compile**

Run: `npm run compile 2>&1`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/views/backupTreeDataProvider.ts src/views/backupTreeItem.ts test/unit/views/backupTreeDataProvider.test.ts
git commit -m "feat: Create BackupTreeDataProvider for sidebar

- BackupTreeItem: ProviderGroupItem and BackupItem tree nodes
- BackupTreeDataProvider: TreeDataProvider showing backups by provider
- Subscribe to BackupManager events for reactive refresh
- Toggle provider enabled state via VSCode settings
- Tests: Verify tree structure and provider toggles"
```

---

## Task 3: Create Toggle and Delete Commands

**Files:**
- Create: `src/core/commands/toggleBackupCommand.ts`
- Modify: `src/core/commands/commandRegistry.ts`
- Create: `test/unit/core/commands/toggleBackupCommand.test.ts`

**Goal:** Implement commands to toggle providers and delete backups, integrated with BackupTreeDataProvider refresh.

- [ ] **Step 1: Create toggleBackupCommand.ts**

Create `src/core/commands/toggleBackupCommand.ts`:

```typescript
/**
 * Toggle Backup Commands
 * Enable/disable cloud and local backup providers
 */

import * as vscode from 'vscode';
import { BackupTreeDataProvider } from '../../views/backupTreeDataProvider';
import { Logger } from '../../utils/logger';

const logger = new Logger('ToggleBackupCommand');

export class ToggleBackupCommand {
  constructor(private backupTreeProvider: BackupTreeDataProvider) {}

  registerToggleCloudBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.toggleCloudBackup', async () => {
      try {
        await this.backupTreeProvider.toggleCloudBackup();
        const config = vscode.workspace.getConfiguration('babel.backup');
        const enabled = config.get('googleDrive.enabled');
        vscode.window.showInformationMessage(
          `Cloud backup ${enabled ? 'enabled' : 'disabled'}`
        );
      } catch (error) {
        logger.error('Failed to toggle cloud backup', { error });
        vscode.window.showErrorMessage(`Failed to toggle cloud backup: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
  }

  registerToggleLocalBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.toggleLocalBackup', async () => {
      try {
        await this.backupTreeProvider.toggleLocalBackup();
        const config = vscode.workspace.getConfiguration('babel.backup');
        const enabled = config.get('enabled');
        vscode.window.showInformationMessage(
          `Local backup ${enabled ? 'enabled' : 'disabled'}`
        );
      } catch (error) {
        logger.error('Failed to toggle local backup', { error });
        vscode.window.showErrorMessage(`Failed to toggle local backup: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
  }
}

export class DeleteBackupCommand {
  constructor(private backupManager: any) {} // BackupManager type

  registerDeleteBackup(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand(
      'babel.deleteBackup',
      async (backupId: string) => {
        if (!backupId) {
          vscode.window.showErrorMessage('No backup selected');
          return;
        }

        try {
          const confirm = await vscode.window.showWarningMessage(
            'Delete this backup? This cannot be undone.',
            { modal: true },
            'Delete'
          );

          if (confirm === 'Delete') {
            await this.backupManager.deleteBackup(backupId);
            vscode.window.showInformationMessage('Backup deleted');
          }
        } catch (error) {
          logger.error('Failed to delete backup', { error });
          vscode.window.showErrorMessage(`Failed to delete backup: ${error}`);
        }
      }
    );
    context.subscriptions.push(disposable);
  }
}
```

- [ ] **Step 2: Update CommandRegistry to register toggle commands**

In `src/core/commands/commandRegistry.ts`, add imports at top:

```typescript
import { ToggleBackupCommand, DeleteBackupCommand } from './toggleBackupCommand';
import { BackupTreeDataProvider } from '../../views/backupTreeDataProvider';
```

Then in the CommandRegistry constructor, add fields:

```typescript
export class CommandRegistry {
  private database: BabelDatabase;
  // ... existing fields ...
  private toggleBackupCommand?: ToggleBackupCommand;
  private deleteBackupCommand?: DeleteBackupCommand;

  constructor(
    // ... existing params ...
    private backupTreeProvider?: BackupTreeDataProvider,
    private backupManager?: any  // BackupManager
  ) {
    // ... existing init ...
  }
```

Then in `registerAll()`, add calls to register the commands:

```typescript
registerAll(context: vscode.ExtensionContext): void {
  logger.info('Registering Babel commands');

  // ... existing command registrations ...

  // NEW: Register toggle and delete commands
  if (this.backupTreeProvider && this.backupManager) {
    this.toggleBackupCommand = new ToggleBackupCommand(this.backupTreeProvider);
    this.toggleBackupCommand.registerToggleCloudBackup(context);
    this.toggleBackupCommand.registerToggleLocalBackup(context);

    this.deleteBackupCommand = new DeleteBackupCommand(this.backupManager);
    this.deleteBackupCommand.registerDeleteBackup(context);
  }

  logger.info('All commands registered successfully');
}
```

- [ ] **Step 3: Create tests for toggle commands**

Create `test/unit/core/commands/toggleBackupCommand.test.ts`:

```typescript
/**
 * Toggle Backup Command Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { ToggleBackupCommand, DeleteBackupCommand } from '../../../src/core/commands/toggleBackupCommand';

describe('ToggleBackupCommand', () => {
  let command: ToggleBackupCommand;
  let mockTreeProvider: any;
  let context: any;

  beforeEach(() => {
    mockTreeProvider = {
      toggleCloudBackup: jest.fn(),
      toggleLocalBackup: jest.fn(),
    };

    context = {
      subscriptions: [],
    };

    command = new ToggleBackupCommand(mockTreeProvider);
  });

  it('should register toggle cloud backup command', () => {
    command.registerToggleCloudBackup(context);
    expect(context.subscriptions.length).toBe(1);
  });

  it('should register toggle local backup command', () => {
    command.registerToggleLocalBackup(context);
    expect(context.subscriptions.length).toBe(1);
  });
});

describe('DeleteBackupCommand', () => {
  let command: DeleteBackupCommand;
  let mockBackupManager: any;
  let context: any;

  beforeEach(() => {
    mockBackupManager = {
      deleteBackup: jest.fn(),
    };

    context = {
      subscriptions: [],
    };

    command = new DeleteBackupCommand(mockBackupManager);
  });

  it('should register delete backup command', () => {
    command.registerDeleteBackup(context);
    expect(context.subscriptions.length).toBe(1);
  });
});
```

- [ ] **Step 4: Run tests**

Run: `npm test -- --testPathPattern="toggleBackupCommand" 2>&1 | tail -20`

Expected: All tests pass.

- [ ] **Step 5: Compile**

Run: `npm run compile 2>&1`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/core/commands/toggleBackupCommand.ts src/core/commands/commandRegistry.ts test/unit/core/commands/toggleBackupCommand.test.ts
git commit -m "feat: Add toggle and delete backup commands

- ToggleBackupCommand: Toggle cloud and local providers
- DeleteBackupCommand: Delete backup with confirmation
- Register commands in CommandRegistry
- Tests: Verify command registration"
```

---

## Task 4: Wire TreeView into Extension and Package.json

**Files:**
- Modify: `src/extension.ts`
- Modify: `package.json`

**Goal:** Register BackupTreeDataProvider and add babelBackups view to VSCode.

- [ ] **Step 1: Add babelBackups view to package.json**

In `package.json`, find the `contributes.views` section and add the backup view:

```json
{
  "contributes": {
    "views": {
      "babel-explorer": [
        {
          "id": "babelStories",
          "name": "Stories"
        },
        {
          "id": "babelBackups",
          "name": "Backups",
          "icon": "$(package)"
        }
      ]
    }
  }
}
```

- [ ] **Step 2: Add commands to package.json**

In `package.json`, in the `contributes.commands` array, add:

```json
{
  "command": "babel.toggleCloudBackup",
  "title": "Babel: Toggle Cloud Backup"
},
{
  "command": "babel.toggleLocalBackup",
  "title": "Babel: Toggle Local Backup"
},
{
  "command": "babel.deleteBackup",
  "title": "Delete Backup"
}
```

- [ ] **Step 3: Update extension.ts to register BackupTreeDataProvider**

In `src/extension.ts`, add imports at the top:

```typescript
import { BackupTreeDataProvider } from './views/backupTreeDataProvider';
import { ToggleBackupCommand, DeleteBackupCommand } from './core/commands/toggleBackupCommand';
```

Then add a module-level variable:

```typescript
let backupTreeDataProvider: BackupTreeDataProvider | null = null;
```

Then in the `activate()` function, after the line where `backupManager` is initialized (around line 400), add:

```typescript
// Set up backup management tree view
if (database && backupManager) {
  const backupRepository = new BackupRepository(database.getDb());
  backupTreeDataProvider = new BackupTreeDataProvider(
    backupRepository,
    backupManager
  );

  const backupViewRegistration = vscode.window.registerTreeDataProvider(
    'babelBackups',
    backupTreeDataProvider
  );
  context.subscriptions.push(backupViewRegistration);

  logger.info('Backup tree view initialized');
}
```

- [ ] **Step 4: Update CommandRegistry instantiation**

In `src/extension.ts`, update the CommandRegistry instantiation (around line 140) to pass backupTreeDataProvider:

```typescript
const commandRegistry = new CommandRegistry(
  database,
  gitRepository,
  workspaceRoot,
  () => treeDataProvider?.refresh(),
  tokenManager || undefined,
  backupTreeDataProvider || undefined,  // NEW
  backupManager || undefined             // NEW
);
```

And update the CommandRegistry constructor signature in `src/core/commands/commandRegistry.ts`:

```typescript
constructor(
  database: BabelDatabase,
  gitRepository: GitRepository,
  workspaceRoot: string = '',
  treeRefreshCallback?: () => void,
  tokenManager?: TokenManager,
  backupTreeProvider?: BackupTreeDataProvider,  // NEW
  backupManager?: any                           // NEW
) {
  // ... existing code ...
  this.backupTreeProvider = backupTreeProvider;
  this.backupManager = backupManager;
}
```

- [ ] **Step 5: Update deactivate() to clean up**

In `src/extension.ts`, add cleanup in `deactivate()`:

```typescript
if (backupTreeDataProvider) {
  backupTreeDataProvider = null;
  logger.info('Backup tree view cleaned up');
}
```

- [ ] **Step 6: Compile**

Run: `npm run compile 2>&1`

Expected: No errors.

- [ ] **Step 7: Run all tests**

Run: `npm test 2>&1 | tail -20`

Expected: All tests pass (should add 14 new tests, all passing).

- [ ] **Step 8: Commit**

```bash
git add package.json src/extension.ts src/core/commands/commandRegistry.ts
git commit -m "feat: Wire backup tree view into extension

- Add babelBackups view to VSCode sidebar in babel-explorer container
- Register BackupTreeDataProvider on activation
- Pass tree provider and backup manager to CommandRegistry
- Add toggle and delete commands to package.json
- Cleanup on deactivation"
```

---

## Task 5: Manual Testing & Verification

**Files:** None (testing only)

**Goal:** Verify the backup tree view works correctly in VSCode.

- [ ] **Step 1: Compile and verify no errors**

Run: `npm run compile && npm test 2>&1 | tail -10`

Expected: Compilation success. All tests pass.

- [ ] **Step 2: Start VSCode extension in debug mode** (Manual)

In VSCode:
1. Press F5 to start debug extension
2. A new VSCode window opens with extension loaded
3. Click on "Backups" in sidebar

Expected: Backups view appears with two groups:
- ✓ Local Backups (enabled by default)
- ✗ Cloud Backups (disabled by default)

- [ ] **Step 3: Trigger a backup and verify refresh** (Manual)

1. Open Command Palette (Ctrl+Shift+P)
2. Run "Babel: Backup Now"
3. Watch the backup tree

Expected: After backup completes, tree updates and shows the new backup under Local Backups with date, size, type.

- [ ] **Step 4: Test toggle provider** (Manual)

1. Click on "✓ Local Backups" item
2. Watch settings and tree

Expected: Toggle changes to "✗ Local Backups", local backups disabled. Click again → "✓ Local Backups", enabled again.

- [ ] **Step 5: Test restore backup** (Manual)

1. Right-click on a backup item
2. Select "Restore Backup" (or similar context menu option)

Expected: Shows confirmation dialog. Backup restores. Tree refreshes.

- [ ] **Step 6: Test delete backup** (Manual)

1. Right-click on a backup item
2. Select "Delete Backup"
3. Confirm deletion

Expected: Shows warning dialog. Backup deleted. Tree updates (backup no longer in list).

- [ ] **Step 7: Close debug window and exit VSCode**

Expected: No errors in console.

---

## Final Commit

After all tasks complete:

```bash
git log --oneline -10  # Verify all 4 commits are there
npm test && npm run compile  # Final verification
```

Expected: All 10 commits visible, all tests pass, zero TypeScript errors.

---

## Success Criteria

- ✅ Backup tree view visible in sidebar alongside Stories
- ✅ Two provider groups (Local/Cloud) with correct enabled state
- ✅ Backup items show date, size, type
- ✅ Toggle providers updates settings and refreshes view
- ✅ Restore and delete commands work with tree refresh
- ✅ All 744+ tests passing
- ✅ Zero TypeScript errors
- ✅ Manual testing confirms all features work
