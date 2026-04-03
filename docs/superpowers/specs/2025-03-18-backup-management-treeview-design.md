# Backup Management TreeView Design

**Date:** 2025-03-18
**Feature:** Backup Management View in VSCode Sidebar
**Status:** Design Approved

---

## Overview

Add a new TreeDataProvider view (`babelBackups`) to the VSCode sidebar alongside the Stories view. The view displays backup information organized by provider (Local/Cloud) and enables users to:
- View backup history (date, size, type)
- Enable/disable cloud and local backup providers
- Restore and delete backups via inline action icons
- Trigger manual backups

The view refreshes reactively when backups complete, are deleted, or restored.

---

## Architecture

### Components

#### 1. BackupTreeDataProvider (`src/views/backupTreeDataProvider.ts`)

**Purpose:** Implements VSCode's TreeDataProvider interface to populate the backup tree view.

**Constructor:**
```typescript
constructor(
  private backupRepository: BackupRepository,
  private backupManager: BackupManager,
  private onBackupEvent: vscode.Event<void>,      // from BackupManager
  private onRestoreEvent: vscode.Event<void>,     // from BackupManager
  private onDeleteEvent: vscode.Event<void>       // from BackupManager
)
```

**Key Methods:**
- `getChildren(element?)` — Returns provider groups at root; backups under each group
- `getTreeItem(element)` — Converts data to TreeItem with icons, labels, commands
- `refresh()` — Called on events; notifies VSCode to re-render tree
- `toggleCloudBackup()` — Updates settings and refreshes
- `toggleLocalBackup()` — Updates settings and refreshes

**Refresh Triggers:**
1. Backup completion (from BackupManager event)
2. Restore completion (from BackupManager event)
3. Backup deletion (from BackupManager event)
4. Provider toggle (user clicks checkbox)

#### 2. BackupTreeItem (TreeItem wrapper)

**Root level:** Two provider group items (Local Backups, Cloud Backups)
```typescript
{
  label: "Local Backups [✓]",        // ✓ = enabled, ✗ = disabled
  collapsibleState: Expanded,
  iconPath: folder icon,
  command: { command: 'babel.toggleLocalBackup', ... }
}
```

**Child level:** Individual backup items
```typescript
{
  label: "2025-03-18 02:00 (1.2 MB) [full]",
  collapsibleState: None,
  iconPath: document icon,
  description: "full backup",
  buttons: [
    { iconPath: refresh, tooltip: "Restore", command: 'babel.restoreBackup' },
    { iconPath: trash, tooltip: "Delete", command: 'babel.deleteBackup' }
  ]
}
```

---

## Data Flow

### 1. Initialization (Extension Activation)

```
extension.ts activate()
  ├─ Create BackupManager
  ├─ Create BackupRepository
  ├─ Create BackupTreeDataProvider (pass repository + events)
  └─ Register tree view with VSCode
```

### 2. On Backup Completion

```
BackupManager.backup()
  └─ Emit 'onBackupComplete' event
       └─ BackupTreeDataProvider.refresh()
            └─ VSCode re-renders tree
                 └─ User sees new backup in list
```

### 3. On Provider Toggle

```
User clicks "Local Backups [☐]"
  └─ toggleLocalBackup() command fires
       ├─ Update vscode.workspace.getConfiguration('babel.backup').enable (local flag)
       └─ Call refresh()
            └─ Tree re-renders with new toggle state
```

### 4. On Restore/Delete Action

```
User clicks [↻ restore] or [🗑 delete] icon
  └─ Existing babel.restoreBackup or babel.deleteBackup command runs
       ├─ BackupManager.restore() or BackupManager.delete()
       └─ Emit event
            └─ BackupTreeDataProvider.refresh()
                 └─ Tree updates
```

---

## UI Structure

### Tree Hierarchy

```
Backups (implicit root, shown as "Backups" in sidebar)
├── 📁 Local Backups [✓ enabled]
│   ├── 2025-03-18 02:00 (1.2 MB) [full]     [↻] [🗑]
│   ├── 2025-03-17 02:00 (1.1 MB) [full]     [↻] [🗑]
│   └── 2025-03-16 02:00 (1.0 MB) [incr]     [↻] [🗑]
│
└── ☁️ Cloud Backups [✗ disabled]
    └── (empty when disabled or no backups)
```

