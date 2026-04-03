# Story File Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement story file management commands (Add File, Add Chapter, Delete File) with a backing StoryFileService that handles file operations and Git integration.

**Architecture:** StoryFileService encapsulates file I/O and Git commits. Three command handlers (AddFileCommand, AddChapterCommand, DeleteFileCommand) provide UI entry points with context-sensitive menus. All changes follow TDD with 80%+ test coverage.

**Tech Stack:** VSCode API (prompts, dialogs), Node.js fs module, existing GitRepository and StoryRepository

---

### Task 1: StoryFileService - Core Implementation

**Files:**
- Create: `src/services/storyFileService.ts`
- Modify: `src/utils/errorHandler.ts` (add FileError class if needed)

- [ ] **Step 1: Write unit test file for storyFileService**

Create `test/unit/services/storyFileService.test.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import { StoryFileService } from '../../../src/services/storyFileService';
import { GitRepository } from '../../../src/git/gitRepository';
import { BabelError } from '../../../src/utils/errorHandler';

// Mock GitRepository
const mockGitRepository: Partial<GitRepository> = {
  commit: jest.fn().mockResolvedValue(undefined),
};

describe('StoryFileService', () => {
  let service: StoryFileService;
  let tempDir: string;
  let storyDir: string;

  beforeEach(() => {
    tempDir = path.join(__dirname, 'temp-' + Date.now());
    storyDir = path.join(tempDir, 'story-id');
    fs.mkdirSync(storyDir, { recursive: true });

    service = new StoryFileService(
      mockGitRepository as GitRepository,
      tempDir
    );

    jest.clearAllMocks();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('fileExists', () => {
    it('returns true if file exists', async () => {
      fs.writeFileSync(path.join(storyDir, 'test.md'), 'content');
      const exists = await service.fileExists('story-id', 'test.md');
      expect(exists).toBe(true);
    });

    it('returns false if file does not exist', async () => {
      const exists = await service.fileExists('story-id', 'nonexistent.md');
      expect(exists).toBe(false);
    });
  });

  describe('createFile', () => {
    it('creates empty markdown file', async () => {
      const result = await service.createFile('story-id', 'test.md');
      const filePath = path.join(storyDir, 'test.md');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('');
      expect(result.filePath).toBe(filePath);
    });

    it('commits to Git after creation', async () => {
      await service.createFile('story-id', 'research.md');
      expect(mockGitRepository.commit).toHaveBeenCalledWith(
        'feat: add file research.md',
        expect.anything()
      );
    });

    it('throws error if filename is empty', async () => {
      await expect(service.createFile('story-id', '')).rejects.toThrow(
        'Filename cannot be empty'
      );
    });

    it('throws error if filename lacks .md extension', async () => {
      await expect(service.createFile('story-id', 'test.txt')).rejects.toThrow(
        'Filename must end with .md'
      );
    });

    it('throws error if filename contains invalid characters', async () => {
      await expect(service.createFile('story-id', 'test<>.md')).rejects.toThrow(
        'Filename contains invalid characters'
      );
    });

    it('throws error if file already exists', async () => {
      fs.writeFileSync(path.join(storyDir, 'existing.md'), 'content');
      await expect(service.createFile('story-id', 'existing.md')).rejects.toThrow(
        "File 'existing.md' already exists in this story"
      );
    });
  });

  describe('getChapterCount', () => {
    it('returns 0 if no chapters exist', async () => {
      const count = await service.getChapterCount('story-id');
      expect(count).toBe(0);
    });

    it('counts chapter files matching chapter*.md pattern', async () => {
      fs.writeFileSync(path.join(storyDir, 'chapter1.md'), '');
      fs.writeFileSync(path.join(storyDir, 'chapter2.md'), '');
      fs.writeFileSync(path.join(storyDir, 'chapter3.md'), '');
      fs.writeFileSync(path.join(storyDir, 'story.md'), ''); // Should not count

      const count = await service.getChapterCount('story-id');
      expect(count).toBe(3);
    });

    it('handles numeric chapters in any order', async () => {
      fs.writeFileSync(path.join(storyDir, 'chapter5.md'), '');
      fs.writeFileSync(path.join(storyDir, 'chapter10.md'), '');
      fs.writeFileSync(path.join(storyDir, 'chapter2.md'), '');

      const count = await service.getChapterCount('story-id');
      expect(count).toBe(3);
    });
  });

  describe('createChapter', () => {
    it('creates chapter file with markdown heading', async () => {
      const result = await service.createChapter('story-id', 'Chapter 1');
      const filePath = path.join(storyDir, 'chapter-1.md');
      expect(fs.existsSync(filePath)).toBe(true);

      const content = fs.readFileSync(filePath, 'utf-8');
      expect(content).toBe('# Chapter 1\n');
      expect(result.filePath).toBe(filePath);
    });

    it('converts chapter name to lowercase filename with hyphens', async () => {
      await service.createChapter('story-id', 'Chapter Five');
      expect(fs.existsSync(path.join(storyDir, 'chapter-five.md'))).toBe(true);
    });

    it('converts spaces to hyphens', async () => {
      await service.createChapter('story-id', 'The Epilogue');
      expect(fs.existsSync(path.join(storyDir, 'the-epilogue.md'))).toBe(true);
    });

    it('commits to Git with chapter name', async () => {
      await service.createChapter('story-id', 'Epilogue');
      expect(mockGitRepository.commit).toHaveBeenCalledWith(
        'feat: add chapter Epilogue',
        expect.anything()
      );
    });

    it('throws error if chapter already exists', async () => {
      fs.writeFileSync(path.join(storyDir, 'epilogue.md'), '');
      await expect(service.createChapter('story-id', 'Epilogue')).rejects.toThrow(
        "File 'epilogue.md' already exists in this story"
      );
    });
  });

  describe('deleteFile', () => {
    it('deletes file from disk', async () => {
      const filePath = path.join(storyDir, 'test.md');
      fs.writeFileSync(filePath, 'content');

      await service.deleteFile('story-id', filePath);
      expect(fs.existsSync(filePath)).toBe(false);
    });

    it('commits to Git after deletion', async () => {
      const filePath = path.join(storyDir, 'test.md');
      fs.writeFileSync(filePath, 'content');

      await service.deleteFile('story-id', filePath);
      expect(mockGitRepository.commit).toHaveBeenCalledWith(
        'refactor: remove file test.md',
        expect.anything()
      );
    });

    it('throws error if file does not exist', async () => {
      const filePath = path.join(storyDir, 'nonexistent.md');
      await expect(service.deleteFile('story-id', filePath)).rejects.toThrow(
        'File not found'
      );
    });

    it('throws error if file is outside story folder', async () => {
      const outsidePath = path.join(tempDir, 'outside.md');
      await expect(service.deleteFile('story-id', outsidePath)).rejects.toThrow(
        'Cannot delete files outside story folder'
      );
    });
  });
});
```

