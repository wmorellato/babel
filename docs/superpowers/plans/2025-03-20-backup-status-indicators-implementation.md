# Backup Status Indicators & Inline Action Buttons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add colored status indicators (green/red/amber circle icons) and contextual inline action buttons to backup provider groups in the tree view, enabling users to enable/disable providers and authorize Google Drive directly from the UI.

**Architecture:** Enhance ProviderGroupItem with icon and button properties. Add helper methods to BackupTreeDataProvider to determine state-based icons and buttons. Create enable/disable commands that toggle settings. Wire authorization command to set the new `googleDrive.authorized` flag. Subscribe to settings changes to trigger tree refresh.

**Tech Stack:** VSCode TreeItem API (buttons, ThemeIcon), TreeDataProvider, Settings API, TDD with Jest

---

## File Structure

| File | Responsibility |
|------|-----------------|
| `src/views/backupTreeItem.ts` | ProviderGroupItem with icon and buttons properties |
| `src/views/backupTreeDataProvider.ts` | Icon/button state logic, event subscriptions |
| `src/core/commands/backupToggleCommands.ts` | New enable/disable backup commands |
| `src/core/commands/authorizeGoogleDriveCommand.ts` | Add authorized flag setting |
| `package.json` | New setting schema, command definitions |
| `test/unit/views/backupTreeDataProvider.buttons.test.ts` | Unit tests for button/icon state logic |
| `test/unit/core/commands/backupToggleCommands.test.ts` | Unit tests for enable/disable commands |

---

## Task 1: Add Authorization Setting Schema to package.json

**Files:**
- Modify: `package.json` (settings schema section)

**Goal:** Add `babel.backup.googleDrive.authorized` boolean setting to VSCode configuration schema.

- [ ] **Step 1: Read package.json settings section**

Run: `grep -A 30 '"babel.backup.googleDrive"' package.json | head -40`

Expected: See existing googleDrive settings (enabled, clientId, redirectUri)

- [ ] **Step 2: Add authorized setting to schema**

In `package.json`, find the `babel.backup.googleDrive` object (around line 80-95) and add after the `redirectUri` property:

```json
},
"authorized": {
  "type": "boolean",
  "default": false,
  "description": "OAuth2 authorization status for Google Drive cloud backup (set automatically after successful authorization)"
}
```

- [ ] **Step 3: Verify JSON syntax**

Run: `npm run compile 2>&1 | grep -i "json\|error" || echo "✅ JSON valid"`

Expected: No JSON errors

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: Add googleDrive.authorized setting to backup schema

- Add boolean setting to track OAuth2 authorization status
- Default false, set to true after successful token exchange
- Enables UI to show authorization pending state"
```

---

## Task 2: Create Backup Toggle Commands File

**Files:**
- Create: `src/core/commands/backupToggleCommands.ts`
- Test: `test/unit/core/commands/backupToggleCommands.test.ts`

**Goal:** Implement enable/disable backup provider commands that update settings.

- [ ] **Step 1: Write failing test for enableBackup command**

Create `test/unit/core/commands/backupToggleCommands.test.ts`:

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { registerBackupToggleCommands } from '../../../src/core/commands/backupToggleCommands';

describe('Backup Toggle Commands', () => {
  let mockContext: any;

  beforeEach(() => {
    mockContext = {
      subscriptions: [],
    };
  });

  describe('babel.enableBackup', () => {
    it('should enable local backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      const config = vscode.workspace.getConfiguration('babel.backup');
      const updateSpy = jest.spyOn(config, 'update');

      await vscode.commands.executeCommand('babel.enableBackup', { provider: 'local' });

      expect(updateSpy).toHaveBeenCalledWith('enabled', true, vscode.ConfigurationTarget.Workspace);
    });

    it('should enable cloud backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      const config = vscode.workspace.getConfiguration('babel.backup');
      const updateSpy = jest.spyOn(config, 'update');

      await vscode.commands.executeCommand('babel.enableBackup', { provider: 'cloud' });

      expect(updateSpy).toHaveBeenCalledWith('googleDrive.enabled', true, vscode.ConfigurationTarget.Workspace);
    });
  });

  describe('babel.disableBackup', () => {
    it('should disable local backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      const config = vscode.workspace.getConfiguration('babel.backup');
      const updateSpy = jest.spyOn(config, 'update');

      await vscode.commands.executeCommand('babel.disableBackup', { provider: 'local' });

      expect(updateSpy).toHaveBeenCalledWith('enabled', false, vscode.ConfigurationTarget.Workspace);
    });

    it('should disable cloud backup by updating settings', async () => {
      registerBackupToggleCommands(mockContext);

      const config = vscode.workspace.getConfiguration('babel.backup');
      const updateSpy = jest.spyOn(config, 'update');

      await vscode.commands.executeCommand('babel.disableBackup', { provider: 'cloud' });

      expect(updateSpy).toHaveBeenCalledWith('googleDrive.enabled', false, vscode.ConfigurationTarget.Workspace);
    });
  });

  it('should add disposables to context subscriptions', () => {
    registerBackupToggleCommands(mockContext);

    expect(mockContext.subscriptions.length).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="backupToggleCommands" 2>&1 | tail -20`

