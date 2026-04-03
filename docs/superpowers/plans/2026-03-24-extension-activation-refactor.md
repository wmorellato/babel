# Extension Activation Refactoring Implementation Plan (CORRECTED)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the 610-line activate() function into modular, reusable feature initialization system with centralized listener coordination.

**Architecture:** Three layers: (1) infrastructure initialization, (2) feature initialization (each in isolated file returning Disposable), (3) listener coordination (centralized hub). Features register handlers with ListenerCoordinator instead of creating duplicate listeners.

**Tech Stack:** TypeScript, VSCode Extension API, Jest testing framework

---

## Critical Implementation Notes

**⚠️ API Compatibility Issues Found and Corrected:**

1. **BackupManager constructor** — Requires `(config: BackupConfig, backupRepository: BackupRepository)`, NOT the arguments shown in initial plan
2. **BackupTreeDataProvider** — Takes `(backupRepository, backupManager)`, NOT three arguments
3. **ToggleBackupCommand/DeleteBackupCommand** — Constructors differ; check actual class signatures before implementing
4. **ApplyColorCommand/RemoveColorCommand** — Use `.register()` pattern, not custom static `execute()` method
5. **DropboxConnectivityChecker** — Takes `TokenManager`, not credential storage
6. **BackupDataCollector in dependencies** — Must be added to `ExtensionDependencies` to support word count → backup connection

**References needed before implementation:**
- Read: `src/services/backupManager.ts` (lines with constructor)
- Read: `src/views/backupTreeDataProvider.ts` (constructor signature)
- Read: `src/core/commands/toggleBackupCommand.ts` (constructor)
- Read: `src/core/commands/applyColorCommand.ts` (register method signature)

---

## File Structure

### New Files (10 files)
| File | Purpose | Est. Lines |
|------|---------|-----------|
| `src/extension/listenerCoordinator.ts` | Listener deduplication | 50 |
| `src/extension/types.ts` | ExtensionDependencies interface | 35 |
| `src/extension/initialize-color-annotations.ts` | Color feature init | 120 |
| `src/extension/initialize-auto-commit.ts` | Auto-commit feature init | 80 |
| `src/extension/initialize-word-count.ts` | Word count init | 140 |
| `src/extension/initialize-backups.ts` | Backup init (commands extracted separately) | 80 |
| `src/extension/initialize-commands.ts` | Command registry init | 30 |
| `src/extension/initialize-hover-providers.ts` | Hover providers init | 20 |
| `src/extension/initialize-tree-providers.ts` | Tree providers init | 40 |
| `src/extension/initialize-status-bars.ts` | Status bars init | 40 |

### Modified Files
| File | Changes |
|------|---------|
| `src/extension.ts` | Replace activate() (lines 64-674), update deactivate(), remove stale module vars |
| `test/__mocks__/vscode.ts` | Add mock listeners for onDidChangeActiveTextEditor, onDidSaveTextDocument, onDidChangeTextDocument |

---

## Task Breakdown (Simplified)

### Task 1: Research and Verify Current Code

- [ ] Read `src/services/backupManager.ts` to verify constructor signature
- [ ] Read `src/views/backupTreeDataProvider.ts` to verify constructor
- [ ] Read `src/core/commands/toggleBackupCommand.ts` to verify command class
- [ ] Read `src/core/commands/applyColorCommand.ts` to verify the `.register()` pattern
- [ ] Read `src/extension.ts` lines 600-650 to see actual backupNow/restoreBackup command implementations
- [ ] Verify all required classes exist with correct signatures

**Expected outcome:** Accurate understanding of actual APIs, not plan assumptions.

---

### Task 2: Create ListenerCoordinator

**Files:** `src/extension/listenerCoordinator.ts`, `test/__mocks__/vscode.ts`

- [ ] Add mock listeners to `test/__mocks__/vscode.ts` (window.onDidChangeActiveTextEditor, workspace.onDidSaveTextDocument, workspace.onDidChangeTextDocument)
- [ ] Write ListenerCoordinator tests with direct handler invocation (not VSCode event firing)
- [ ] Implement ListenerCoordinator with three handler arrays + createListeners() that returns Disposables
- [ ] Run `npm test -- test/unit/extension/listenerCoordinator.test.ts` → all pass
- [ ] Run `npm test` → no regressions
- [ ] Commit

---

### Task 3: Create ExtensionDependencies Type

**Files:** `src/extension/types.ts`

- [ ] Create interface with all required fields (database, repos, services, coordinator, logger, optional: treeDataProvider)
- [ ] Import required types
- [ ] Verify TypeScript compilation
- [ ] Commit

---

### Task 4: Extract Individual Features

For each of Tasks 4a-4h below:
- [ ] Identify exact code in current activate() that handles feature
- [ ] Create new `initialize-xyz.ts` file
- [ ] Copy feature code into new file, adjusting to accept deps parameter
- [ ] Return vscode.Disposable from function
- [ ] Verify compilation
- [ ] Run `npm test` and verify no regressions
- [ ] Commit

**Task 4a: Color Annotations**
- Files: `src/extension/initialize-color-annotations.ts`
- Extract: updateColorDecorations logic, color command registration, hover provider (lines ~148-453)
- Key: Use ApplyColorCommand.register() and RemoveColorCommand.register() patterns (check actual classes)

**Task 4b: Auto-Commit**
- Files: `src/extension/initialize-auto-commit.ts`
- Extract: AutoCommitManager creation, bootstrapping, editor listener (lines ~204-246)

**Task 4c: Word Count Tracking**
- Files: `src/extension/initialize-word-count.ts`
- Extract: DailyWordCountTracker setup, save listener, editor listener (lines ~247-410)
- Key: Do NOT include backup triggering logic here; auto-save backup handling goes in initialize-backups.ts

