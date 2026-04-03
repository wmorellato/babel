# Enhanced Backup Tree View with Status Indicators & Actions

**Date:** 2025-03-20
**Feature:** Status indicators and contextual action buttons in backup tree view
**Status:** Design Approved

---

## Overview

Enhance the backup tree view to display color-coded status indicators (green/red/amber) for each backup provider (Local/Cloud) with inline action buttons. Users can enable providers or authorize cloud backup directly from the tree view via inline buttons without opening settings.

### User Goals
- **Quick status visibility** - See at a glance which backup mechanisms are enabled
- **One-click enable** - Enable disabled providers without navigating to settings
- **Obvious next steps** - When cloud is enabled but not authorized, a clear "Authorize" button prompts completion
- **Reduced friction** - Minimize context switching between tree view and settings

---

## Architecture

### Components

#### 1. Enhanced ProviderGroupItem (backupTreeItem.ts)

```typescript
export class ProviderGroupItem extends vscode.TreeItem {
  constructor(
    public readonly providerName: string,        // "Local Backups" or "Cloud Backups"
    public readonly isEnabled: boolean,
    public readonly isCloud: boolean,
    public readonly isAuthorized?: boolean,      // NEW: for cloud only
    public readonly buttons?: vscode.TreeItemButton[]  // NEW: inline action buttons
  )
}
```

**Icon Logic:**
- **Green circle** (`circle-filled` with `#22cc22`): Enabled and (if cloud) authorized
- **Red circle** (`circle-filled` with `#cc2222`): Disabled
- **Amber circle** (`circle-filled` with `#ccaa22`): Enabled but not authorized (cloud only)

**Label Format:** `{providerName}`
Examples: `Local Backups`, `Cloud Backups`

#### 2. Inline Button Specifications