Expected: FAIL - "Cannot find module" or "registerBackupToggleCommands is not exported"

- [ ] **Step 3: Create backupToggleCommands.ts with minimal implementation**

Create `src/core/commands/backupToggleCommands.ts`:

```typescript
/**
 * Backup Toggle Commands
 * Enable/disable backup providers via inline tree view buttons
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

const logger = new Logger('BackupToggleCommands');

export function registerBackupToggleCommands(context: vscode.ExtensionContext): void {
  // babel.enableBackup command
  const enableDisposable = vscode.commands.registerCommand(
    'babel.enableBackup',
    async (args: { provider: 'local' | 'cloud' }) => {
      try {
        const config = vscode.workspace.getConfiguration('babel.backup');
        if (args.provider === 'cloud') {
          await config.update('googleDrive.enabled', true, vscode.ConfigurationTarget.Workspace);
          logger.info('Cloud backup enabled');
        } else {
          await config.update('enabled', true, vscode.ConfigurationTarget.Workspace);
          logger.info('Local backup enabled');
        }
      } catch (error) {
        logger.error(`Failed to enable ${args.provider} backup: ${error}`);
        vscode.window.showErrorMessage(`Failed to enable ${args.provider} backup: ${error}`);
      }
    }
  );

  // babel.disableBackup command
  const disableDisposable = vscode.commands.registerCommand(
    'babel.disableBackup',
    async (args: { provider: 'local' | 'cloud' }) => {
      try {
        const config = vscode.workspace.getConfiguration('babel.backup');
        if (args.provider === 'cloud') {
          await config.update('googleDrive.enabled', false, vscode.ConfigurationTarget.Workspace);
          logger.info('Cloud backup disabled');
        } else {
          await config.update('enabled', false, vscode.ConfigurationTarget.Workspace);
          logger.info('Local backup disabled');
        }
      } catch (error) {
        logger.error(`Failed to disable ${args.provider} backup: ${error}`);
        vscode.window.showErrorMessage(`Failed to disable ${args.provider} backup: ${error}`);
      }
    }
  );

  context.subscriptions.push(enableDisposable, disableDisposable);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --testPathPattern="backupToggleCommands" 2>&1 | tail -20`

Expected: PASS - All 5 tests passing

- [ ] **Step 5: Verify no TypeScript errors**

Run: `npm run compile 2>&1 | grep -i error || echo "✅ No errors"`

Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/core/commands/backupToggleCommands.ts test/unit/core/commands/backupToggleCommands.test.ts
git commit -m "feat: Add backup toggle commands (enable/disable providers)