**Task 4d: Backup Management**
- Files: `src/extension/initialize-backups.ts`
- Extract: BackupManager, BackupTreeDataProvider, backup-related commands (lines ~455-672)
- Key: Verify actual BackupManager constructor signature before implementing
- Important: Include backupNow and restoreBackup command implementations (currently in activate)

**Task 4e: Commands**
- Files: `src/extension/initialize-commands.ts`
- Extract: CommandRegistry creation and registerAll call (lines ~195-208)

**Task 4f: Hover Providers**
- Files: `src/extension/initialize-hover-providers.ts`
- Extract: SelectionWordCountHover registration (lines ~427-437)
- Note: Color hover registration is in Task 4a

**Task 4g: Tree Providers**
- Files: `src/extension/initialize-tree-providers.ts`
- Extract: BabelStoriesTreeDataProvider creation and registration (lines ~125-146)
- Return: treeDataProvider so deps can be updated for downstream features

**Task 4h: Status Bars**
- Files: `src/extension/initialize-status-bars.ts`
- Extract: StoryStatusBar creation and editor listener (lines ~132-145)

---

### Task 5: Refactor activate() and deactivate()

**Files:** `src/extension.ts`

- [ ] Add imports for all new initialize-* functions and ListenerCoordinator
- [ ] Add module-level variable: `let featureDisposablesForCleanup: vscode.Disposable | null = null;`
- [ ] Replace activate() function (lines 64-674) with new orchestration:
  - Infrastructure initialization (database, repos, services)
  - Create ListenerCoordinator
  - Build ExtensionDependencies object
  - Call features in dependency order: tree providers (first, others depend on refresh) → core features → dependent features → supporting
  - Collect returned Disposables
  - Store in featureDisposablesForCleanup
  - Register coordinator listeners
  - Do NOT store module-level variables like `treeDataProvider`, `dailyWordCountTracker` (those are now internal to feature functions)

- [ ] Update deactivate() to only dispose featureDisposablesForCleanup
- [ ] Remove stale module-level variable declarations (lines 39-52) that are no longer used
- [ ] Verify TypeScript compilation (`npm run compile`)
- [ ] Run full test suite (`npm test`) → all tests pass
- [ ] Commit

---

### Task 6: Final Verification

- [ ] `npm run compile` → zero errors, zero warnings
- [ ] `npm test` → all tests pass (940+)
- [ ] Manual activation test: press F5, extension starts, no console errors
- [ ] Verify key features work: open a story file, check colors/auto-commit/status bar
- [ ] Check code metrics: `wc -l src/extension.ts` should be ~150-200 (down from 790)

---

## Key Differences from Initial Plan

1. **Task 1 added** — Research current code to get accurate API signatures (avoids compile errors)
2. **Task 4c changed** — Word count tracking no longer includes backup triggering; that's in 4d
3. **Task 4d expanded** — Backup management includes the full backupNow/restoreBackup command logic (verify in current extension.ts ~600-650)
4. **ExtensionDependencies** — Must include `BackupDataCollector` to support cross-feature dependency
5. **deactivate() simplified** — Only disposes featureDisposablesForCleanup; no manual module variable nulling
6. **Module-level cleanup** — Stale variables removed as part of Task 5

---

## Testing Strategy

- **ListenerCoordinator tests** — Direct handler invocation, not VSCode event firing (avoids mock issues)
- **Feature extraction tests** — Run full test suite after each task to catch regressions immediately
- **Final verification** — Full test suite, compilation, manual smoke test

---

## Success Criteria

✅ `src/extension.ts` activate() is ~100-150 lines (clean orchestration)
✅ Each initialize-*.ts is <150 lines (focused, readable)
✅ All 940+ existing tests pass (no regressions)
✅ Zero TypeScript errors
✅ Extension activates without console errors
✅ Key features still work (colors, auto-commit, word count, backups)

---

## Risk Mitigation

**High-risk areas:**
1. BackupManager constructor — **Mitigated:** Task 1 researches actual signature before implementing
2. Color command APIs — **Mitigated:** Read existing apply/remove command code before extracting
3. Cross-feature dependencies (word count ↔ backups) — **Mitigated:** Backup triggering moved to initialize-backups, not word-count

**Testing safeguards:**
- Run full test suite after each task (catch regressions early)
- No behavioral changes, pure refactoring (existing tests still relevant)
- Manual smoke test after completion (verify UI features work)

---

## Estimated Effort

- Task 1 (Research): 20 min
- Task 2 (ListenerCoordinator): 40 min
- Task 3 (Types): 10 min
- Tasks 4a-4h (Feature extraction × 8): 30 min each = 240 min
- Task 5 (Refactor activate/deactivate): 40 min
- Task 6 (Verification): 20 min

**Total: ~6.5 hours**

(The research task upfront prevents costly compile-error iterations)

---

## Notes for Implementer

1. **Do NOT proceed with feature extraction until Task 1 is done.** The research phase prevents implementing with wrong APIs.

2. **Run `npm test` after EVERY task.** If tests fail, fix immediately before moving to next task.

3. **For backup commands:** Search `extension.ts` for `babel.backupNow` and `babel.restoreBackup` command implementations (~90 lines total). These MUST be extracted into initialize-backups.ts or they will be lost.

4. **For color commands:** Do NOT create custom command registration. Use the existing `.register()` class methods on ApplyColorCommand and RemoveColorCommand.

5. **Dependency ordering matters:** Tree providers must initialize before commands/backups (they need the refresh callback). Verify sequence in Task 5 matches the order listed above.