### Labels & Icons

**Provider Groups:**
- Icon: folder (local) / cloud (cloud)
- Label: "Local Backups [✓]" or "Cloud Backups [✗]"
- Collapsible: Yes (user can collapse when not needed)
- Toggle behavior: Click to enable/disable

**Backup Items:**
- Icon: document
- Label: `"{date} {time} ({size} MB) [{type}]"`
  - Example: "2025-03-18 02:00 (1.2 MB) [full]"
- Description: "full" or "incremental"
- Inline actions:
  - [↻] Restore button
  - [🗑] Delete button

---

## Settings & Configuration

### Backup Settings Schema (existing)

The feature relies on existing settings:
```json
{
  "babel.backup.enabled": true,
  "babel.backup.googleDrive.enabled": false
}
```

**New behavior:** BackupTreeDataProvider can **toggle** these settings:
- User clicks provider group checkbox → setting updates
- Settings change → tree refreshes to show new state
- Read settings on startup to determine initial toggle state

### Local Backup Enable Flag

**Note:** Currently, local backups are always enabled (no disable option). For consistency with cloud, consider:
- **Option A:** Add `babel.backup.localPath` setting as "disabled" marker (empty string = disabled)
- **Option B:** Add explicit `babel.backup.local.enabled` setting
- **Option C:** Always show "Local Backups" as enabled (no toggle)

**Recommendation:** Option C for MVP (no local disable toggle). If user wants to disable local backups, they disable all backups with `babel.backup.enabled: false`.

---

## Commands & Actions

### New Commands

**Toggle Commands** (new):
- `babel.toggleCloudBackup` — Enable/disable cloud provider
  - Updates: `babel.backup.googleDrive.enabled`
  - Triggers: tree refresh

- `babel.toggleLocalBackup` — Enable/disable local provider (optional in MVP)
  - Updates: `babel.backup.enabled` or new `babel.backup.local.enabled`
  - Triggers: tree refresh

**Existing Commands (reused):**
- `babel.restoreBackup` — Already exists; triggered by [↻] icon
- `babel.deleteBackup` — Needs to be created (currently only `babel.backupNow` exists)
- `babel.backupNow` — Existing; can add to context menu

### Command Registration

All commands registered in `CommandRegistry.registerAll()`:
```typescript
private registerToggleCloudBackup(context: vscode.ExtensionContext): void {
  const disposable = vscode.commands.registerCommand(
    'babel.toggleCloudBackup',
    async () => {
      const config = vscode.workspace.getConfiguration('babel.backup');
      const currentState = config.get('googleDrive.enabled');
      await config.update('googleDrive.enabled', !currentState, true); // global scope
      backupTreeDataProvider.refresh();
    }
  );
  context.subscriptions.push(disposable);
}
```

---

## Events & Refresh Mechanism

### BackupManager Event Emissions

BackupManager needs to emit events on backup lifecycle events:

```typescript
export class BackupManager {
  private onBackupCompleteEmitter = new vscode.EventEmitter<BackupPoint>();
  private onRestoreCompleteEmitter = new vscode.EventEmitter<void>();
  private onDeleteCompleteEmitter = new vscode.EventEmitter<void>();

  public readonly onBackupComplete = this.onBackupCompleteEmitter.event;
  public readonly onRestoreComplete = this.onRestoreCompleteEmitter.event;
  public readonly onDeleteComplete = this.onDeleteCompleteEmitter.event;

  async backup(...): Promise<BackupPoint> {
    const backup = await this.localBackupService.createBackup(...);
    this.onBackupCompleteEmitter.fire(backup);  // ← Notify listeners
    return backup;
  }

  async restore(...): Promise<BackupData> {
    const data = await this.localBackupService.restoreBackup(...);
    this.onRestoreCompleteEmitter.fire();  // ← Notify listeners
    return data;
  }
}
```

### TreeDataProvider Refresh

