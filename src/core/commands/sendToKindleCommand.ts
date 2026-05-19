/**
 * Send to Kindle Command
 * Exports a story to DOCX and emails it to Kindle via Gmail or Yahoo
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { CommandHandler, CommandResult } from './commandHandler';
import { StoryRepository } from '../../db/storyRepository';
import { PandocExportService } from '../../services/export/pandocExportService';
import { EmailService } from '../../services/email/emailService';

interface StoryItem extends vscode.QuickPickItem {
  storyId: string;
}

interface AuthorMetadata {
  authorName?: string;
  authorByline?: string;
  address?: string;
  cityPostcode?: string;
  phone?: string;
  email?: string;
}

/**
 * Send to Kindle Command
 * Orchestrates the full workflow:
 * 1. Validate settings
 * 2. Check pandoc installation
 * 3. Select story
 * 4. Export to temp DOCX
 * 5. Validate file size
 * 6. Send email
 * 7. Clean up temp file
 * 8. Show success notification
 */
export class SendToKindleCommand extends CommandHandler {
  constructor(
    private storyRepository: StoryRepository,
    private workspacePath: string,
    private exportService: PandocExportService,
    private emailService: EmailService
  ) {
    super('SendToKindleCommand');
  }

  async execute(...args: unknown[]): Promise<CommandResult> {
    let tempFilePath: string | null = null;

    try {
      const valid = await this.validatePrerequisites();
      if (!valid) {
        return {
          success: false,
          message: 'No workspace folder open',
        };
      }

      // Step 1: Validate settings
      const config = vscode.workspace.getConfiguration('babel.sendToKindle');
      const emailService = config.get<string>('emailService');
      const senderEmail = config.get<string>('senderEmail');
      const recipientEmail = config.get<string>('recipientEmail');

      if (!emailService || !senderEmail || !recipientEmail) {
        this.showError(
          'Send to Kindle settings not configured. Please set babel.sendToKindle.* in settings.'
        );
        return {
          success: false,
          message: 'Settings not configured',
        };
      }

      // Step 2: Check if pandoc is installed
      if (!this.exportService.isPandocInstalled()) {
        this.showError('Pandoc is not installed. Please install it from https://pandoc.org/installing.html');
        return {
          success: false,
          message: 'Pandoc is not installed',
        };
      }

      // Step 3: Check pandoc templates path
      const exportConfig = vscode.workspace.getConfiguration('babel.export');
      const pandocTemplatesPath = exportConfig.get<string>('pandocTemplatesPath');
      if (!pandocTemplatesPath) {
        this.showError('Pandoc templates path not configured. Please set babel.export.pandocTemplatesPath in settings.');
        return {
          success: false,
          message: 'Pandoc templates path not configured',
        };
      }

      // Step 4: Get list of stories
      const stories = this.storyRepository.findAll();
      if (!stories || stories.length === 0) {
        return {
          success: false,
          message: 'No stories found',
        };
      }

      // Step 5: Prompt user to select story
      const storyItems: StoryItem[] = stories.map((story) => ({
        label: story.displayName,
        storyId: story.id,
        description: story.type,
      }));

      const selectedStory = await vscode.window.showQuickPick(storyItems, {
        title: 'Send to Kindle',
        placeHolder: 'Select a story to send...',
      });

      if (!selectedStory) {
        return {
          success: false,
          message: 'Story selection cancelled',
        };
      }

      // Step 6: Get story metadata
      const story = this.storyRepository.findById(selectedStory.storyId);
      if (!story) {
        return {
          success: false,
          message: 'Story not found',
        };
      }

      // Step 7: Read author metadata from settings
      const authorMetadata: AuthorMetadata = {
        authorName: exportConfig.get<string>('authorName') || undefined,
        authorByline: exportConfig.get<string>('authorByline') || undefined,
        address: exportConfig.get<string>('address') || undefined,
        cityPostcode: exportConfig.get<string>('cityPostcode') || undefined,
        phone: exportConfig.get<string>('phone') || undefined,
        email: exportConfig.get<string>('email') || undefined,
      };

      // Step 8: Generate temp DOCX file
      const tempFileName = `${story.id}-${Date.now()}.docx`;
      tempFilePath = path.join(this.workspacePath, tempFileName);

      const exportResult = await this.exportService.exportStory(
        story.id,
        tempFilePath,
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

      // Step 9: Validate file exists and size
      if (!fs.existsSync(tempFilePath)) {
        return {
          success: false,
          message: 'Export failed - file not created',
        };
      }

      const fileStats = fs.statSync(tempFilePath);
      const fileSizeMb = fileStats.size / (1024 * 1024);
      const maxSizeMb = 25;
      if (fileSizeMb > maxSizeMb) {
        fs.unlinkSync(tempFilePath);
        tempFilePath = null;
        this.showError(`File too large for Kindle (${fileSizeMb.toFixed(1)}MB). Kindle accepts up to ${maxSizeMb}MB.`);
        return {
          success: false,
          message: 'File too large for Kindle',
        };
      }

      // Step 10: Send email
      const sendResult = await this.emailService.sendEmail({
        senderEmail,
        recipientEmail,
        emailService: emailService as 'gmail' | 'yahoo',
        filePath: tempFilePath,
        fileName: `${story.displayName}.docx`,
      });

      if (!sendResult.success) {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
        this.showError(sendResult.message);
        return {
          success: false,
          message: sendResult.message,
        };
      }

      // Step 11: Clean up temp file
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      tempFilePath = null;

      // Step 12: Show success notification
      this.showInfo('Story sent to Kindle!');
      this.logger.info(`Story sent to Kindle: ${story.displayName} → ${recipientEmail}`);

      return {
        success: true,
        message: 'Story sent to Kindle successfully',
        data: {
          storyId: story.id,
          recipientEmail,
          messageId: sendResult.messageId,
        },
      };
    } catch (error) {
      // Clean up on error
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }

      const message = error instanceof Error ? error.message : String(error);
      this.showError(`Failed to send to Kindle: ${message}`);
      return {
        success: false,
        message: `Failed to send to Kindle: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    const workspace = vscode.workspace.workspaceFolders;
    return !!(workspace && workspace.length > 0);
  }
}
