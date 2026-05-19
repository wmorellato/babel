/**
 * Create Story Command
 * Prompts user to create a new story with type and name
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryManager } from '../storyManager';
import { StoryTypeRegistry } from '../storyTypeRegistry';
import { StoryType } from '../../types/index';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { GitRepository } from '../../git/gitRepository';

interface StoryTypeOption extends vscode.QuickPickItem {
  storyType: StoryType;
}

export class CreateStoryCommand extends CommandHandler {
  private storyManager: StoryManager;

  private readonly storyTypes: StoryTypeOption[] = [
    {
      label: 'Short Story',
      storyType: StoryType.SHORT_STORY,
      description: 'A brief fictional narrative (2000-10000 words)',
    },
    {
      label: 'Novel',
      storyType: StoryType.NOVEL,
      description: 'A long fictional narrative (50000+ words)',
    },
    {
      label: 'Novella',
      storyType: StoryType.NOVELLA,
      description: 'A medium-length fictional narrative (20000-50000 words)',
    },
    {
      label: 'Essay',
      storyType: StoryType.ESSAY,
      description: 'A short piece of non-fiction writing',
    },
  ];

  constructor(
    storyRepository: StoryRepository,
    versionRepository: VersionRepository
  ) {
    super('CreateStoryCommand');
    const typeRegistry = new StoryTypeRegistry();
    this.storyManager = new StoryManager(
      storyRepository,
      versionRepository,
      typeRegistry
    );
  }

  async execute(...args: unknown[]): Promise<CommandResult> {
    try {
      const valid = await this.validatePrerequisites();
      if (!valid) {
        return {
          success: false,
          message: 'No workspace folder open',
        };
      }

      // Step 1: Prompt for story type
      const selectedType = await vscode.window.showQuickPick(this.storyTypes, {
        title: 'Select Story Type',
        placeHolder: 'Choose a story type...',
      });

      if (!selectedType) {
        return {
          success: false,
          message: 'Story creation cancelled',
        };
      }

      // Step 2: Prompt for story name
      const storyName = await vscode.window.showInputBox({
        title: 'Create New Story',
        prompt: 'Enter story name',
        placeHolder: 'e.g., "My First Novel"',
        validateInput: (value: string) => {
          if (!value.trim()) {
            return 'Story name cannot be empty';
          }
          if (value.trim().length < 1) {
            return 'Story name must be at least 1 character';
          }
          return null;
        },
      });

      if (!storyName) {
        return {
          success: false,
          message: 'Story creation cancelled',
        };
      }

      if (!storyName.trim()) {
        return {
          success: false,
          message: 'Story name cannot be empty',
        };
      }

      // Step 3: Create the story
      const story = this.storyManager.createStory(
        storyName.trim(),
        selectedType.storyType
      );

      // Step 4: Create story folder structure with UUID
      const workspaceRoot = this.getWorkspaceRoot();
      if (workspaceRoot) {
        await this.createStoryFolderStructure(
          workspaceRoot,
          story.id,
          story.displayName,
          selectedType.storyType
        );
      }

      this.showInfo(`Story "${story.displayName}" created successfully`);
      this.logger.info(
        `Story created: ${story.id} (${story.displayName}, type: ${selectedType.storyType})`
      );

      return {
        success: true,
        message: `Story "${story.displayName}" created successfully`,
        data: { storyId: story.id, storyName: story.displayName },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to create story: ${message}`);
      return {
        success: false,
        message: `Failed to create story: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    const workspace = vscode.workspace.workspaceFolders;
    if (!workspace || workspace.length === 0) {
      return false;
    }
    return true;
  }

  /**
   * Create story folder structure at workspace/{storyId}/
   * FSP abstracts the UUID to display the friendly story name to users
   */
  private async createStoryFolderStructure(
    workspaceRoot: string,
    storyId: string,
    storyName: string,
    storyType: StoryType
  ): Promise<void> {
    const storyDir = path.join(workspaceRoot, storyId);

    // Create directories
    if (!fs.existsSync(storyDir)) {
      fs.mkdirSync(storyDir, { recursive: true });
    }

    // Create type-specific boilerplate files
    this.createBoilerplateFiles(storyDir, storyName, storyType);

    // Initialize real git repository
    try {
      const storyGit = new GitRepository(storyDir);
      await storyGit.init();
      await storyGit.createInitialCommit('Initial story setup');
      await storyGit.createBranch('draft1');
    } catch (error) {
      this.logger.warn(`Failed to initialize git repository: ${error}`);
      // Continue execution even if git init fails
    }

    // Open first file in editor
    let firstFile = '';
    switch (storyType) {
      case StoryType.NOVEL:
      case StoryType.NOVELLA:
        firstFile = 'chapters/chapter-1.md';
        break;
      case StoryType.SHORT_STORY:
        firstFile = 'story.md';
        break;
      case StoryType.ESSAY:
        firstFile = 'essay.md';
        break;
    }

    if (firstFile) {
      const fileUri = vscode.Uri.file(path.join(storyDir, firstFile));
      vscode.window.showTextDocument(fileUri);
    }
  }

  /**
   * Create type-specific boilerplate files
   */
  private createBoilerplateFiles(
    storyDir: string,
    storyName: string,
    storyType: StoryType
  ): void {
    const date = new Date().toLocaleDateString();

    // Common files for all types
    const outlineContent = `# ${storyName} - Outline

## Act 1
*Description of first act...*

`;

    const charactersContent = `# Characters

## John Doe
- **Name:**
- **Role:**
- **Description:**

`;

    fs.writeFileSync(path.join(storyDir, 'outline.md'), outlineContent, 'utf-8');
    fs.writeFileSync(
      path.join(storyDir, 'characters.md'),
      charactersContent,
      'utf-8'
    );

    // Type-specific files
    switch (storyType) {
      case StoryType.NOVEL:
      case StoryType.NOVELLA:
        this.createNovelBoilerplate(storyDir, storyName);
        break;
      case StoryType.SHORT_STORY:
        this.createShortStoryBoilerplate(storyDir, storyName);
        break;
      case StoryType.ESSAY:
        this.createEssayBoilerplate(storyDir, storyName);
        break;
    }
  }

  /**
   * Create boilerplate for novel/novella
   */
  private createNovelBoilerplate(storyDir: string, storyName: string): void {
    const chaptersDir = path.join(storyDir, 'chapters');
    if (!fs.existsSync(chaptersDir)) {
      fs.mkdirSync(chaptersDir, { recursive: true });
    }

    // Create initial chapters
    const chapter1Content = `# Chapter 1

`;

    const chapter2Content = `# Chapter 2

`;

    fs.writeFileSync(
      path.join(chaptersDir, 'chapter-1.md'),
      chapter1Content,
      'utf-8'
    );
    fs.writeFileSync(
      path.join(chaptersDir, 'chapter-2.md'),
      chapter2Content,
      'utf-8'
    );
  }

  /**
   * Create boilerplate for short story
   */
  private createShortStoryBoilerplate(storyDir: string, storyName: string): void {
    const storyContent = `# ${storyName}

`;
    fs.writeFileSync(path.join(storyDir, 'story.md'), storyContent, 'utf-8');
  }

  /**
   * Create boilerplate for essay
   */
  private createEssayBoilerplate(storyDir: string, storyName: string): void {
    const essayContent = `# ${storyName}


`;
    fs.writeFileSync(path.join(storyDir, 'essay.md'), essayContent, 'utf-8');
  }

}
