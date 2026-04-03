# V1 → V2 Auto-Migration Design

**Date:** 2026-04-03  
**Status:** Design Phase  
**Scope:** Seamless automatic migration for v1 users upgrading to v2

---

## Overview

When users upgrade from Babel v1 (JSON-based database) to v2 (SQLite + git-native), their existing data must be migrated automatically. This design provides a safe, transparent, multi-phase migration system triggered only when users open the Babel view.

**Key Principles:**
- **Lazy trigger** — Only migrate if user opens Babel view
- **Safe by default** — Complete backup before any changes
- **Transparent preview** — Show exactly what will be created
- **Graceful failure** — Pause on error and offer retry/rollback
- **Correct branching** — Two-phase execution ensures common files exist in all branches

---

## 1. Detection & User Choice

### When Trigger Happens

The Babel tree view provider checks on first activation:

```
1. Does `.babel/babel.db` exist?
   └─ YES → Extension already initialized, skip detection
   └─ NO → Check for v1 migration
      
2. Does `babel.json` exist in workspace root?
   └─ YES → Found v1 data, show migration dialog
   └─ NO → Fresh workspace, initialize normally
```

### Migration Dialog

User sees a modal with two options:

```
┌──────────────────────────────────────────┐
│ Babel Migration Required                 │
├──────────────────────────────────────────┤
│ Found Babel v1 data (babel.json).        │
│                                          │
│ Migrate to v2? v2 uses a new database    │
│ format and will create separate git      │
│ repos for each story.                    │
│                                          │
│ [Migrate Now] [Use v1]                  │
└──────────────────────────────────────────┘
```

**Button actions:**
- **Migrate Now** → Phase 1: Backup
- **Use v1** → Show message: "To use Babel v1, downgrade the extension from the VSCode marketplace" + disable Babel view

---

## 2. Backup Phase

Before any migration work:

1. **Create backup directory:**
   ```
   .babel/backups/babel-backup-<TIMESTAMP>/
   └─ (copy entire workspace contents)
   ```

2. **Show progress dialog:**
   ```
   Creating backup...
   [████████░░░░░░░░░░] 45%
   ```

3. **On completion:**
   - Show: "Backup created at `.babel/backups/babel-backup-<TIMESTAMP>`"
   - Proceed to Phase 2: Validate
   - Store backup path in memory for rollback if needed

---

## 3. Validate Phase

Run `migrationValidator.validate()` on v1 data:

- Load `babel.json`
- For each story:
  - Check if any files exist (skip if completely empty)
  - Map versions to v1 branches
  - Determine v2 target branches/files
  - Collect errors without failing fast

**Result:** Migration plan with detailed breakdown per story

---

## 4. Preview Phase

Save migration plan summary to a file and ask user to review:

1. **Generate preview file:**
   ```
   .babel/migration-preview-<TIMESTAMP>.md
   ```

2. **Show dialog:**
   ```
   ┌──────────────────────────────────────┐
   │ Migration Preview Created            │
   ├──────────────────────────────────────┤
   │ Review the migration plan at:        │
   │ .babel/migration-preview.md          │
   │                                      │
   │ [Open] [Proceed] [Cancel]            │
   └──────────────────────────────────────┘
   ```

3. **Preview file contents:**
   ```markdown
   # Babel V1 → V2 Migration Preview
   
   ## Story 1: "Draft Novel"
   - draft (v1: draft1) → v2: draft.md on 'draft' branch
   - outline (v1: outline) → v2: outline.md on 'draft' branch
   - translation (v1: translation) → v2: draft.md on 'translation' branch
   
   ## Story 2: "Short Story"
   - I (v1: draft1) → v2: I.md on 'draft' branch
   - II (v1: draft1) → v2: II.md on 'draft' branch
   
   ## Story 3: "Empty"
   - SKIPPED: No files found
   
   ## Summary
   - Total: 3 stories (2 will be created, 1 skipped)
   - Files to migrate: 5
   - Branches to create: 2 (draft, translation)
   - Backup location: .babel/backups/babel-backup-<TIMESTAMP>/
   ```

**User can:**
- [Open] → Open preview in editor tab
- [Proceed] → Start migration
- [Cancel] → Abort (backup deleted, v1 untouched)

---

## 5. Migration Execution (Two-Phase Strategy)

### Execution Order

Versions are processed in two phases. For each version, we checkout its v1 branch, merge outline/characters, then copy just that version's file to v2.

- **Phase A:** All versions except `draft*`, `revision*`, `translation*` (includes custom files like I, II, foobar, plus outline and characters as files)
- **Phase B:** Only `draft*`, `revision*`, `translation*` versions (overwrites `draft.md` on their respective branches)