- Add babel.enableBackup command to toggle provider enabled state
- Add babel.disableBackup command to disable providers
- Commands update workspace settings and log changes
- Error handling with user-facing messages"
```

---

## Task 3: Register Toggle Commands in package.json

**Files:**
- Modify: `package.json` (commands section)

**Goal:** Register the new enable/disable commands in VSCode so they can be invoked.

- [ ] **Step 1: Read existing commands in package.json**

Run: `grep -A 3 '"command": "babel' package.json | head -30`

Expected: See existing commands like babel.backupNow, babel.restoreBackup

- [ ] **Step 2: Add enable/disable commands to contributes.commands array**

In `package.json`, find the `contributes.commands` array (around line 100-120) and add before the closing bracket:

```json
{
  "command": "babel.enableBackup",
  "title": "Enable Backup"
},
{
  "command": "babel.disableBackup",
  "title": "Disable Backup"
}
```

- [ ] **Step 3: Verify JSON syntax**

Run: `npm run compile 2>&1 | grep -i "json\|error" || echo "✅ Valid"`

Expected: No JSON errors

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: Register backup toggle commands in package.json

- Add babel.enableBackup command definition
- Add babel.disableBackup command definition
- Commands available for inline button invocation"
```

---

## Task 4: Update BackupTreeItem with Icon & Button Properties

**Files:**
- Modify: `src/views/backupTreeItem.ts`
- Modify: `test/unit/views/backupTreeItem.test.ts` (add tests)

**Goal:** Enhance ProviderGroupItem to support icons and inline action buttons.

- [ ] **Step 1: Read current backupTreeItem.ts**

Run: `head -50 src/views/backupTreeItem.ts`

Expected: See ProviderGroupItem and BackupItem classes

- [ ] **Step 2: Write failing test for ProviderGroupItem with buttons**

In `test/unit/views/backupTreeItem.test.ts`, add after existing tests:

```typescript
describe('ProviderGroupItem with buttons', () => {
  it('should accept buttons property', () => {
    const buttons: vscode.TreeItemButton[] = [
      {
        iconPath: new vscode.ThemeIcon('unlock'),
        tooltip: 'Enable',
        command: {
          title: 'Enable',
          command: 'babel.enableBackup',
          arguments: [{ provider: 'local' }]
        }
      }
    ];

    const item = new ProviderGroupItem('Local Backups', false, false, undefined, buttons);

    expect(item.buttons).toEqual(buttons);
  });

  it('should support isAuthorized property for cloud', () => {
    const item = new ProviderGroupItem('Cloud Backups', true, true, 'authorized');

    expect(item.isAuthorized).toBe('authorized');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- --testPathPattern="backupTreeItem" 2>&1 | tail -20`

Expected: FAIL - ProviderGroupItem constructor doesn't accept buttons parameter

- [ ] **Step 4: Update ProviderGroupItem class signature**

In `src/views/backupTreeItem.ts`, update the ProviderGroupItem class:

```typescript
export class ProviderGroupItem extends vscode.TreeItem {
  constructor(
    public readonly providerName: string,
    public readonly isEnabled: boolean,
    public readonly isCloud: boolean,
    public readonly isAuthorized?: 'authorized' | 'unauthorized',
    public readonly buttons?: vscode.TreeItemButton[]
  ) {
    super(
      `${providerName}`,
      vscode.TreeItemCollapsibleState.Expanded
    );

    // Icon and buttons will be set by BackupTreeDataProvider based on state
    this.contextValue = 'providerGroup';
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --testPathPattern="backupTreeItem" 2>&1 | tail -20`

Expected: PASS - All backupTreeItem tests passing

- [ ] **Step 6: Verify TypeScript**

Run: `npm run compile 2>&1 | grep -i error || echo "✅ No errors"`

Expected: No TypeScript errors

- [ ] **Step 7: Commit**

```bash
git add src/views/backupTreeItem.ts test/unit/views/backupTreeItem.test.ts
git commit -m "feat: Add icon and button properties to ProviderGroupItem

- Add isAuthorized property to track authorization state
- Add buttons property for inline tree item actions
- Updated constructor to accept optional button array
- Tests verify properties are accessible"
```

