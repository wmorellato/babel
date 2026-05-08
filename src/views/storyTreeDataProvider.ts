/**
 * Babel Stories Tree Data Provider
 * Provides story entries and files for the sidebar tree view
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { StoryRepository } from '../db/storyRepository';
import { VersionRepository } from '../db/versionRepository';
import { GitRepository } from '../git/gitRepository';
import { StoryTreeItem } from './storyTreeItem';
import { FileTreeItem } from './fileTreeItem';
import { Logger } from '../utils/logger';
import { BabelDatabase } from '../db/database';

const logger = new Logger('BabelStoriesTreeDataProvider');

export class BabelStoriesTreeDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> = this._onDidChangeTreeData.event;
  private branchCache = new Map<string, { branch: string; timestamp: number }>();
  private readonly CACHE_TTL = 5000; // 5 second cache

  constructor(
    private storyRepository: StoryRepository,
    private versionRepository: VersionRepository,
    private gitRepository: GitRepository,
    private workspaceRoot: string,
    database?: BabelDatabase
  ) { }

  /**
   * Refresh the tree
   */
  refresh(): void {
    logger.debug('Refreshing tree');
    this.branchCache.clear();
    this._onDidChangeTreeData.fire(undefined);
  }

  /**
   * Get tree item
   */
  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  /**
   * Get children of tree item
   */
  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    try {
      // Root: return all stories
      if (!element) {
        const stories = this.storyRepository.findAll();

        // Filter out hidden stories - only show stories whose folder exists
        const visibleStories = stories.filter((story) => {
          const folderPath = path.join(this.workspaceRoot, story.id);
          return fs.existsSync(folderPath);
        });

        // Sort alphabetically by display name
        const sorted = visibleStories.sort((a, b) => a.displayName.localeCompare(b.displayName));

        // Create tree items with version count and current branch
        const items = await Promise.all(
          sorted.map(async (story) => {
            const versions = this.versionRepository.findByStoryId(story.id);
            const versionCount = versions.length;

            let currentBranch = 'unknown';
            try {
              const storyPath = path.join(this.workspaceRoot, story.id);
              if (fs.existsSync(storyPath)) {
                // Check cache first
                const cached = this.branchCache.get(story.id);
                const now = Date.now();
                if (cached && now - cached.timestamp < this.CACHE_TTL) {
                  currentBranch = cached.branch;
                } else {
                  // Fetch branch with 2 second timeout to prevent hanging
                  const storyGit = new GitRepository(storyPath);
                  const branchPromise = storyGit.getCurrentBranch();
                  currentBranch = await Promise.race([
                    branchPromise,
                    new Promise<string>((_, reject) =>
                      setTimeout(() => reject(new Error('timeout')), 2000)
                    ),
                  ]);
                  // Update cache
                  this.branchCache.set(story.id, { branch: currentBranch, timestamp: now });
                }
              }
            } catch (error) {
              logger.debug(`Could not determine current branch for story ${story.id}: ${error}`);
            }

            return new StoryTreeItem(story, versionCount, currentBranch);
          })
        );

        return items;
      }

      // Story: return its markdown files
      if (element instanceof StoryTreeItem) {
        return this.getFilesForStory(element.storyId);
      }

      // File: leaf node, no children
      return [];
    } catch (error) {
      logger.error(`Error getting children: ${error}`);
      return [];
    }
  }

  /**
   * Get parent of a tree item (required for reveal API)
   */
  getParent(element: vscode.TreeItem): vscode.TreeItem | null {
    // If it's a FileTreeItem, its parent is the story
    if (element instanceof FileTreeItem) {
      const storyItem = this.getStoryItem(element.storyId);
      return storyItem;
    }
    // Stories are root-level, no parent
    return null;
  }

  /**
   * Get or construct StoryTreeItem by ID
   */
  private getStoryItem(storyId: string): StoryTreeItem | null {
    const story = this.storyRepository.findById(storyId);
    if (!story) {
      return null;
    }

    const versions = this.versionRepository.findByStoryId(storyId);
    const versionCount = versions.length;

    return new StoryTreeItem(story, versionCount, 'unknown');
  }

  /**
   * Get FileTreeItem by story ID and file path
   * Used by reveal feature to find the file to highlight
   */
  getFileTreeItem(storyId: string, filePath: string): vscode.TreeItem | null {
    const files = this.getFilesForStory(storyId);
    return files.find(f => f.resourceUri?.fsPath === filePath) || null;
  }

  /**
   * Get markdown files for a story
   */
  private getFilesForStory(storyId: string): FileTreeItem[] {
    const storyPath = path.join(this.workspaceRoot, storyId);

    // Check if folder exists
    if (!fs.existsSync(storyPath)) {
      logger.warn(`Story folder not found: ${storyPath}`);
      return [];
    }

    const files: FileTreeItem[] = [];
    this.collectMarkdownFiles(storyPath, storyId, '', files);
    return files.sort((a, b) => a.label!.toString().localeCompare(b.label!.toString()));
  }

  /**
   * Recursively collect markdown files from a directory
   */
  private collectMarkdownFiles(
    dirPath: string,
    storyId: string,
    relativePrefix: string,
    files: FileTreeItem[]
  ): void {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        // Skip hidden files/folders
        if (entry.name.startsWith('.')) {
          continue;
        }

        const fullPath = path.join(dirPath, entry.name);
        const relativePath = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Recurse into subdirectories (depth limit implicit via filesystem)
          this.collectMarkdownFiles(fullPath, storyId, relativePath, files);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          // Add markdown files
          const label = relativePrefix ? `${relativePrefix}/${entry.name}` : entry.name;
          files.push(new FileTreeItem(label, fullPath, storyId));
        }
      }
    } catch (error) {
      logger.error(`Error reading story files from ${dirPath}: ${error}`);
    }
  }
}