#### **Phase A: Non-Standard Versions First**

For each version **NOT matching** `draft*`, `revision*`, `translation*` (e.g., `I`, `II`, `foobar`, `outline`, `characters`):

1. Checkout version's v1 branch (from `babel.json`)
2. Merge `outline` and `characters` branches into current v1 branch (if they exist; ignore errors)
3. Read just this version's file (e.g., `I.md`, `II.md`, `outline.md`, `characters.md`)
4. On v2: Ensure on `draft` branch
5. Write file to v2 with original filename (e.g., `I.md`, `outline.md`, `characters.md`)
6. Commit: `migrate: add <filename> from v1`
7. Move to next version

**Result:** `draft` branch accumulates all custom files including outline and characters

#### **Phase B: Standard Versions (draft/revision/translation)**

For each version matching `draft*`, `revision*`, `translation*`:

1. Checkout version's v1 branch (from `babel.json`)
2. Merge `outline` and `characters` branches into current v1 branch (if they exist; ignore errors)
3. Read just this version's file (e.g., `draft.md`, `revision.md`, `translation.md`)
4. On v2: Create branch with same name as version, checkout it
5. Write file to v2 **as `draft.md`** (always overwrite `draft.md`, regardless of source filename)
6. Commit: `migrate: add draft.md from v1`
7. Move to next version

**Result:** Each branch has `draft.md` with version-specific content + inherits all custom files from Phase A

### Example Migration Flow

**V1 Story: "Novel" with versions:**
- `draft` (v1 branch: draft1)
- `I` (v1 branch: draft1)
- `II` (v1 branch: draft1)
- `outline` (v1 branch: outline)
- `translation` (v1 branch: translation)

**Phase A (I, II, outline - non-standard):**

1. Version `I`:
   - Checkout v1 `draft1`
   - Merge `outline` and `characters` (if exist)
   - Read `I.md`
   - On v2: checkout `draft`
   - Write `I.md`
   - Commit

2. Version `II`:
   - Checkout v1 `draft1`
   - Merge `outline` and `characters` (if exist)
   - Read `II.md`
   - On v2: checkout `draft` (already there)
   - Write `II.md`
   - Commit

3. Version `outline`:
   - Checkout v1 `outline`
   - Merge `outline` and `characters` (if exist)
   - Read `outline.md`
   - On v2: checkout `draft`
   - Write `outline.md`
   - Commit

**After Phase A, v2 `draft` branch:**
```
I.md
II.md
outline.md
```

**Phase B (draft, translation - standard):**

1. Version `draft`:
   - Checkout v1 `draft1`
   - Merge `outline` and `characters`
   - Read `draft.md`
   - On v2: create/checkout `draft` branch
   - Write to `draft.md` (overwrite)
   - Commit

2. Version `translation`:
   - Checkout v1 `translation`
   - Merge `outline` and `characters` (if exist on this branch)
   - Read `translation.md`
   - On v2: create/checkout `translation` branch
   - Write to `draft.md` (overwrite with translation content)
   - Commit

**Final v2 state:**
```
v2 Story Directory:
├── .git/
├── draft (branch)
│   ├── draft.md (content from v1 draft.md)
│   ├── I.md (custom file from Phase A)
│   ├── II.md (custom file from Phase A)
│   └── outline.md (from Phase A)
└── translation (branch)
    ├── draft.md (content from v1 translation.md)
    ├── I.md (inherited from draft)
    ├── II.md (inherited from draft)
    └── outline.md (inherited from draft)
```

### Error Handling During Migration

If an error occurs while migrating a version:

