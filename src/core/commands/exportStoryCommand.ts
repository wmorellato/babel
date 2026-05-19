/**
 * Export Story Command
 * Exports a story to DOCX format using Shunn manuscript template
 */

import * as vscode from 'vscode';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { PandocExportService } from '../../services/export/pandocExportService';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

export class ExportStoryCommand extends CommandHandler {
  private storyRepository: StoryRepository;
  private exportService: PandocExportService;

  constructor(storyRepository: StoryRepository, workspacePath: string) {
    super('ExportStoryCommand');
    this.storyRepository = storyRepository;
    this.exportService = new PandocExportService(storyRepository, workspacePath);
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

      // Step 1: Get list of stories
      const stories = this.storyRepository.findAll();

      if (!stories || stories.length === 0) {
        return {
          success: false,
          message: 'No stories found',
        };
      }

      // Convert stories to QuickPickItems
      const storyItems: StoryItem[] = stories.map((story) => ({
        label: story.displayName,
        storyId: story.id,
        description: story.type,
      }));

      // Step 2: Prompt user to select story
      const selectedStory = await vscode.window.showQuickPick(storyItems, {
        title: 'Export Story',
        placeHolder: 'Select a story to export...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 3: Check if pandoc is installed
      if (!this.exportService.isPandocInstalled()) {
        this.showError('Pandoc is not installed. Please install it from https://pandoc.org/installing.html');
        return {
          success: false,
          message: 'Pandoc is not installed',
        };
      }

      // Step 4: Check if pandoc templates path is configured
      const configCheck = vscode.workspace.getConfiguration('babel.export');
      const pandocTemplatesPath = configCheck.get<string>('pandocTemplatesPath');
      if (!pandocTemplatesPath) {
        this.showError('Pandoc templates path is not configured. Please set "babel.export.pandocTemplatesPath" in settings.');
        return {
          success: false,
          message: 'Pandoc templates path not configured',
        };
      }

      // Step 5: Prompt user for export file path
      const fileUri = await vscode.window.showSaveDialog({
        title: `Export "${selectedStory.label}"`,
        defaultUri: vscode.Uri.file(`/home/wes/Documents/BabelExports/${selectedStory.label.replace(/\s+/g, '-')}.docx`),
        filters: {
          'Word documents': ['docx'],
          'All files': ['*'],
        },
      });

      if (!fileUri) {
        return {
          success: false,
          message: 'Export cancelled',
        };
      }

      // Step 6: Get metadata for export (author name, etc.)
      const story = this.storyRepository.findById(selectedStory.storyId);
      if (!story) {
        return {
          success: false,
          message: 'Story not found',
        };
      }

      // Step 7: Read author metadata from settings
      const config = vscode.workspace.getConfiguration('babel.export');
      const authorMetadata = {
        authorName: config.get<string>('authorName') || '',
        authorByline: config.get<string>('authorByline') || '',
        address: config.get<string>('address') || '',
        cityPostcode: config.get<string>('cityPostcode') || '',
        phone: config.get<string>('phone') || '',
        email: config.get<string>('email') || '',
      };

      // Step 8: Export story to DOCX format using pandoc
      const exportResult = await this.exportService.exportStory(
        selectedStory.storyId,
        fileUri.fsPath,
        pandocTemplatesPath,
        authorMetadata
      );

      if (!exportResult.success) {
        this.showError(exportResult.message);
        return {
          success: false,
          message: exportResult.message,
        };
      }

      // Step 9: Return export data
      this.showInfo(`Story "${selectedStory.label}" exported to ${fileUri.fsPath}`);
      this.logger.info(`Story exported: ${selectedStory.storyId} → ${fileUri.fsPath}`);

      return {
        success: true,
        message: `Story "${selectedStory.label}" exported successfully`,
        data: {
          storyId: selectedStory.storyId,
          filePath: fileUri.fsPath,
          metadata: {
            name: story.displayName,
            type: story.type,
            createdAt: story.createdAt.toISOString(),
            updatedAt: story.updatedAt.toISOString(),
          },
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to export story: ${message}`);
      return {
        success: false,
        message: `Failed to export story: ${message}`,
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
}