---

## Task 5: Implement Icon State Logic in BackupTreeDataProvider

**Files:**
- Modify: `src/views/backupTreeDataProvider.ts`
- Create: `test/unit/views/backupTreeDataProvider.buttons.test.ts`

**Goal:** Add getIconForState() and getButtonsForState() methods to determine icons and buttons based on provider state.

- [ ] **Step 1: Write failing tests for icon state logic**

Create `test/unit/views/backupTreeDataProvider.buttons.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { BackupTreeDataProvider } from '../../../src/views/backupTreeDataProvider';
import { BackupRepository } from '../../../src/db/backupRepository';
import { BackupManager } from '../../../src/services/backupManager';
import { createTestDatabase } from '../../helpers/database';

describe('BackupTreeDataProvider - Icon and Button State', () => {
  let provider: BackupTreeDataProvider;
  let backupRepository: BackupRepository;
  let backupManager: any;

  beforeEach(() => {
    const db = createTestDatabase();
    backupRepository = new BackupRepository(db);
    backupManager = {
      onBackupComplete: jest.fn((listener) => {}),
      onRestoreComplete: jest.fn((listener) => {}),
      onDeleteComplete: jest.fn((listener) => {}),
    };
    provider = new BackupTreeDataProvider(backupRepository, backupManager);
  });

  describe('getIconForState', () => {
    it('should return red circle when provider disabled', () => {
      const icon = (provider as any).getIconForState(false, false);

      expect(icon).toBeInstanceOf(require('vscode').ThemeIcon);
      expect((icon as any).id).toBe('circle-filled');
    });

    it('should return green circle when provider enabled and authorized', () => {
      const icon = (provider as any).getIconForState(true, true);

      expect(icon).toBeInstanceOf(require('vscode').ThemeIcon);
      expect((icon as any).id).toBe('circle-filled');
    });

    it('should return amber circle when provider enabled but not authorized', () => {
      const icon = (provider as any).getIconForState(true, false);

      expect(icon).toBeInstanceOf(require('vscode').ThemeIcon);
      expect((icon as any).id).toBe('circle-filled');
    });
  });

  describe('getButtonsForState', () => {
    it('should return enable button when provider disabled', () => {
      const buttons = (provider as any).getButtonsForState(false, false, false);

      expect(buttons).toHaveLength(1);
      expect(buttons[0].tooltip).toContain('Enable');
    });

    it('should return no buttons when local provider enabled', () => {
      const buttons = (provider as any).getButtonsForState(false, true, false);

      expect(buttons).toHaveLength(0);
    });

    it('should return authorize + disable buttons when cloud enabled but not authorized', () => {
      const buttons = (provider as any).getButtonsForState(true, true, false);

      expect(buttons).toHaveLength(2);
      expect(buttons[0].tooltip).toContain('Authorize');
      expect(buttons[1].tooltip).toContain('Disable');
    });

    it('should return no buttons when cloud enabled and authorized', () => {
      const buttons = (provider as any).getButtonsForState(true, true, true);

      expect(buttons).toHaveLength(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --testPathPattern="backupTreeDataProvider.buttons" 2>&1 | tail -20`

Expected: FAIL - getIconForState and getButtonsForState methods not found

- [ ] **Step 3: Implement getIconForState method**

In `src/views/backupTreeDataProvider.ts`, add after the refresh() method:

```typescript
private getIconForState(isEnabled: boolean, isAuthorized: boolean = false): vscode.ThemeIcon {
  if (isEnabled) {
    if (!isAuthorized) {
      // Amber circle for enabled but not authorized (cloud only)
      return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('charts.orange'));
    }
    // Green circle for enabled (and authorized if cloud)
    return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiGreen'));
  }
  // Red circle for disabled
  return new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('terminal.ansiRed'));
}
```

- [ ] **Step 4: Implement getButtonsForState method**

In `src/views/backupTreeDataProvider.ts`, add after getIconForState():

