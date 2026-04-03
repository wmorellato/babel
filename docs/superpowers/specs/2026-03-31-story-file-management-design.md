# Story File Management Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable writers to add and delete story files (chapters, scenes, research notes) directly from the VSCode UI without manually creating files in the story folder.

**Architecture:** Introduce a `StoryFileService` to encapsulate file creation and deletion with Git integration. Three new commands (`AddFileCommand`, `AddChapterCommand`, `DeleteFileCommand`) provide UI entry points with context-sensitive menus in the story tree view. Commands delegate to the service for filesystem and Git operations.

**Tech Stack:** VSCode API (prompts, tree view), existing GitRepository, Node.js filesystem APIs

---

## System Overview

### Components

**StoryFileService** (`src/services/storyFileService.ts`)
- Encapsulates file creation and deletion operations
- Manages Git commits after file operations
- Provides validation and error handling
- Dependency: GitRepository, filesystem access

**AddFileCommand** (`src/core/commands/addFileCommand.ts`)
- Prompts user for filename (empty markdown file)
- Validates input, delegates to StoryFileService
- Refreshes tree view on success
- Context: Story item in tree view

**AddChapterCommand** (`src/core/commands/addChapterCommand.ts`)
- Available only for Novels and Novellas
- Detects story type from database
- Scans folder to count existing chapters
- Prompts user with suggested next chapter name
- Delegates creation to StoryFileService
- Opens file in editor after creation
- Context: Story item in tree view

**DeleteFileCommand** (`src/core/commands/deleteFileCommand.ts`)
- Shows confirmation dialog before deletion
- Delegates to StoryFileService
- Refreshes tree view on success
- Context: File item in tree view

### Data Flow

#### Add File Flow
```
User right-clicks story → "Add File"
    ↓
AddFileCommand prompts for filename
    ↓
Validate: not empty, no invalid chars, .md extension, doesn't exist
    ↓
StoryFileService.createFile(storyId, fileName)
    ├─ Create empty file in story folder
    ├─ Commit to Git: "feat: add file {filename}.md"
    └─ Return success or error
    ↓
Command refreshes tree view
    ↓
File appears in tree, opens in editor
```

#### Add Chapter Flow
```
User right-clicks story → "Add Chapter" (only for Novel/Novella)
    ↓
AddChapterCommand detects story type
    ↓
StoryFileService.getChapterCount(storyId) scans folder
    ↓
Command prompts: "Chapter name?" with suggestion "Chapter N+1"
    ↓
User enters custom name (e.g., "Epilogue", "Chapter 5", "Intermission")
    ↓
StoryFileService.createChapter(storyId, chapterName)
    ├─ Convert to filename: lowercase, spaces→hyphen, add .md
    ├─ Create file with markdown heading matching user input
    ├─ Commit to Git: "feat: add chapter {name}"
    └─ Return file path
    ↓
Command refreshes tree view
    ↓
File appears in tree, opens in editor
```

#### Delete File Flow
```
User right-clicks file → "Delete File"
    ↓
DeleteFileCommand shows confirmation: "Delete {filename}? This will be committed to Git."
    ↓
User confirms or cancels
    ↓
StoryFileService.deleteFile(storyId, filePath)
    ├─ Delete file from disk
    ├─ Commit to Git: "refactor: remove file {filename}.md"
    └─ Return success or error
    ↓
Command refreshes tree view
    ↓
File disappears from tree
```

### User Interface

#### Context Menu Entries (package.json)

**Add File Command:**
- Trigger: `babel.addFile`
- Title: "Add File to Story"
- Context: `when: viewItem == babelStory`
- Group: `1_modification` (same as "Rename Story", "Create Version")
- No icon (menu item, not inline)

**Add Chapter Command:**
- Trigger: `babel.addChapter`
- Title: "Add Chapter"
- Context: `when: viewItem == babelStory && resource == novel|novella`
- Group: `1_modification`
- No icon
- Note: Only visible for stories with type = Novel or Novella

