# Babel v1 → v2 Migration Command Design

**Date:** 2026-04-01
**Status:** Design Approved
**Scope:** Standalone CLI tool to migrate Babel v1 projects (file-versioned) to Babel v2 (git-versioned)

---

## Executive Summary

The migration command enables users to port their entire Babel v1 project (including all stories, versions, and metadata) into a new Babel v2 workspace. The command runs as a standalone CLI, validates v1 data in Phase 1, executes the migration in Phase 2, and generates a detailed report of all actions taken.

**Key characteristics:**
- Two-phase validation + execution
- One-time setup operation (run before opening in VSCode)
- Fail-safe: skips errors, doesn't abort entire migration
- Generates human-readable and machine-readable reports
- Preserves v1 timestamps and story IDs where possible

---

## Architecture Overview

```
migrate-v1-to-v2 [v1-directory]
├── Phase 1: Validation
│   ├── Load v1 babel.json
│   ├── Walk story directories, validate files exist
│   ├── Detect story types by word count
│   ├── Build comprehensive migration plan
│   └── Collect validation errors (don't abort)
│
├── Phase 2: Execution
│   ├── Initialize v2 database if needed
│   ├── For each valid story:
│   │   ├── Create story record in v2 database
│   │   ├── Initialize git repository (one per story)
│   │   ├── Process versions (draft.md, draftX.md, other files)
│   │   ├── Create git branches and commits per version
│   │   └── Track success/failure
│   │
│   └── Generate detailed migration report
│
└── Output
    ├── Console: human-readable summary + details
    ├── JSON file: machine-readable report
    └── Exit code: 0 (success), 1 (failure)
```

**Architecture principle:** Each story has its own isolated git repository (both v1 and v2). Migrations operate independently per story.

---

## CLI Interface

```bash
migrate-v1-to-v2 [v1-directory] [options]

Options:
  --v2-directory <path>    Path to v2 workspace (default: current working directory)
  --dry-run                Validate only, don't write to disk/git
  --verbose                Enable detailed logging
  --report-file <path>     Save JSON report to file (default: migration-report.json)
  --help                   Show this help message
```

**Examples:**
```bash
# Basic usage
migrate-v1-to-v2 ~/Documents/BabelTest/

# Dry-run to preview
migrate-v1-to-v2 ~/Documents/BabelTest/ --dry-run

# Custom v2 directory
migrate-v1-to-v2 ~/Documents/BabelTest/ --v2-directory ~/Projects/my-babel-v2

# Save report to specific location
migrate-v1-to-v2 ~/Documents/BabelTest/ --report-file ./my-migration-report.json
```

---

## Phase 1: Validation

**Input:** v1 directory path
**Output:** `MigrationPlan` or validation errors

### Process

**1. Load v1 babel.json**
- Parse JSON from `v1-directory/babel.json`
- Validate structure: must have `stories[]` and `versions[]` arrays
- If malformed: fail fast, log error, exit with code 1

**2. For each story in babel.json:**
- Extract: id, title, created timestamp, versions array
- Walk story directory at `v1-directory/stories/{story-id}/`
- Build file manifest (list all .md files present)
- Validate: at least one of draft.md or draftX.md exists
  - If missing: mark story as **SKIPPED** with reason "No draft files found"
  - Log: "Story '{title}' ({id}) skipped: {reason}"
- Detect story type by word count:
  - Read draft.md (or highest-numbered draft if draft.md absent)
  - Count words
  - Assign type:
    - < 10,000: `SHORT_STORY`
    - 10,000 - 50,000: `NOVELLA`
    - > 50,000: `NOVEL`

**3. For each version in story's version array:**
- Match version to file on disk by name and ID
- Determine target action:
  - Named "draft" → map to draft.md
  - Named "outline" → map to outline.md
  - Named "characters" → map to characters.md
  - Any other name → map to {name}.md
- If file doesn't exist: skip version, log warning
- Record file path for later execution

**4. Output MigrationPlan**

```typescript
interface MigrationPlan {
  v1Source: string
  stories: StoryStagingPlan[]
  globalErrors: string[]
}

interface StoryStagingPlan {
  v1Id: string
  title: string
  type: StoryType
  createdAt: Date
  status: 'valid' | 'skipped'
  skipReason?: string
  versions: VersionStagingPlan[]
}

interface VersionStagingPlan {
  v1VersionId: string
  name: string
  filePath: string                          // absolute path to source file
  targetBranch: string                      // 'main' or 'draftX' or custom
  targetFileName: string                    // 'draft.md', 'outline.md', etc.
  action: 'create-branch' | 'commit-to-current'
}
```