```typescript
private getButtonsForState(
  isCloud: boolean,
  isEnabled: boolean,
  isAuthorized: boolean = false
): vscode.TreeItemButton[] {
  const buttons: vscode.TreeItemButton[] = [];

  if (!isEnabled) {
    // Show enable button when disabled
    buttons.push({
      iconPath: new vscode.ThemeIcon('unlock'),
      tooltip: `Enable ${isCloud ? 'Cloud' : 'Local'} Backup`,
      command: {
        title: `Enable ${isCloud ? 'Cloud' : 'Local'} Backup`,
        command: 'babel.enableBackup',
        arguments: [{ provider: isCloud ? 'cloud' : 'local' }]
      }
    });
  } else if (isCloud && !isAuthorized) {
    // Show authorize and disable buttons when cloud enabled but not authorized
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
  // No buttons when enabled and authorized

  return buttons;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- --testPathPattern="backupTreeDataProvider.buttons" 2>&1 | tail -20`

Expected: PASS - All icon and button state tests passing

- [ ] **Step 6: Commit**

```bash
git add src/views/backupTreeDataProvider.ts test/unit/views/backupTreeDataProvider.buttons.test.ts
git commit -m "feat: Add icon and button state logic to BackupTreeDataProvider

- Add getIconForState() method returning colored circle-filled icons
- Add getButtonsForState() method returning contextual action buttons
- Icons: red (disabled), green (enabled), amber (unauthorized)
- Buttons: enable when disabled, authorize+disable when unauthorized
- Tests cover all 5 state scenarios"
```

---

## Task 6: Update BackupTreeDataProvider.getChildren() to Use Icons & Buttons

**Files:**
- Modify: `src/views/backupTreeDataProvider.ts`

**Goal:** Wire getIconForState() and getButtonsForState() into getChildren() to properly set icons and buttons on ProviderGroupItems.

- [ ] **Step 1: Read current getChildren() implementation**

Run: `sed -n '37,75p' src/views/backupTreeDataProvider.ts`

Expected: See current getChildren() that returns ProviderGroupItems without icons/buttons

- [ ] **Step 2: Update getChildren() to assign icons and buttons**

In `src/views/backupTreeDataProvider.ts`, replace the getChildren() method:

```typescript
async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
  try {
    // Root: return provider groups
    if (!element) {
      const config = vscode.workspace.getConfiguration('babel.backup');
      const localEnabled = config.get<boolean>('enabled') ?? true;
      const cloudEnabled = config.get<boolean>('googleDrive.enabled') ?? false;
      const cloudAuthorized = config.get<boolean>('googleDrive.authorized') ?? false;

      const localGroup = new ProviderGroupItem('Local Backups', localEnabled, false, undefined);
      localGroup.iconPath = this.getIconForState(localEnabled, false);
      localGroup.buttons = this.getButtonsForState(false, localEnabled, false);

      const cloudGroup = new ProviderGroupItem('Cloud Backups', cloudEnabled, true, cloudAuthorized ? 'authorized' : 'unauthorized');
      cloudGroup.iconPath = this.getIconForState(cloudEnabled, cloudAuthorized);
      cloudGroup.buttons = this.getButtonsForState(true, cloudEnabled, cloudAuthorized);

      return [localGroup, cloudGroup];
    }

    // Provider group: return backups
    if (element instanceof ProviderGroupItem) {
      const allBackups = this.backupRepository.findAll();

      // Filter by provider (for now, all backups are local)
      const backups = element.isCloud ? [] : allBackups;

      // Sort by timestamp (most recent first) and limit to 10 entries
      const recentBackups = backups
        .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
        .slice(0, 10);

      return recentBackups.map(
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
```

- [ ] **Step 3: Add settings change listener**

After the constructor in BackupTreeDataProvider, add:

```typescript
// Subscribe to settings changes to update icons/buttons
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('babel.backup')) {
    this.refresh();
  }
});
```