1. **Log error** with story ID, version name, branch, detailed message
2. **Continue to next version** (don't stop entire migration)
3. **Track failures** in results
4. **After all versions processed**, proceed to results summary
5. **In summary**, show which stories/versions failed
6. **Offer user choice:**
   - "Retry migration?" (restore from backup, restart)
   - "Keep v2 as-is?" (proceed with partial migration, backup stays)
   - "Rollback to v1?" (restore backup, start over)

---

## 6. Results Summary

After migration completes, show detailed results dialog:

```
┌─────────────────────────────────────────────────────────┐
│ Migration Complete                                      │
├─────────────────────────────────────────────────────────┤
│                                                         │
│ ✓ Story 1 "Draft Novel"                                │
│   3 versions migrated (draft, translation, outline)     │
│   2 branches created (draft, translation)               │
│                                                         │
│ ✓ Story 2 "Short Story"                                │
│   2 versions migrated (I, II)                           │
│   1 branch created (draft)                              │
│                                                         │
│ ✗ Story 3 "Empty"                                       │
│   Skipped (no files)                                    │
│                                                         │
│ ✗ Story 4 "Broken Repo"                                │
│   Failed: Could not checkout v1 branch "weird"         │
│                                                         │
│ ─────────────────────────────────────────────────────  │
│ Total: 2/4 stories, 5 versions, 3 branches             │
│ Report: .babel/migration-report-2026-04-03-120000.md  │
│                                                         │
│ [View Report] [Close]                                  │
└─────────────────────────────────────────────────────────┘
```

**Report file (.md):**
- Timestamp of migration
- Summary stats
- Per-story results with version counts
- All errors encountered
- Backup location
- Instructions for rollback if needed

---

## 7. Key Implementation Details

### Data Structures

**MigrationState** (in-memory during migration):
```typescript
interface MigrationState {
  v1Directory: string
  v2Directory: string
  backupPath: string
  plan: MigrationPlan
  currentStory?: string
  phase: 'backup' | 'validate' | 'preview' | 'migrate' | 'complete'
  errors: string[]
}
```

### File Organization

**New files:**
- `src/extension/initialize-migration.ts` — Lazy detection on tree view open
- `src/services/migrationBackup.ts` — Backup creation & rollback
- `src/services/migrationExecutor2.ts` — Two-phase execution (refactor current executor)

**Modified files:**
- `src/extension.ts` — Add migration detection hook before tree initialization
- `src/views/storyTreeDataProvider.ts` — Check for migration before loading stories

### Progress UI

Simple progress using VSCode API:

1. **Before migration starts:**
   ```
   ┌──────────────────────────────────┐
   │ Creating backup...               │
   │ (Please wait)                    │
   └──────────────────────────────────┘
   ```

2. **During migration:**
   ```
   ┌──────────────────────────────────┐
   │ Migrating stories...             │
   │ Story 3/5: "Draft Novel"         │
   │ (Please wait)                    │
   └──────────────────────────────────┘
   ```
   - Updated every story (not per-version for simplicity)
   - Can't cancel mid-migration (too risky)

3. **Timing & Logging:**
   - Log all operations to migration logger
   - Estimate duration: ~500-2000ms per story depending on git operations

---

## 8. Testing Strategy

### Unit Tests
- Validator: correct plan generation, branch mapping, error collection
- Backup: directory creation, cleanup on success/failure
- Two-phase execution: correct file copying order, branch creation

### Integration Tests
- End-to-end migration with v1 test repo
- Verify v2 git repos have correct branches, files, commits
- Verify database records created correctly
- Test error scenarios: missing v1 branches, invalid files

### E2E Tests
- User clicks Babel view with v1 data present
- Dialog appears, shows preview
- User clicks Migrate, completes
- Verify v2 stories appear in tree view

---

## 9. Success Criteria

✅ User with v1 `babel.json` opens Babel view  
✅ Migration dialog appears, user can preview what will be created  
✅ Backup created before any changes  
✅ All story files migrated with correct branches  
✅ Custom files (I.md, II.md, etc.) exist in all branches  
✅ Results summary shows what was created/skipped/failed  
✅ On error, user can retry or rollback  
✅ After migration, Babel v2 works normally with migrated data  

---

## 10. Migration Flow Diagram

```
User opens Babel view
        ↓
Detect v1 babel.json?
    ├─ NO → Initialize normally
    └─ YES → Show migration dialog
            ├─ "Use v1" → Show downgrade message, disable view
            └─ "Migrate Now"
                ↓
                Create timestamped backup
                ↓
                Validate v1 data
                ↓
                Generate preview file (.babel/migration-preview.md)
                ↓
                Show dialog: "Review preview and proceed?"
                ├─ "Open" → Open preview file in editor
                ├─ "Cancel" → Delete backup, abort
                └─ "Proceed"
                    ↓
                    Show progress: "Creating backup..."
                    ↓
                    Show progress: "Migrating stories..."
                    ├─ Per story: checkout v1 branch, merge outline/chars
                    ├─ Phase A: Copy non-standard files to draft
                    ├─ Phase B: Copy standard files to own branches
                    └─ Handle errors (pause, offer retry/rollback)
                    ↓
                    Show results summary dialog
                    ├─ Stories created/skipped/failed
                    └─ [Close]
                    ↓
                    Initialize v2 normally
                    ↓
                    Babel view shows migrated stories
```

---

## 11. Deferred to Phase 2

- Auto-backup on regular schedule (not migration-specific)
- Activity history migration (daily word counts from v1)
- Selective story migration (migrate only chosen stories)
- V1 data archive/cleanup tool