**Delete File Command:**
- Trigger: `babel.deleteFile`
- Title: "Delete File"
- Context: `when: viewItem == babelFile`
- Group: `2_deletion`
- No icon

---

## Service: StoryFileService

### Responsibilities
- File creation with validation
- File deletion with confirmation
- Git commit integration
- Error handling and reporting
- Chapter detection and naming

### Method Signatures

```typescript
interface IStoryFileService {
  /**
   * Create empty markdown file in story folder
   * Commits to Git after creation
   * @throws {FileError} if file exists, invalid filename, or disk error
   */
  createFile(storyId: string, fileName: string): Promise<{ filePath: string }>

  /**
   * Create chapter file with markdown heading
   * Auto-detects next chapter number if using "Chapter N" pattern
   * @param chapterName User-friendly name (e.g., "Chapter 5", "Epilogue")
   * @throws {FileError} if creation or commit fails
   */
  createChapter(storyId: string, chapterName: string): Promise<{ filePath: string }>

  /**
   * Delete file from disk and commit deletion
   * @throws {FileError} if file not found or commit fails
   */
  deleteFile(storyId: string, filePath: string): Promise<void>

  /**
   * Count existing chapter files matching chapter*.md pattern
   * @returns number of chapters found
   */
  getChapterCount(storyId: string): Promise<number>

  /**
   * Check if file exists in story folder
   * @returns true if file exists
   */
  fileExists(storyId: string, fileName: string): Promise<boolean>
}
```

### Validation Rules

**Filename Validation (createFile):**
- Must not be empty
- Must end with `.md`
- Cannot contain invalid characters: `< > : " / \ | ? *`
- Must not already exist in story folder
- Example valid names: `research.md`, `scene2.md`, `character-notes.md`

**Chapter Validation (createChapter):**
- User provides friendly name (e.g., "Chapter 5", "Epilogue", "Intermission")
- Service converts to filename:
  - Lowercase: "Chapter 5" → "chapter 5"
  - Replace spaces with hyphens: "chapter 5" → "chapter-5"
  - Add `.md`: "chapter-5.md"
- File must not already exist
- Example: User inputs "Epilogue" → creates "epilogue.md"

**Deletion Validation (deleteFile):**
- File must exist at given path
- File must be within the story folder (security check)

### Error Handling

| Scenario | Error Type | User Message |
|----------|-----------|--------------|
| Filename empty | ValidationError | "Filename cannot be empty" |
| Invalid characters | ValidationError | "Filename contains invalid characters: < > : \" / \ \| ? *" |
| File already exists | FileError | "File '{filename}' already exists in this story" |
| Missing .md extension | ValidationError | "Filename must end with .md" |
| Disk full / permission denied | FileError | "Failed to create file: {OS error reason}" |
| Git commit fails | GitError | "File created but Git commit failed: {reason}" |
| File not found on delete | FileError | "File not found: {filePath}" |
| Delete outside story folder | SecurityError | "Cannot delete files outside story folder" |

All errors are logged and reported to user via VSCode notification (error, not info).

### Git Commits

**Add File:**
```
feat: add file <filename>.md
```

**Add Chapter:**
```
feat: add chapter <chapter-name>
```

**Delete File:**
```
refactor: remove file <filename>.md
```

All commits follow existing conventions (feature/refactor prefix, lowercase names).

---

## Commands

### AddFileCommand

**Class:** `AddFileCommand extends CommandHandler`
**Location:** `src/core/commands/addFileCommand.ts`

**Behavior:**
1. Get active story from context (passed as argument from tree click)
2. Prompt user: "File name (including .md)?"
3. Validate input
4. Call `storyFileService.createFile(storyId, fileName)`
5. Refresh tree view
6. Open file in editor
7. Show success notification (optional: "File created")

**Error Handling:**
- Validation errors: Show error notification, allow retry
- File system errors: Show error notification, suggest checking disk space
- User cancels: Silent exit (no notification)

**Registration:**
- Invoke in `extension.ts` with GitRepository dependency
- Register command handler in `CommandRegistry`