- [ ] **Step 4: Run all tests to verify nothing broke**

Run: `npm test -- --testPathPattern="backupTreeDataProvider" 2>&1 | tail -30`

Expected: All backupTreeDataProvider tests passing (including new button/icon tests)

- [ ] **Step 5: Verify TypeScript**

Run: `npm run compile 2>&1 | grep -i error || echo "✅ No errors"`

Expected: No TypeScript errors

- [ ] **Step 6: Verify full test suite**

Run: `npm test 2>&1 | tail -5`

Expected: All tests passing (should be 790+ total)

- [ ] **Step 7: Commit**

```bash
git add src/views/backupTreeDataProvider.ts
git commit -m "feat: Wire icon and button state into getChildren()

- Set icons on provider groups based on enabled/authorized state
- Set buttons on provider groups based on state
- Subscribe to settings changes to refresh tree on backup config changes
- Icons and buttons update reactively when settings change"
```

---

## Task 7: Update AuthorizeGoogleDriveCommand to Set Authorized Flag

**Files:**
- Modify: `src/core/commands/authorizeGoogleDriveCommand.ts`

**Goal:** After successful OAuth2 token exchange, set the `babel.backup.googleDrive.authorized` flag to true.

- [ ] **Step 1: Read current authorizeGoogleDriveCommand.ts**

Run: `wc -l src/core/commands/authorizeGoogleDriveCommand.ts && echo "---" && tail -50 src/core/commands/authorizeGoogleDriveCommand.ts`

Expected: See end of file where token is stored

- [ ] **Step 2: Find where tokens are stored successfully**

Run: `grep -n "tokenManager.storeToken\|authorization successful" src/core/commands/authorizeGoogleDriveCommand.ts`

Expected: Find the line where successful authorization happens

- [ ] **Step 3: Add setting update after token storage**

In `src/core/commands/authorizeGoogleDriveCommand.ts`, after the line `await tokenManager.storeToken(...)`, add:

```typescript
// Update authorization status in settings
const config = vscode.workspace.getConfiguration('babel.backup');
await config.update('googleDrive.authorized', true, vscode.ConfigurationTarget.Workspace);
logger.info('Google Drive authorization completed and saved');
```

- [ ] **Step 4: Run existing tests to verify nothing broke**

Run: `npm test -- --testPathPattern="authorizeGoogleDrive" 2>&1 | tail -20`

Expected: All existing authorization tests still passing

- [ ] **Step 5: Verify TypeScript**

Run: `npm run compile 2>&1 | grep -i error || echo "✅ No errors"`

Expected: No TypeScript errors

- [ ] **Step 6: Commit**

```bash
git add src/core/commands/authorizeGoogleDriveCommand.ts
git commit -m "feat: Set authorized flag after successful Google Drive authorization

- After token exchange, update babel.backup.googleDrive.authorized to true
- Settings change triggers tree refresh showing green icon
- Enables 'Authorize' button to disappear when authorization complete"
```

---

## Task 8: Register Toggle Commands in CommandRegistry

**Files:**
- Modify: `src/core/commands/commandRegistry.ts`

**Goal:** Import and register the backup toggle commands on extension activation.

- [ ] **Step 1: Read CommandRegistry.ts**

Run: `head -50 src/core/commands/commandRegistry.ts`

Expected: See imports and registerAll() method

- [ ] **Step 2: Add import for backupToggleCommands**

At the top of `src/core/commands/commandRegistry.ts`, add:

```typescript
import { registerBackupToggleCommands } from './backupToggleCommands';
```

- [ ] **Step 3: Call registerBackupToggleCommands in registerAll()**

In the registerAll() method, add after existing command registrations:

```typescript
// Register backup toggle commands (enable/disable providers)
registerBackupToggleCommands(context);
logger.info('Registered backup toggle commands');
```

- [ ] **Step 4: Run all command tests**

Run: `npm test -- --testPathPattern="commandRegistry" 2>&1 | tail -20`

Expected: All command registry tests passing