### Error Handling

- Validation errors are **collected, not fatal**
- Always output validation errors in final report
- Only fail fast if v1 directory doesn't exist or babel.json is unparseable

---

## Phase 2: Execution

**Input:** `MigrationPlan` from Phase 1, v2 directory path
**Output:** `MigrationReport`

### Process

**1. Initialize v2 state**
- Verify v2 directory exists and is a valid Babel v2 workspace
- Verify git is installed and configured
- Ensure working tree is clean (no uncommitted changes)

**2. For each valid story in the plan:**

**A. Create story record**
- Insert into v2 database:
  ```typescript
  Story {
    id: story.v1Id,           // Preserve v1 ID
    displayName: story.title,
    type: story.type,         // From Phase 1 detection
    createdAt: story.createdAt,
    updatedAt: story.createdAt
  }
  ```
- If insert fails: log error, mark story as ERROR, continue to next

**B. Initialize story git repository**
- Create directory: `v2-directory/stories/{story-id}/`
- Initialize git repo: `git init`
- Create initial commit: `"initial commit"` (empty or placeholder)

**C. Process versions in order**

For each version in story's versions array:

- **Read source file** from `{filePath}` on disk
- **Determine action** (from VersionStagingPlan):

  - **draft.md:**
    - Write to `stories/{story-id}/draft.md`
    - Stage: `git add draft.md`
    - Commit: `"migrate: initialize draft from v1 ({version-name})"`
    - Stay on current branch (main)

  - **outline.md or characters.md:**
    - Write to corresponding filename in current directory
    - Stage: `git add {filename}`
    - Commit: `"migrate: add {filename} from v1"`
    - Stay on current branch

  - **draftX.md (X > 1):**
    - Create new branch: `git checkout -b draftX` (from current HEAD)
    - Overwrite content to `draft.md` in this branch
    - Stage: `git add draft.md`
    - Commit: `"migrate: import draft{X} from v1 ({version-name})"`
    - After commit, checkout back to main

  - **revision.md or translation.md**
    - Create new branch: `git checkout -b {{version-name}}` (from current HEAD)
    - Overwrite content to `draft.md` in this branch
    - Stage: `git add draft.md`
    - Commit: `"migrate: import draft{X} from v1 ({version-name})"`
    - After commit, checkout back to main

  - **Other files (any .md not matching above):**
    - Create new branch: `git checkout -b {filename-without-ext}` (from current HEAD)
    - Write as file with same name: `{filename}.md`
    - Stage: `git add {filename}`
    - Commit: `"migrate: add {filename} from v1"`
    - After commit, checkout back to main

- **If file read/write/git operation fails:**
  - Log error with story id, version id, and operation
  - Continue to next version
  - Track failure count

**D. Create Version records in database**
- For each successfully created branch:
  ```typescript
  Version {
    id: UUID.new(),
    storyId: story.v1Id,
    gitBranch: branchName,
    createdAt: version.createdAt
  }
  ```

**E. Finalize story**
- Verify all files staged and committed
- If any errors occurred, mark story as "created with errors"
- Otherwise mark as "created"

**3. Error handling during execution**
- Wrap each story's processing in try/catch
- If any operation fails: log with full context, continue to next story
- Never abort entire migration due to single story error
- Collect all execution errors for final report

**4. Output MigrationReport**

```typescript
interface MigrationReport {
  timestamp: Date
  v1Source: string
  v2Destination: string
  summary: {
    totalStories: number
    storiesCreated: number
    storiesSkipped: number
    versionsMigrated: number
    gitCommits: number
  }
  storiesProcessed: StoryMigrationResult[]
  validationErrors: string[]
  executionErrors: string[]
}

interface StoryMigrationResult {
  v1Id: string
  title: string
  type: StoryType
  status: 'created' | 'skipped' | 'error'
  versionsCreated?: number
  commitsCreated?: number
  branchesCreated?: string[]
  error?: string
}
```

---

## Data Structures

### MigrationPlan (Phase 1 Output)

```typescript
interface MigrationPlan {
  v1Source: string
  stories: StoryStagingPlan[]
  globalErrors: string[]
}

interface StoryStagingPlan {
  v1Id: string
  title: string
  type: StoryType
  createdAt: Date
  status: 'valid' | 'skipped'
  skipReason?: string
  versions: VersionStagingPlan[]
}

interface VersionStagingPlan {
  v1VersionId: string
  name: string
  filePath: string
  targetBranch: string
  targetFileName: string
  action: 'create-branch' | 'commit-to-current'
}
```