Buttons are rendered inline on tree items using `TreeItem.buttons` array per [VSCode Tree View documentation](https://code.visualstudio.com/api/extension-guides/tree-view#view-actions).

| Provider | `enabled` | `authorized` | Icon | Inline Buttons |
|----------|-----------|--------------|------|---|
| **Local** | `true` | N/A | 🟢 | None |
| **Local** | `false` | N/A | 🔴 | "Enable Local Backup" |
| **Cloud** | `false` | N/A | 🔴 | "Enable Cloud Backup" |
| **Cloud** | `true` | `true` | 🟢 | None |
| **Cloud** | `true` | `false` | 🟡 | "Authorize Google Drive", "Disable Cloud Backup" |

**Button Implementation:**
```typescript
const buttons: vscode.TreeItemButton[] = [];

if (!isEnabled) {
  buttons.push({
    iconPath: new vscode.ThemeIcon('unlock'),
    tooltip: `Enable ${providerName}`,
    command: {
      title: `Enable ${providerName}`,
      command: 'babel.enableBackup',
      arguments: [{ provider: isCloud ? 'cloud' : 'local' }]
    }
  });
} else if (isCloud && !isAuthorized) {
  buttons.push({
    iconPath: new vscode.ThemeIcon('link-external'),
    tooltip: 'Authorize Google Drive',
    command: {
      title: 'Authorize Google Drive',
      command: 'babel.authorizeGoogleDrive',
      arguments: []
    }
  });
  buttons.push({
    iconPath: new vscode.ThemeIcon('lock'),
    tooltip: 'Disable Cloud Backup',
    command: {
      title: 'Disable Cloud Backup',
      command: 'babel.disableBackup',
      arguments: [{ provider: 'cloud' }]
    }
  });
}

item.buttons = buttons;
```

#### 3. BackupTreeDataProvider Updates

**New Method: `getButtonsForState()`**
```typescript
private getButtonsForState(
  isCloud: boolean,
  isEnabled: boolean,
  isAuthorized: boolean = false
): vscode.TreeItemButton[]
```

Returns array of buttons based on the state matrix above.

**New Method: `getIconForState()`**
```typescript
private getIconForState(
  isEnabled: boolean,
  isAuthorized: boolean = false
): vscode.ThemeIcon
```

Returns the appropriate colored circle-filled icon:
```typescript
if (isEnabled) {
  if (!isAuthorized) {
    // Amber circle for enabled but not authorized (cloud only)
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.orange'));
  }
  // Green circle for enabled (and authorized if cloud)
  return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
} else {
  // Red circle for disabled
  return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiRed'));
}
```

**Updated getChildren():**
1. Read configuration:
   - `babel.backup.enabled` (Local)
   - `babel.backup.googleDrive.enabled` (Cloud)
   - `babel.backup.googleDrive.authorized` (Cloud only)
2. Determine authorization status (false if not set)
3. Call `getIconForState()` to get the icon
4. Call `getButtonsForState()` to create buttons array
5. Create ProviderGroupItem with icon and buttons

---

## Data Flow

### 1. Initial Tree Render

```
activate() extension
  ├─ Initialize settings (with defaults)
  ├─ Create BackupTreeDataProvider
  └─ VSCode renders tree
       └─ getChildren() at root
            ├─ Read config (enabled, authorized)
            ├─ Determine button state
            └─ Return ProviderGroupItems with inline buttons
```

### 2. User Enables Backup via Inline Button

```
User clicks "Enable Local Backup" button on Local Backups [❌]
  └─ babel.enableBackup command executes with args { provider: 'local' }
  └─ Opens VSCode settings panel focused on babel.backup.enabled
  └─ User toggles to true (or programmatically set)
  └─ Settings change event fires
  └─ onDidChangeConfiguration listener triggers
  └─ BackupTreeDataProvider.refresh()
  └─ Tree re-renders with Local Backups [✅] and no buttons
```

### 3. User Authorizes Cloud via Inline Button

```
User clicks "Authorize Google Drive" button on Cloud Backups [⚠️]
  └─ babel.authorizeGoogleDrive command executes
  └─ Browser opens → User grants permission
  └─ AuthorizeGoogleDriveCommand sets babel.backup.googleDrive.authorized = true
  └─ Settings change event fires
  └─ BackupTreeDataProvider.refresh()
  └─ Tree re-renders with Cloud Backups [✅] and no buttons
```

### 4. User Disables Backup via Inline Button

```
User clicks "Disable Cloud Backup" button on Cloud Backups [⚠️]
  └─ babel.disableBackup command executes with args { provider: 'cloud' }
  └─ Updates babel.backup.googleDrive.enabled to false
  └─ Settings change event fires
  └─ BackupTreeDataProvider.refresh()
  └─ Tree re-renders with Cloud Backups [❌] and "Enable Cloud Backup" button
```

---

## Settings Schema Changes

### New Setting: googleDrive.authorized

**File:** `package.json`

```json
{
  "babel.backup.googleDrive.authorized": {
    "type": "boolean",
    "default": false,
    "description": "OAuth2 authorization status for Google Drive cloud backup (set automatically after successful authorization)"
  }
}
```

**Lifecycle:**
- Set to `false` on extension install
- Set to `true` by `AuthorizeGoogleDriveCommand` after successful token exchange
- Can be manually reset to `false` if user revokes credentials via settings

---

## Commands

### New Commands

**babel.enableBackup**
```typescript
vscode.commands.registerCommand('babel.enableBackup', async (args: { provider: 'local' | 'cloud' }) => {
  const config = vscode.workspace.getConfiguration('babel.backup');
  if (args.provider === 'cloud') {
    await config.update('googleDrive.enabled', true, vscode.ConfigurationTarget.Workspace);
  } else {
    await config.update('enabled', true, vscode.ConfigurationTarget.Workspace);
  }
  // Settings change event will trigger tree refresh
})
```

**babel.disableBackup**
```typescript
vscode.commands.registerCommand('babel.disableBackup', async (args: { provider: 'local' | 'cloud' }) => {
  const config = vscode.workspace.getConfiguration('babel.backup');
  if (args.provider === 'cloud') {
    await config.update('googleDrive.enabled', false, vscode.ConfigurationTarget.Workspace);
  } else {
    await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
  }
  // Settings change event will trigger tree refresh
})
```

**In package.json contributes.commands:**
```json
[
  {
    "command": "babel.enableBackup",
    "title": "Enable Backup"
  },
  {
    "command": "babel.disableBackup",
    "title": "Disable Backup"
  }
]
```

### Existing Commands (Modified)

**babel.authorizeGoogleDrive**
- Existing command, updated to set `babel.backup.googleDrive.authorized: true` after successful token exchange

---

## Event Subscriptions

BackupTreeDataProvider subscribes to settings changes:

```typescript
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('babel.backup')) {
    this.refresh();
  }
})
```

This ensures the tree updates when:
- User enables/disables local backup
- User enables/disables cloud backup
- User manually sets `authorized` flag via settings

---

## Files to Create/Modify

| File | Operation | Changes |
|------|-----------|---------|
| `src/views/backupTreeItem.ts` | Modify | Add `isAuthorized` and `buttons` properties to ProviderGroupItem |
| `src/views/backupTreeDataProvider.ts` | Modify | Add `getButtonsForState()` method, update `getChildren()` to create buttons, subscribe to settings changes |
| `src/core/commands/backupToggleCommands.ts` | Create | New commands: `babel.enableBackup`, `babel.disableBackup` |
| `src/core/commands/authorizeGoogleDriveCommand.ts` | Modify | Set `babel.backup.googleDrive.authorized = true` after successful auth |
| `package.json` | Modify | Add `babel.backup.googleDrive.authorized` setting; add enable/disable commands |
| `test/unit/views/backupTreeDataProvider.buttons.test.ts` | Create | Unit tests for button state logic (5 scenarios) |
| `test/unit/core/commands/backupToggleCommands.test.ts` | Create | Unit tests for enable/disable commands |

---

## Testing Strategy

### Unit Tests (backupTreeDataProvider.buttons.test.ts)

**Test Cases:**

1. `should return no buttons when local backup enabled`
   - Config: `enabled: true`
   - Expected: buttons array is empty, pass icon

2. `should return Enable button when local backup disabled`
   - Config: `enabled: false`
   - Expected: buttons array has 1 item with unlock icon, error icon

3. `should return Enable button when cloud backup disabled`
   - Config: `googleDrive.enabled: false`
   - Expected: buttons array has 1 item with unlock icon, error icon

4. `should return Authorize button when cloud enabled but not authorized`
   - Config: `googleDrive.enabled: true`, `googleDrive.authorized: false`
   - Expected: buttons array has 2 items (link-external, lock), warning icon

5. `should return no buttons when cloud enabled and authorized`
   - Config: `googleDrive.enabled: true`, `googleDrive.authorized: true`
   - Expected: buttons array is empty, pass icon

### Unit Tests (backupToggleCommands.test.ts)

- `babel.enableBackup` updates correct setting based on provider arg
- `babel.disableBackup` updates correct setting based on provider arg
- Commands error gracefully if settings update fails
- Button commands execute with correct arguments

### Integration Tests

- Verify enable/disable button clicks trigger settings changes
- Verify settings changes trigger tree refresh with updated buttons
- Verify authorization button opens browser and sets `authorized` flag
- Verify icons update correctly after state changes

### Manual Testing Checklist

- [ ] Local Backups shows green icon with no buttons when enabled
- [ ] Local Backups shows red icon with "Enable" button when disabled
- [ ] Cloud Backups shows red icon with "Enable" button when disabled
- [ ] Cloud Backups shows amber icon with "Authorize" and "Disable" buttons when enabled but not authorized
- [ ] Cloud Backups shows green icon with no buttons when both enabled and authorized
- [ ] Clicking "Enable" button updates settings and refreshes tree
- [ ] Clicking "Disable" button updates settings and refreshes tree
- [ ] Clicking "Authorize" button opens browser and sets authorized flag on success
- [ ] Settings changes via VSCode UI are reflected in tree immediately
- [ ] Buttons appear/disappear correctly as state changes

---

## Success Criteria

- ✅ Status icons use correct ThemeIcons (pass/error/warning) per state matrix
- ✅ Inline action buttons appear on tree items based on provider state
- ✅ Enable buttons open settings or toggle settings directly
- ✅ Authorize button triggers OAuth2 flow and updates `authorized` flag
- ✅ Disable buttons toggle provider to disabled state
- ✅ Tree refreshes immediately when settings change
- ✅ All 5 state scenarios tested with unit tests
- ✅ No TypeScript errors
- ✅ Manual testing verifies all button states and state transitions

---

## Future Enhancements

1. **Backup status** - Show "uploading", "synced", "failed" status for cloud backups
2. **Last backup indicator** - Show timestamp of last successful backup in provider label
3. **One-click backup** - Add "Backup Now" button to provider groups
4. **Authorization expiry** - Detect when Google Drive token expires and show refresh button
5. **Quick enable toggle** - Single button to toggle enable/disable without opening settings