- [ ] **Step 5: Verify TypeScript**

Run: `npm run compile 2>&1 | grep -i error || echo "✅ No errors"`

Expected: No TypeScript errors

- [ ] **Step 6: Run full test suite**

Run: `npm test 2>&1 | tail -5`

Expected: All 790+ tests passing

- [ ] **Step 7: Commit**

```bash
git add src/core/commands/commandRegistry.ts
git commit -m "feat: Register backup toggle commands in CommandRegistry

- Import registerBackupToggleCommands function
- Call during registerAll() to register enable/disable commands
- Commands available for inline button execution"
```

---

## Task 9: Manual Testing & Verification

**Files:** None (testing only)

**Goal:** Verify the backup tree view icons and buttons work correctly in VSCode.

- [ ] **Step 1: Compile and verify zero errors**

Run: `npm run compile 2>&1`

Expected: Compilation successful

- [ ] **Step 2: Run full test suite**

Run: `npm test 2>&1 | grep "Test Suites\|Tests:"`

Expected: All tests passing (should be 790+)

- [ ] **Step 3: Start VSCode extension in debug mode** (Manual - user performs)

In VSCode: Press F5 to start debug extension. A new VSCode window opens with extension loaded.

- [ ] **Step 4: Open backup tree view** (Manual - user performs)

Click on "Backups" in sidebar to view the backup tree.

- [ ] **Step 5: Verify icons** (Manual - user performs)

Verify:
- [ ] Local Backups shows 🟢 green circle when enabled
- [ ] Local Backups shows 🔴 red circle when disabled
- [ ] Cloud Backups shows 🟢 green circle when enabled and authorized
- [ ] Cloud Backups shows 🟡 amber circle when enabled but not authorized
- [ ] Cloud Backups shows 🔴 red circle when disabled

- [ ] **Step 6: Verify buttons** (Manual - user performs)

Verify:
- [ ] Disabled providers show "Enable" button
- [ ] Cloud shows "Authorize" + "Disable" buttons when enabled but not authorized
- [ ] Enabled/authorized providers show no buttons

- [ ] **Step 7: Test enable button** (Manual - user performs)

Click "Enable Local Backup" button → Verify:
- [ ] Opens VSCode settings focused on babel.backup.enabled
- [ ] Tree refreshes showing green icon
- [ ] Buttons disappear

- [ ] **Step 8: Test disable button** (Manual - user performs)

Click "Disable Cloud Backup" button → Verify:
- [ ] Settings update to false
- [ ] Tree refreshes showing red icon
- [ ] Enable button reappears

- [ ] **Step 9: Test authorize button** (Manual - user performs)

Click "Authorize Google Drive" button → Verify:
- [ ] Browser opens to Google OAuth consent screen
- [ ] After authorization, tree shows green icon
- [ ] Authorize buttons disappear

- [ ] **Step 10: Final verification**

Run: `npm test && npm run compile 2>&1 | tail -10`

Expected: All tests passing, zero TypeScript errors

- [ ] **Step 11: Commit final state**

```bash
git status
git add -A
git commit -m "test: Manual verification of backup icons and buttons complete

All icon states verified:
- Red circle when disabled
- Green circle when enabled/authorized
- Amber circle when enabled but unauthorized

All buttons functional:
- Enable opens settings
- Disable toggles state
- Authorize opens browser and sets flag"
```

---

## Success Criteria

- ✅ ProviderGroupItem has icon and buttons properties
- ✅ Icons use colored circle-filled ThemeIcons (red/green/amber)
- ✅ Inline buttons appear based on provider state (5 scenarios)
- ✅ Enable buttons toggle settings and open VSCode settings
- ✅ Disable buttons toggle settings
- ✅ Authorize button triggers OAuth2 and sets authorized flag
- ✅ Tree refreshes when settings change
- ✅ All 5 button/icon state scenarios tested
- ✅ No TypeScript errors
- ✅ Manual testing confirms all features work
- ✅ 790+ tests passing