### MigrationReport (Phase 2 Output)

```typescript
interface MigrationReport {
  timestamp: Date
  v1Source: string
  v2Destination: string
  summary: {
    totalStories: number
    storiesCreated: number
    storiesSkipped: number
    versionsMigrated: number
    gitCommits: number
  }
  storiesProcessed: StoryMigrationResult[]
  validationErrors: string[]
  executionErrors: string[]
}

interface StoryMigrationResult {
  v1Id: string
  title: string
  type: StoryType
  status: 'created' | 'skipped' | 'error'
  versionsCreated?: number
  commitsCreated?: number
  branchesCreated?: string[]
  error?: string
}
```

---

## File Organization

```
src/
├── bin/
│   └── migrate-v1-to-v2.ts                  # CLI entry point
├── commands/
│   └── migrationCommand.ts                  # Command orchestration
├── services/
│   ├── migrationValidator.ts                # Phase 1: validation
│   ├── migrationExecutor.ts                 # Phase 2: execution
│   ├── migrationReporter.ts                 # Report generation/formatting
│   └── v1DataLoader.ts                      # Load/parse v1 babel.json
├── utils/
│   ├── storyTypeDetector.ts                 # Word count → type logic
│   └── migrationLogger.ts                   # Structured logging

test/
├── unit/
│   ├── services/
│   │   ├── migrationValidator.test.ts
│   │   ├── migrationExecutor.test.ts
│   │   └── v1DataLoader.test.ts
│   └── utils/
│       └── storyTypeDetector.test.ts
├── integration/
│   └── migrationCommand.integration.test.ts
└── fixtures/
    └── v1-workspace/                        # Sample v1 directory for tests
        ├── babel.json
        └── stories/
            └── {story-id}/
                ├── draft.md
                └── draft2.md
```

---

## Error Handling Strategy

### Validation Phase (Phase 1)

- **Collect ALL errors without stopping** (except fatal errors)
- **Fatal errors (abort immediately):**
  - v1 directory doesn't exist
  - v1 directory is not readable
  - babel.json doesn't exist or can't be parsed
- **Non-fatal errors (collect and continue):**
  - Missing story file
  - Malformed version reference
  - Unreadable story directory
- **Output:** Always produce validation output with errors listed

### Execution Phase (Phase 2)