```typescript
export class BackupTreeDataProvider implements vscode.TreeDataProvider<TreeItem> {
  private onDidChangeTreeDataEmitter = new vscode.EventEmitter<void>();
  public readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(..., private onBackupComplete: vscode.Event<void>) {
    // Subscribe to BackupManager events
    this.onBackupComplete(() => this.refresh());
    this.onRestoreComplete(() => this.refresh());
    this.onDeleteComplete(() => this.refresh());
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire();  // ← VSCode re-renders
  }
}
```

---

## Integration Points

### 1. package.json

**Add to views:**
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

### 2. extension.ts

**In activate():**
```typescript
const backupTreeDataProvider = new BackupTreeDataProvider(
  backupRepository,
  backupManager,
  backupManager.onBackupComplete,
  backupManager.onRestoreComplete,
  backupManager.onDeleteComplete
);

const backupViewRegistration = vscode.window.registerTreeDataProvider(
  'babelBackups',
  backupTreeDataProvider
);
context.subscriptions.push(backupViewRegistration);
```

### 3. CommandRegistry.ts

**Add methods:**
- `registerToggleCloudBackup()`
- `registerToggleLocalBackup()` (optional)
- `registerDeleteBackup()` (new)

**Call in registerAll():**
```typescript
this.registerToggleCloudBackup(context);
this.registerDeleteBackup(context);
```

### 4. BackupManager.ts

**Add event emitters and fire events** (see Events section above)

---

## Error Handling

### Scenarios

1. **Restore fails**
   - Show error dialog to user
   - Tree refreshes anyway (no change in data, but ensures consistency)
   - Log error

2. **Delete fails**
   - Show error dialog
   - Tree stays unchanged (backup still there)
   - Log error

3. **Toggle fails (settings update)**
   - Show warning message
   - Tree reverts to previous state
   - Log error

---

## Testing Strategy

### Unit Tests

**BackupTreeDataProvider:**
- `getChildren()` returns correct structure (groups + backups)
- `getTreeItem()` formats labels correctly
- `refresh()` fires event
- Event listeners trigger refresh on backup/restore/delete

**Commands:**
- `toggleCloudBackup` updates settings and calls refresh
- `deleteBackup` calls BackupManager and handles errors

### Integration Tests

- Create backup → tree updates with new item
- Delete backup → tree updates (item removed)
- Toggle provider → tree shows new toggle state
- Restore backup → no tree change (data same)

### Manual Testing

- [ ] Backup completes → backup appears in tree immediately
- [ ] Delete backup → removed from tree
- [ ] Toggle cloud backup off → "Cloud Backups" shows [✗]
- [ ] Collapse/expand groups works
- [ ] Click restore/delete icons → expected commands run

---

## Future Enhancements

1. **Local backup disable toggle** — Add `babel.backup.local.enabled` setting
2. **Backup details panel** — Show backup contents (stories, size breakdown) on click
3. **Search/filter** — Find backups by date, size, type
4. **Auto-cleanup indicator** — Show "old backups will be deleted" if retention policy applies
5. **Sync status** — For cloud backups, show "uploading", "synced", "failed"

---

## Files to Create/Modify

| File | Operation | Description |
|------|-----------|-------------|
| `src/views/backupTreeDataProvider.ts` | Create | Main TreeDataProvider implementation |
| `src/services/backupManager.ts` | Modify | Add event emitters (onBackupComplete, etc.) |
| `src/core/commands/commandRegistry.ts` | Modify | Add toggle and delete command registrations |
| `src/extension.ts` | Modify | Register BackupTreeDataProvider |
| `package.json` | Modify | Add babelBackups view to contributes |
| `test/unit/views/backupTreeDataProvider.test.ts` | Create | Unit tests |
| `test/unit/core/commands/toggleBackupCommand.test.ts` | Create | Command tests |

---

## Success Criteria

- ✅ Backup tree view displays in sidebar alongside Stories
- ✅ Provider groups (Local/Cloud) show with toggle state
- ✅ Backup items display date, size, type
- ✅ Inline [↻] and [🗑] icons functional
- ✅ Tree refreshes on backup/restore/delete
- ✅ Provider toggles update settings
- ✅ All tests passing (80%+ coverage)
- ✅ Zero TypeScript errors