### AddChapterCommand

**Class:** `AddChapterCommand extends CommandHandler`
**Location:** `src/core/commands/addChapterCommand.ts`

**Behavior:**
1. Get story from context and verify type (Novel or Novella)
2. Call `storyFileService.getChapterCount(storyId)` to find next chapter number
3. Suggest chapter name: "Chapter {count+1}"
4. Prompt user: "Chapter name?" with suggested value
5. Call `storyFileService.createChapter(storyId, userInput)`
6. Refresh tree view
7. Open file in editor
8. Show success notification (optional: "Chapter created")

**Prerequisites:**
- Story type must be Novel or Novella (checked in command condition)

**Error Handling:**
- Same as AddFileCommand
- If chapter count fails, show error and exit

**Registration:**
- Same as AddFileCommand

### DeleteFileCommand

**Class:** `DeleteFileCommand extends CommandHandler`
**Location:** `src/core/commands/deleteFileCommand.ts`

**Behavior:**
1. Get file path and name from context
2. Show confirmation dialog: "Delete '{filename}'? This will be committed to Git."
3. If user confirms:
   - Call `storyFileService.deleteFile(storyId, filePath)`
   - Refresh tree view
   - Show success notification (optional: "File deleted")
4. If user cancels: Silent exit

**Error Handling:**
- Same as other commands
- File not found: Show error, refresh tree anyway

**Registration:**
- Same as other commands

---

## Tree View Updates

**StoryTreeItem (existing):**
- No changes — Add File/Add Chapter commands appear in context menu

**FileTreeItem (existing):**
- No changes — Delete File command appears in context menu

**StoryTreeDataProvider (existing):**
- Enhance `refresh()` call in command completion to redraw file list
- No structural changes

---

## Testing Strategy

**Unit Tests:**

`test/unit/services/storyFileService.test.ts`
- ✓ createFile: empty filename, invalid characters, already exists, success
- ✓ createFile: commits to Git with correct message
- ✓ createChapter: detects next chapter, converts name to filename, success
- ✓ createChapter: existing chapter count edge cases
- ✓ deleteFile: file not found, success, commits to Git
- ✓ getChapterCount: counts chapter*.md files correctly
- ✓ fileExists: returns true/false appropriately
- Mock: GitRepository, filesystem (via memfs or custom mock)

**Integration Tests:**

`test/integration/commands/storyFileManagement.test.ts`
- ✓ AddFileCommand: creates file, opens in editor, refreshes tree
- ✓ AddChapterCommand: prompts with suggestion, creates with heading, refreshes
- ✓ DeleteFileCommand: confirms before deleting, refreshes tree
- ✓ Multiple commands in sequence (add file, add chapter, delete)
- Uses real database, real filesystem (temp folder)

**Target Coverage:** 80%+

---

## Dependencies

**New:**
- StoryFileService (creates, deletes files)

**Existing (reuse):**
- GitRepository (for commits)
- StoryRepository (for story type lookup)
- Logger (for error logging)
- CommandHandler base class (for command structure)

**From VSCode API:**
- `vscode.window.showInputBox()` for filename/chapter name prompts
- `vscode.window.showWarningMessage()` with confirmation for deletion
- `vscode.window.showErrorMessage()` for error notifications
- `vscode.window.showTextDocument()` to open file after creation

---

## Future Considerations

- Bulk file operations (create multiple chapters at once)
- File templates (different boilerplate for different file types)
- Renaming files without Git reflog complexity
- Batch delete with multi-select
- File metadata (creation date, word count tracking per file)

---

## Success Criteria

- ✓ Writers can add arbitrary markdown files to a story without using File Explorer
- ✓ Writers can add chapters to Novels/Novellas with auto-numbering suggestion
- ✓ Writers can delete files with confirmation to prevent accidents
- ✓ All operations commit to Git with semantic commit messages
- ✓ Tree view refreshes immediately after operations
- ✓ All commands appear in correct context menu locations
- ✓ 80%+ test coverage
- ✓ No breaking changes to existing commands or data structures