- [ ] **Step 2: Run test to verify all fail**

```bash
npm test -- test/unit/services/storyFileService.test.ts
```

Expected: All tests FAIL with "Cannot find module" or similar

- [ ] **Step 3: Write minimal implementation**

Create `src/services/storyFileService.ts`:

```typescript
/**
 * Story File Service
 * Handles file creation and deletion with Git integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { GitRepository } from '../git/gitRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('StoryFileService');

const INVALID_FILENAME_CHARS = /[<>:"\\/|?*]/;
const CHAPTER_PATTERN = /^chapter\d+\.md$/i;

export class StoryFileService {
  constructor(
    private gitRepository: GitRepository,
    private workspaceRoot: string
  ) {}

  /**
   * Check if file exists in story folder
   */
  async fileExists(storyId: string, fileName: string): Promise<boolean> {
    const filePath = path.join(this.workspaceRoot, storyId, fileName);
    return fs.existsSync(filePath);
  }

  /**
   * Create empty markdown file in story folder
   * @throws Error if validation fails or file operation fails
   */
  async createFile(
    storyId: string,
    fileName: string
  ): Promise<{ filePath: string }> {
    // Validate filename
    if (!fileName || fileName.trim().length === 0) {
      throw new Error('Filename cannot be empty');
    }

    if (!fileName.endsWith('.md')) {
      throw new Error('Filename must end with .md');
    }

    if (INVALID_FILENAME_CHARS.test(fileName)) {
      throw new Error('Filename contains invalid characters');
    }

    const storyPath = path.join(this.workspaceRoot, storyId);
    const filePath = path.join(storyPath, fileName);

    // Check if already exists
    if (await this.fileExists(storyId, fileName)) {
      throw new Error(`File '${fileName}' already exists in this story`);
    }

    // Create file
    try {
      fs.writeFileSync(filePath, '');
      logger.debug(`Created file: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create file: ${message}`);
      throw new Error(`Failed to create file: ${message}`);
    }

    // Commit to Git
    try {
      await this.gitRepository.commit(`feat: add file ${fileName}`, [filePath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Git commit failed: ${message}`);
      throw new Error(`File created but Git commit failed: ${message}`);
    }

    return { filePath };
  }

  /**
   * Get count of existing chapter files
   */
  async getChapterCount(storyId: string): Promise<number> {
    const storyPath = path.join(this.workspaceRoot, storyId);

    if (!fs.existsSync(storyPath)) {
      return 0;
    }

    try {
      const files = fs.readdirSync(storyPath);
      const chapterCount = files.filter((f) => CHAPTER_PATTERN.test(f)).length;
      return chapterCount;
    } catch (error) {
      logger.error(`Failed to count chapters: ${error}`);
      return 0;
    }
  }

  /**
   * Create chapter file with markdown heading
   * Converts user-friendly name to filename (lowercase, spaces→hyphens)
   * @throws Error if validation fails or file operation fails
   */
  async createChapter(
    storyId: string,
    chapterName: string
  ): Promise<{ filePath: string }> {
    // Convert name to filename
    const fileName = chapterName
      .toLowerCase()
      .replace(/\s+/g, '-')
      .concat('.md');

    const storyPath = path.join(this.workspaceRoot, storyId);
    const filePath = path.join(storyPath, fileName);

    // Check if already exists
    if (await this.fileExists(storyId, fileName)) {
      throw new Error(`File '${fileName}' already exists in this story`);
    }

    // Create file with markdown heading
    const content = `# ${chapterName}\n`;

    try {
      fs.writeFileSync(filePath, content);
      logger.debug(`Created chapter: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create chapter: ${message}`);
      throw new Error(`Failed to create chapter: ${message}`);
    }

    // Commit to Git
    try {
      await this.gitRepository.commit(`feat: add chapter ${chapterName}`, [filePath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Git commit failed: ${message}`);
      throw new Error(`Chapter created but Git commit failed: ${message}`);
    }

    return { filePath };
  }

  /**
   * Delete file from disk and commit deletion
   * @throws Error if file not found, outside story folder, or commit fails
   */
  async deleteFile(storyId: string, filePath: string): Promise<void> {
    const storyPath = path.join(this.workspaceRoot, storyId);

    // Security check: ensure file is within story folder
    const normalizedFilePath = path.normalize(filePath);
    const normalizedStoryPath = path.normalize(storyPath);

    if (!normalizedFilePath.startsWith(normalizedStoryPath)) {
      throw new Error('Cannot delete files outside story folder');
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error('File not found');
    }

    // Delete file
    try {
      fs.unlinkSync(filePath);
      logger.debug(`Deleted file: ${filePath}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete file: ${message}`);
      throw new Error(`Failed to delete file: ${message}`);
    }

    // Extract filename for commit message
    const fileName = path.basename(filePath);

    // Commit to Git
    try {
      await this.gitRepository.commit(`refactor: remove file ${fileName}`, [filePath]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Git commit failed: ${message}`);
      throw new Error(`File deleted but Git commit failed: ${message}`);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/services/storyFileService.test.ts
```

Expected: All tests PASS (19/19)

- [ ] **Step 5: Commit**

```bash
git add src/services/storyFileService.ts test/unit/services/storyFileService.test.ts
git commit -m "feat: implement StoryFileService with file creation and deletion"
```

---

### Task 2: AddFileCommand Implementation

**Files:**
- Create: `src/core/commands/addFileCommand.ts`

- [ ] **Step 1: Write unit test**

Create test in `test/unit/core/commands/addFileCommand.test.ts`:

```typescript
import * as vscode from 'vscode';
import { AddFileCommand } from '../../../src/core/commands/addFileCommand';
import { StoryFileService } from '../../../src/services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../../src/views/storyTreeDataProvider';

const mockStoryFileService = {
  createFile: jest.fn(),
};

const mockTreeDataProvider = {
  refresh: jest.fn(),
};

const mockVscodeWindow = {
  showInputBox: jest.fn(),
  showErrorMessage: jest.fn(),
  showTextDocument: jest.fn(),
  activeTextEditor: null,
};

describe('AddFileCommand', () => {
  let command: AddFileCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    command = new AddFileCommand(
      mockStoryFileService as any,
      mockTreeDataProvider as any,
      mockVscodeWindow as any
    );
  });

  it('prompts user for filename', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockVscodeWindow.showInputBox).toHaveBeenCalledWith({
      prompt: 'File name (including .md)?',
      validateInput: expect.any(Function),
    });
  });

  it('creates file with provided name', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockStoryFileService.createFile).toHaveBeenCalledWith('story-id', 'test.md');
  });

  it('refreshes tree view on success', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('opens file in editor on success', async () => {
    mockStoryFileService.createFile.mockResolvedValue({ filePath: '/path/test.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('test.md');

    await command.execute('story-id');

    expect(mockVscodeWindow.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/path/test.md' })
    );
  });

  it('shows error on validation failure', async () => {
    mockStoryFileService.createFile.mockRejectedValue(
      new Error('Filename cannot be empty')
    );
    mockVscodeWindow.showInputBox.mockResolvedValue('');

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('Filename cannot be empty')
    );
  });

  it('handles user cancellation silently', async () => {
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    await command.execute('story-id');

    expect(mockStoryFileService.createFile).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/unit/core/commands/addFileCommand.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement AddFileCommand**

Create `src/core/commands/addFileCommand.ts`:

```typescript
/**
 * Add File Command
 * Prompts user for filename and creates it in story folder
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { Logger } from '../../utils/logger';

const logger = new Logger('AddFileCommand');

export class AddFileCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('AddFileCommand');
  }

  async execute(storyId: string): Promise<CommandResult> {
    try {
      // Prompt for filename
      const fileName = await this.vscodeWindow.showInputBox({
        prompt: 'File name (including .md)?',
        validateInput: (value: string) => this.validateFileName(value),
      });

      // User cancelled
      if (fileName === undefined) {
        return { success: true, message: 'Cancelled' };
      }

      // Create file
      const result = await this.storyFileService.createFile(storyId, fileName);

      // Refresh tree view
      this.treeDataProvider.refresh();

      // Open file in editor
      const fileUri = vscode.Uri.file(result.filePath);
      await this.vscodeWindow.showTextDocument(fileUri);

      logger.info(`File created: ${fileName}`);

      return {
        success: true,
        message: `File '${fileName}' created`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create file: ${message}`);

      await this.vscodeWindow.showErrorMessage(
        `Failed to create file: ${message}`
      );

      return {
        success: false,
        message: `Failed to create file: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }

  private validateFileName(value: string): string | undefined {
    if (!value || value.trim().length === 0) {
      return 'Filename cannot be empty';
    }

    if (!value.endsWith('.md')) {
      return 'Filename must end with .md';
    }

    if (/[<>:"\\/|?*]/.test(value)) {
      return 'Filename contains invalid characters: < > : " / \\ | ? *';
    }

    return undefined;
  }

  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.addFile',
      async (storyItem: any) => {
        const command = new AddFileCommand(storyFileService, treeDataProvider);
        return command.execute(storyItem.storyId);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('AddFileCommand registered');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/core/commands/addFileCommand.test.ts
```

Expected: All tests PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/core/commands/addFileCommand.ts test/unit/core/commands/addFileCommand.test.ts
git commit -m "feat: implement AddFileCommand"
```

---

### Task 3: AddChapterCommand Implementation

**Files:**
- Create: `src/core/commands/addChapterCommand.ts`

- [ ] **Step 1: Write unit test**

Create test in `test/unit/core/commands/addChapterCommand.test.ts`:

```typescript
import * as vscode from 'vscode';
import { AddChapterCommand } from '../../../src/core/commands/addChapterCommand';
import { StoryFileService } from '../../../src/services/storyFileService';
import { StoryRepository } from '../../../src/db/storyRepository';
import { BabelStoriesTreeDataProvider } from '../../../src/views/storyTreeDataProvider';
import { StoryType } from '../../../src/types';

const mockStoryFileService = {
  getChapterCount: jest.fn(),
  createChapter: jest.fn(),
};

const mockStoryRepository = {
  findById: jest.fn(),
};

const mockTreeDataProvider = {
  refresh: jest.fn(),
};

const mockVscodeWindow = {
  showInputBox: jest.fn(),
  showErrorMessage: jest.fn(),
  showTextDocument: jest.fn(),
};

describe('AddChapterCommand', () => {
  let command: AddChapterCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    command = new AddChapterCommand(
      mockStoryFileService as any,
      mockStoryRepository as any,
      mockTreeDataProvider as any,
      mockVscodeWindow as any
    );
  });

  it('gets chapter count and suggests next chapter', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL });
    mockStoryFileService.getChapterCount.mockResolvedValue(3);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-4.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 4');

    await command.execute('story-id');

    expect(mockStoryFileService.getChapterCount).toHaveBeenCalledWith('story-id');
    expect(mockVscodeWindow.showInputBox).toHaveBeenCalledWith({
      prompt: 'Chapter name?',
      value: 'Chapter 4',
      validateInput: expect.any(Function),
    });
  });

  it('creates chapter with user input', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVELLA });
    mockStoryFileService.getChapterCount.mockResolvedValue(1);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/epilogue.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Epilogue');

    await command.execute('story-id');

    expect(mockStoryFileService.createChapter).toHaveBeenCalledWith('story-id', 'Epilogue');
  });

  it('refreshes tree view on success', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL });
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('opens file in editor on success', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL });
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockStoryFileService.createChapter.mockResolvedValue({ filePath: '/path/chapter-1.md' });
    mockVscodeWindow.showInputBox.mockResolvedValue('Chapter 1');

    await command.execute('story-id');

    expect(mockVscodeWindow.showTextDocument).toHaveBeenCalledWith(
      expect.objectContaining({ fsPath: '/path/chapter-1.md' })
    );
  });

  it('handles user cancellation silently', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.NOVEL });
    mockStoryFileService.getChapterCount.mockResolvedValue(0);
    mockVscodeWindow.showInputBox.mockResolvedValue(undefined);

    await command.execute('story-id');

    expect(mockStoryFileService.createChapter).not.toHaveBeenCalled();
  });

  it('shows error if story type is not Novel or Novella', async () => {
    mockStoryRepository.findById.mockReturnValue({ type: StoryType.SHORT_STORY });

    await command.execute('story-id');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('only available for Novels and Novellas')
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/unit/core/commands/addChapterCommand.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement AddChapterCommand**

Create `src/core/commands/addChapterCommand.ts`:

```typescript
/**
 * Add Chapter Command
 * Creates a new chapter for Novel or Novella stories
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { StoryRepository } from '../../db/storyRepository';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { StoryType } from '../../types';
import { Logger } from '../../utils/logger';

const logger = new Logger('AddChapterCommand');

export class AddChapterCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private storyRepository: StoryRepository,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('AddChapterCommand');
  }

  async execute(storyId: string): Promise<CommandResult> {
    try {
      // Verify story type
      const story = this.storyRepository.findById(storyId);
      if (!story) {
        throw new Error('Story not found');
      }

      if (story.type !== StoryType.NOVEL && story.type !== StoryType.NOVELLA) {
        await this.vscodeWindow.showErrorMessage(
          'Add Chapter is only available for Novels and Novellas'
        );
        return {
          success: false,
          message: 'Add Chapter only available for Novels and Novellas',
        };
      }

      // Get chapter count
      const chapterCount = await this.storyFileService.getChapterCount(storyId);
      const suggestedName = `Chapter ${chapterCount + 1}`;

      // Prompt for chapter name
      const chapterName = await this.vscodeWindow.showInputBox({
        prompt: 'Chapter name?',
        value: suggestedName,
        validateInput: (value: string) => this.validateChapterName(value),
      });

      // User cancelled
      if (chapterName === undefined) {
        return { success: true, message: 'Cancelled' };
      }

      // Create chapter
      const result = await this.storyFileService.createChapter(storyId, chapterName);

      // Refresh tree view
      this.treeDataProvider.refresh();

      // Open file in editor
      const fileUri = vscode.Uri.file(result.filePath);
      await this.vscodeWindow.showTextDocument(fileUri);

      logger.info(`Chapter created: ${chapterName}`);

      return {
        success: true,
        message: `Chapter '${chapterName}' created`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to create chapter: ${message}`);

      await this.vscodeWindow.showErrorMessage(
        `Failed to create chapter: ${message}`
      );

      return {
        success: false,
        message: `Failed to create chapter: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }

  private validateChapterName(value: string): string | undefined {
    if (!value || value.trim().length === 0) {
      return 'Chapter name cannot be empty';
    }
    return undefined;
  }

  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    storyRepository: StoryRepository,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.addChapter',
      async (storyItem: any) => {
        const command = new AddChapterCommand(
          storyFileService,
          storyRepository,
          treeDataProvider
        );
        return command.execute(storyItem.storyId);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('AddChapterCommand registered');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/core/commands/addChapterCommand.test.ts
```

Expected: All tests PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/core/commands/addChapterCommand.ts test/unit/core/commands/addChapterCommand.test.ts
git commit -m "feat: implement AddChapterCommand"
```

---

### Task 4: DeleteFileCommand Implementation

**Files:**
- Create: `src/core/commands/deleteFileCommand.ts`

- [ ] **Step 1: Write unit test**

Create test in `test/unit/core/commands/deleteFileCommand.test.ts`:

```typescript
import * as vscode from 'vscode';
import { DeleteFileCommand } from '../../../src/core/commands/deleteFileCommand';
import { StoryFileService } from '../../../src/services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../../src/views/storyTreeDataProvider';

const mockStoryFileService = {
  deleteFile: jest.fn(),
};

const mockTreeDataProvider = {
  refresh: jest.fn(),
};

const mockVscodeWindow = {
  showWarningMessage: jest.fn(),
  showErrorMessage: jest.fn(),
};

describe('DeleteFileCommand', () => {
  let command: DeleteFileCommand;

  beforeEach(() => {
    jest.clearAllMocks();
    command = new DeleteFileCommand(
      mockStoryFileService as any,
      mockTreeDataProvider as any,
      mockVscodeWindow as any
    );
  });

  it('shows confirmation dialog with filename', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');

    await command.execute('story-id', '/path/test.md');

    expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('test.md'),
      expect.any(String)
    );
  });

  it('deletes file when user confirms', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockStoryFileService.deleteFile).toHaveBeenCalledWith(
      'story-id',
      '/path/test.md'
    );
  });

  it('refreshes tree view after deletion', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });

  it('cancels silently when user declines', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue(undefined);

    await command.execute('story-id', '/path/test.md');

    expect(mockStoryFileService.deleteFile).not.toHaveBeenCalled();
  });

  it('shows error message on deletion failure', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockRejectedValue(new Error('File not found'));

    await command.execute('story-id', '/path/test.md');

    expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
      expect.stringContaining('File not found')
    );
  });

  it('refreshes tree anyway on deletion failure', async () => {
    mockVscodeWindow.showWarningMessage.mockResolvedValue('Delete');
    mockStoryFileService.deleteFile.mockRejectedValue(new Error('File not found'));

    await command.execute('story-id', '/path/test.md');

    expect(mockTreeDataProvider.refresh).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- test/unit/core/commands/deleteFileCommand.test.ts
```

Expected: FAIL with "Cannot find module"

- [ ] **Step 3: Implement DeleteFileCommand**

Create `src/core/commands/deleteFileCommand.ts`:

```typescript
/**
 * Delete File Command
 * Prompts user for confirmation and deletes file from story folder
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryFileService } from '../../services/storyFileService';
import { BabelStoriesTreeDataProvider } from '../../views/storyTreeDataProvider';
import { Logger } from '../../utils/logger';

const logger = new Logger('DeleteFileCommand');

export class DeleteFileCommand extends CommandHandler {
  constructor(
    private storyFileService: StoryFileService,
    private treeDataProvider: BabelStoriesTreeDataProvider,
    private vscodeWindow = vscode.window
  ) {
    super('DeleteFileCommand');
  }

  async execute(storyId: string, filePath: string): Promise<CommandResult> {
    try {
      const fileName = path.basename(filePath);

      // Show confirmation dialog
      const choice = await this.vscodeWindow.showWarningMessage(
        `Delete '${fileName}'? This will be committed to Git.`,
        { modal: true },
        'Delete',
        'Cancel'
      );

      // User cancelled
      if (!choice || choice === 'Cancel') {
        return { success: true, message: 'Cancelled' };
      }

      // Delete file
      await this.storyFileService.deleteFile(storyId, filePath);

      // Refresh tree view
      this.treeDataProvider.refresh();

      logger.info(`File deleted: ${fileName}`);

      return {
        success: true,
        message: `File '${fileName}' deleted`,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to delete file: ${message}`);

      // Refresh tree anyway to sync state
      this.treeDataProvider.refresh();

      await this.vscodeWindow.showErrorMessage(
        `Failed to delete file: ${message}`
      );

      return {
        success: false,
        message: `Failed to delete file: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return true;
  }

  static register(
    context: vscode.ExtensionContext,
    storyFileService: StoryFileService,
    treeDataProvider: BabelStoriesTreeDataProvider
  ): void {
    const disposable = vscode.commands.registerCommand(
      'babel.deleteFile',
      async (fileItem: any) => {
        const command = new DeleteFileCommand(storyFileService, treeDataProvider);
        return command.execute(fileItem.storyId, fileItem.filePath);
      }
    );

    context.subscriptions.push(disposable);
    logger.info('DeleteFileCommand registered');
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- test/unit/core/commands/deleteFileCommand.test.ts
```

Expected: All tests PASS (7/7)

- [ ] **Step 5: Commit**

```bash
git add src/core/commands/deleteFileCommand.ts test/unit/core/commands/deleteFileCommand.test.ts
git commit -m "feat: implement DeleteFileCommand"
```

---

### Task 5: Register Commands in Extension

**Files:**
- Modify: `src/extension.ts`

- [ ] **Step 1: Add service instantiation to extension.ts**

In `src/extension.ts`, find the `activate()` function and add service instantiation. Add this after other services are initialized:

```typescript
// Around line where other services are created:
const storyFileService = new StoryFileService(gitRepository, workspaceRoot);
```

- [ ] **Step 2: Import command classes and register them**

Add imports at top of file:

```typescript
import { AddFileCommand } from './core/commands/addFileCommand';
import { AddChapterCommand } from './core/commands/addChapterCommand';
import { DeleteFileCommand } from './core/commands/deleteFileCommand';
```

Add registrations in `activate()` after CommandRegistry setup:

```typescript
AddFileCommand.register(context, storyFileService, storyTreeDataProvider);
AddChapterCommand.register(context, storyFileService, storyRepository, storyTreeDataProvider);
DeleteFileCommand.register(context, storyFileService, storyTreeDataProvider);
```

- [ ] **Step 3: Verify compilation**

```bash
npm run compile
```

Expected: Zero compilation errors

- [ ] **Step 4: Commit**

```bash
git add src/extension.ts
git commit -m "feat: register story file management commands in extension"
```

---

### Task 6: Update package.json with Menu Entries

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add command definitions**

In `package.json` under `contributes.commands`, add three new commands:

```json
{
  "command": "babel.addFile",
  "title": "Add File to Story",
  "category": "Babel",
  "description": "Add a new markdown file to a story"
},
{
  "command": "babel.addChapter",
  "title": "Add Chapter",
  "category": "Babel",
  "description": "Add a new chapter to a Novel or Novella"
},
{
  "command": "babel.deleteFile",
  "title": "Delete File",
  "category": "Babel",
  "description": "Delete a file from a story"
}
```

- [ ] **Step 2: Add menu entries**

In `package.json` under `contributes.menus["view/item/context"]`, add:

```json
{
  "command": "babel.addFile",
  "when": "viewItem == babelStory",
  "group": "1_modification"
},
{
  "command": "babel.addChapter",
  "when": "viewItem == babelStory",
  "group": "1_modification"
},
{
  "command": "babel.deleteFile",
  "when": "viewItem == babelFile",
  "group": "2_deletion"
}
```

- [ ] **Step 3: Verify package.json is valid**

```bash
npm run compile
```

Expected: Zero errors

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "feat: add story file management commands to package.json"
```

---

### Task 7: Integration Tests

**Files:**
- Create: `test/integration/commands/storyFileManagement.test.ts`

- [ ] **Step 1: Write integration test file**

Create `test/integration/commands/storyFileManagement.test.ts`:

```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as tmp from 'tmp';
import { AddFileCommand } from '../../../src/core/commands/addFileCommand';
import { AddChapterCommand } from '../../../src/core/commands/addChapterCommand';
import { DeleteFileCommand } from '../../../src/core/commands/deleteFileCommand';
import { StoryFileService } from '../../../src/services/storyFileService';
import { GitRepository } from '../../../src/git/gitRepository';
import { Database } from '../../../src/db/database';
import { StoryRepository } from '../../../src/db/storyRepository';
import { StoryType } from '../../../src/types';

describe('Story File Management Integration', () => {
  let tmpDir: tmp.DirResult;
  let workspaceRoot: string;
  let storyDir: string;
  let gitRepository: GitRepository;
  let storyRepository: StoryRepository;
  let storyFileService: StoryFileService;

  beforeAll(() => {
    // Create temporary workspace
    tmpDir = tmp.dirSync({ unsafeCleanup: true });
    workspaceRoot = tmpDir.name;

    // Initialize git repo
    require('child_process').execSync('git init', { cwd: workspaceRoot });
    require('child_process').execSync('git config user.email "test@test.com"', {
      cwd: workspaceRoot,
    });
    require('child_process').execSync('git config user.name "Test User"', {
      cwd: workspaceRoot,
    });

    gitRepository = new GitRepository(workspaceRoot);
  });

  beforeEach(() => {
    // Create database and repositories
    const database = new Database(path.join(workspaceRoot, 'babel.db'));
    storyRepository = new StoryRepository(database);

    // Create service
    storyFileService = new StoryFileService(gitRepository, workspaceRoot);

    // Create story directory
    const storyId = 'test-story-' + Date.now();
    storyDir = path.join(workspaceRoot, storyId);
    fs.mkdirSync(storyDir, { recursive: true });

    // Create story in database
    storyRepository.create({
      displayName: 'Test Story',
      type: StoryType.NOVEL,
    });
  });

  afterAll(() => {
    tmpDir.removeCallback();
  });

  it('creates empty file and commits to Git', async () => {
    const storyId = path.basename(storyDir);
    const result = await storyFileService.createFile(storyId, 'research.md');

    expect(fs.existsSync(result.filePath)).toBe(true);
    expect(fs.readFileSync(result.filePath, 'utf-8')).toBe('');

    // Verify commit exists
    const log = require('child_process')
      .execSync('git log --oneline', { cwd: workspaceRoot })
      .toString();
    expect(log).toContain('feat: add file research.md');
  });

  it('creates chapter with heading and commits', async () => {
    const storyId = path.basename(storyDir);
    const result = await storyFileService.createChapter(storyId, 'Chapter 1');

    expect(fs.existsSync(result.filePath)).toBe(true);
    const content = fs.readFileSync(result.filePath, 'utf-8');
    expect(content).toBe('# Chapter 1\n');

    // Verify commit
    const log = require('child_process')
      .execSync('git log --oneline', { cwd: workspaceRoot })
      .toString();
    expect(log).toContain('feat: add chapter Chapter 1');
  });

  it('deletes file and commits deletion', async () => {
    const storyId = path.basename(storyDir);

    // Create file first
    const result = await storyFileService.createFile(storyId, 'temp.md');

    // Delete it
    await storyFileService.deleteFile(storyId, result.filePath);

    expect(fs.existsSync(result.filePath)).toBe(false);

    // Verify commit
    const log = require('child_process')
      .execSync('git log --oneline', { cwd: workspaceRoot })
      .toString();
    expect(log).toContain('refactor: remove file temp.md');
  });

  it('handles multiple files in sequence', async () => {
    const storyId = path.basename(storyDir);

    // Add file
    const file1 = await storyFileService.createFile(storyId, 'scene1.md');
    expect(fs.existsSync(file1.filePath)).toBe(true);

    // Add chapter
    const chapter1 = await storyFileService.createChapter(storyId, 'Chapter 1');
    expect(fs.existsSync(chapter1.filePath)).toBe(true);

    // Add another file
    const file2 = await storyFileService.createFile(storyId, 'scene2.md');
    expect(fs.existsSync(file2.filePath)).toBe(true);

    // Delete first file
    await storyFileService.deleteFile(storyId, file1.filePath);
    expect(fs.existsSync(file1.filePath)).toBe(false);

    // Verify all commits
    const log = require('child_process')
      .execSync('git log --oneline', { cwd: workspaceRoot })
      .toString();
    expect(log).toContain('feat: add file scene1.md');
    expect(log).toContain('feat: add chapter Chapter 1');
    expect(log).toContain('feat: add file scene2.md');
    expect(log).toContain('refactor: remove file scene1.md');
  });

  it('counts chapters correctly', async () => {
    const storyId = path.basename(storyDir);

    expect(await storyFileService.getChapterCount(storyId)).toBe(0);

    await storyFileService.createChapter(storyId, 'Chapter 1');
    expect(await storyFileService.getChapterCount(storyId)).toBe(1);

    await storyFileService.createChapter(storyId, 'Chapter 2');
    expect(await storyFileService.getChapterCount(storyId)).toBe(2);

    // Create non-chapter file (should not count)
    await storyFileService.createFile(storyId, 'notes.md');
    expect(await storyFileService.getChapterCount(storyId)).toBe(2);
  });
});
```

- [ ] **Step 2: Run integration tests**

```bash
npm test -- test/integration/commands/storyFileManagement.test.ts
```

Expected: All tests PASS (5/5)

- [ ] **Step 3: Commit**

```bash
git add test/integration/commands/storyFileManagement.test.ts
git commit -m "test: add integration tests for story file management"
```

---

### Task 8: Verify Coverage and Build

**Files:**
- None (verification only)

- [ ] **Step 1: Run full test suite**

```bash
npm test
```

Expected: All tests pass, including new tests

- [ ] **Step 2: Check coverage report**

```bash
npm run test:coverage
```

Expected: Overall coverage ≥80%, StoryFileService and commands all ≥80%

- [ ] **Step 3: Verify compilation**

```bash
npm run compile
```

Expected: Zero errors, zero warnings

- [ ] **Step 4: Final verification commit**

```bash
git log --oneline -10
```

Expected: Should see all 7 commits for this feature

---

## Success Criteria

- ✅ StoryFileService implemented with full file operations
- ✅ AddFileCommand prompts for filename and creates files
- ✅ AddChapterCommand detects story type and suggests chapter names
- ✅ DeleteFileCommand prompts for confirmation before deletion
- ✅ All commands registered in extension.ts and package.json
- ✅ Context menus appear correctly (story items, file items)
- ✅ All operations commit to Git with semantic messages
- ✅ 80%+ test coverage (unit + integration)
- ✅ All tests passing
- ✅ Zero compilation errors