- **Wrap each story in try/catch** — never abort migration for single story failure
- **If story creation fails:** log full error context, mark as ERROR, continue to next
- **If git operation fails:** log with story id + operation, continue to next version
- **If database insert fails:** same — log and continue
- **Atomic operations:** never partially commit (if a version fails, don't leave partial git state)
- **Working tree recovery:** always ensure clean state before starting next story

### Report Output

- **Always generate and output report** even if there are errors
- **Include both validationErrors and executionErrors** arrays in JSON
- **Console output:** human-readable summary with key metrics
- **JSON output:** structured data for programmatic use
- **Exit code:**
  - 0: at least one story created successfully
  - 1: Phase 1 validation failed OR no stories created
  - 2: unexpected internal error

---

## Edge Cases & Handling

| Case | Handling |
|------|----------|
| v1 story with no draft files | Skip story, log "No draft files found" |
| Missing version file referenced in babel.json | Skip version, log warning, continue to next version |
| Empty story (created at, title, but no files) | Skip story, log "No draft files found" |
| v1 babel.json malformed or missing | Fail Phase 1, exit with code 1 |
| v2 directory doesn't exist | Create it with database initialization |
| v2 directory already has stories | Skip them, migrate only v1 data (don't overwrite) |
| Git operation fails mid-version | Log error, mark story as ERROR, continue to next story |
| Word count < 0 (file parsing error) | Treat as 0 words, assign SHORT_STORY |
| Story with 100+ versions | Process all versions normally (slow but complete) |

---

## Reporting Format

### Console Output (Human-Readable)

```
Babel v1 → v2 Migration Report
==============================

Source:       ~/Documents/BabelTest
Destination:  /home/wes/repos/babel-v2
Timestamp:    2026-04-01 14:23:45 UTC

Summary
-------
Total Stories:      28
Stories Created:    26
Stories Skipped:     2
Versions Migrated:   87
Git Commits:       115

Details
-------
✓ "O Tom Brando da Solidão" (83e7dbac...)
  Type: SHORT_STORY (2638 words)
  Versions: 2 (draft, revision)
  Branches: draft, revision
  Commits: 2

✓ "Experimentos" (b7efce2d...)
  Type: NOVEL (14,250 words)
  Versions: 14 (3-1, 3-2, 4, 5, ...)
  Branches: main, 3-2, 4, 5, ...
  Commits: 14

✗ "Unknown Story" (xxxx...)
  Status: SKIPPED
  Reason: No draft files found

Validation Errors (if any)
--------------------------
[list of non-fatal errors]

Execution Errors (if any)
-------------------------
[list of execution errors with context]

Report saved to: migration-report.json
```

### JSON Output (Machine-Readable)

```json
{
  "timestamp": "2026-04-01T14:23:45.000Z",
  "v1Source": "~/Documents/BabelTest",
  "v2Destination": "/home/wes/repos/babel-v2",
  "summary": {
    "totalStories": 28,
    "storiesCreated": 26,
    "storiesSkipped": 2,
    "versionsMigrated": 87,
    "gitCommits": 115
  },
  "storiesProcessed": [
    {
      "v1Id": "83e7dbac-1aaf-45db-8745-1c89a5f73c65",
      "title": "O Tom Brando da Solidão",
      "type": "short-story",
      "status": "created",
      "versionsCreated": 2,
      "commitsCreated": 2,
      "branchesCreated": ["draft", "revision"]
    },
    ...
  ],
  "validationErrors": [],
  "executionErrors": []
}
```

---

## Testing Strategy

### Unit Tests

1. **storyTypeDetector.test.ts**
   - Verify word count boundaries (< 10k, 10k-50k, > 50k)
   - Edge cases: 9999, 10000, 50000, 50001 words
   - File parsing errors (corrupted file, unreadable)

2. **migrationValidator.test.ts**
   - Missing draft.md → story skipped
   - Multiple draftX.md files → all detected
   - Valid babel.json parsing
   - Malformed babel.json → error collected
   - Missing story directory → story skipped

3. **v1DataLoader.test.ts**
   - Parse valid babel.json
   - Handle malformed JSON
   - Handle missing versions array
   - Handle circular references (if any)

4. **migrationExecutor.test.ts**
   - Create story record in database
   - Initialize git repo for story
   - Create branches correctly
   - Commit with correct messages
   - Handle git operation failures gracefully

5. **migrationCommand.test.ts**
   - CLI argument parsing
   - Dry-run mode (no writes)
   - Report generation

### Integration Tests

1. **Full migration flow**
   - Use fixture v1 workspace (5-10 test stories)
   - Run full Phase 1 + Phase 2
   - Verify all stories, branches, commits created
   - Verify report accuracy

2. **Error scenarios**
   - Missing files → skipped in report
   - Git operation failure → continues to next story
   - Corrupt v1 data → validation errors collected

### Test Fixtures

```
test/fixtures/v1-workspace/
├── babel.json                           # Sample v1 data
└── stories/
    ├── {short-story-id}/
    │   └── draft.md                     # 5k words
    ├── {novella-id}/
    │   ├── draft.md                     # 25k words
    │   └── draft2.md                    # 25k words
    └── {novel-id}/
        ├── draft.md                     # 75k words
        ├── draft2.md                    # 75k words
        └── characters.md
```

---

## Dependencies

- **simple-git:** Git operations (already in project)
- **Zod or similar:** Schema validation for babel.json
- **Commander or Yargs:** CLI argument parsing
- **Existing:** Database, repositories, logger

---

## Success Criteria

- ✅ All v1 stories migrated to v2 database
- ✅ All versions become git branches with proper commits
- ✅ Story types correctly detected by word count
- ✅ v1 timestamps preserved in v2 database
- ✅ Detailed report generated (console + JSON)
- ✅ Errors handled gracefully (no aborts, continue to next story)
- ✅ 80%+ test coverage

---

## Out of Scope

- **Essays:** Story type detection ignores essay classification (deferred to Phase 4+)
- **Backup/activity data:** v1 backup and activity sections ignored (not migrated)
- **submission history:** Ignored for now
- **VSCode UI integration:** This is a standalone CLI, not a command
- **Re-migration:** One-time setup; subsequent updates not supported

---

## Next Steps

1. User reviews this design doc
2. Implementation plan created (writing-plans skill)
3. Phase 1 + 2 implementation via TDD
4. Integration tests with real v1 fixture data
5. Manual testing against live v1 workspace

