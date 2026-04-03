/**
 * Send to Kindle Command Tests
 */

import * as vscode from 'vscode';
import { SendToKindleCommand } from '../../../../src/core/commands/sendToKindleCommand';
import { StoryRepository } from '../../../../src/db/storyRepository';
import { PandocExportService } from '../../../../src/services/export/pandocExportService';
import { EmailService } from '../../../../src/services/email/emailService';
import { createTestDatabase, seedTestStory } from '../../../helpers/database';
import { StoryType } from '../../../../src/types';
import * as fs from 'fs';
import * as path from 'path';
import { Logger } from '../../../../src/utils/logger';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();
jest.spyOn(Logger.prototype, 'debug').mockImplementation();

jest.mock('vscode');

describe('SendToKindleCommand', () => {
  let command: SendToKindleCommand;
  let storyRepository: StoryRepository;
  let mockExportService: jest.Mocked<PandocExportService>;
  let mockEmailService: jest.Mocked<EmailService>;
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create test database
    const db = createTestDatabase();
    db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon_name TEXT,
        current_word_count INTEGER,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )
    `);

    storyRepository = new StoryRepository(db);
    tempDir = path.join(__dirname, '.temp-send-kindle-test');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    mockExportService = {
      isPandocInstalled: jest.fn().mockReturnValue(true),
      exportStory: jest.fn(),
    } as any;

    mockEmailService = {
      sendEmail: jest.fn(),
    } as any;

    command = new SendToKindleCommand(
      storyRepository,
      tempDir,
      mockExportService,
      mockEmailService
    );

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: tempDir } },
    ];
    (vscode.workspace.getConfiguration as any) = jest.fn();
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true });
    }
  });

  describe('execute', () => {
    it('should return error if settings not configured', async () => {
      const mockConfig = {
        get: jest.fn()
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined)
          .mockReturnValueOnce(undefined),
      };
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Settings not configured');
    });

    it('should return error if pandoc not installed', async () => {
      mockExportService.isPandocInstalled.mockReturnValue(false);
      const mockConfig = {
        get: jest.fn()
          .mockReturnValueOnce('gmail')
          .mockReturnValueOnce('sender@gmail.com')
          .mockReturnValueOnce('kindle@kindle.com'),
      };
      (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Pandoc');
    });

    it('should return error if no stories found', async () => {
      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('No stories');
    });

    it('should return error if pandoc templates path not configured', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn().mockReturnValue(undefined),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('templates path');
    });

    it('should return error if story selection cancelled', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn().mockReturnValue('/valid/path'),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue(undefined);

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('cancelled');
    });

    it('should return error if file size exceeds 25MB limit', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      mockExportService.exportStory.mockImplementation(async (storyId, savePath) => {
        fs.writeFileSync(savePath, Buffer.alloc(26 * 1024 * 1024)); // 26MB
        return {
          success: true,
          message: 'Exported',
          filePath: savePath,
        };
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('too large');
    });

    it('should send story to Kindle successfully', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      // Create a mock DOCX file - but return a different path from exportStory
      const tempFileName = `test-story-1-${Date.now()}.docx`;
      const mockDocxFile = path.join(tempDir, tempFileName);

      mockExportService.exportStory.mockImplementation(async (storyId, savePath) => {
        fs.writeFileSync(savePath, Buffer.alloc(1024 * 1024)); // 1MB
        return {
          success: true,
          message: 'Exported',
          filePath: savePath,
        };
      });

      mockEmailService.sendEmail.mockResolvedValue({
        success: true,
        message: 'Sent',
        messageId: 'msg-123',
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      const result = await command.execute();

      expect(result.success).toBe(true);
      expect(result.message).toContain('successfully');
      expect(result.data).toHaveProperty('messageId');
      expect(mockEmailService.sendEmail).toHaveBeenCalled();
    });

    it('should handle export service failure', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      mockExportService.exportStory.mockResolvedValue({
        success: false,
        message: 'Export failed',
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Export failed');
      expect(mockEmailService.sendEmail).not.toHaveBeenCalled();
    });

    it('should handle email service failure', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      let createdFilePath: string | null = null;

      mockExportService.exportStory.mockImplementation(async (storyId, savePath) => {
        fs.writeFileSync(savePath, Buffer.alloc(1024 * 1024)); // 1MB
        createdFilePath = savePath;
        return {
          success: true,
          message: 'Exported',
          filePath: savePath,
        };
      });

      mockEmailService.sendEmail.mockResolvedValue({
        success: false,
        message: 'Email failed',
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      const result = await command.execute();

      expect(result.success).toBe(false);
      expect(result.message).toContain('Email failed');
      // Temp file should be cleaned up
      if (createdFilePath) {
        expect(fs.existsSync(createdFilePath)).toBe(false);
      }
    });

    it('should clean up temp file on success', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      let createdFilePath: string | null = null;

      mockExportService.exportStory.mockImplementation(async (storyId, savePath) => {
        fs.writeFileSync(savePath, Buffer.alloc(1024 * 1024));
        createdFilePath = savePath;
        return {
          success: true,
          message: 'Exported',
          filePath: savePath,
        };
      });

      mockEmailService.sendEmail.mockResolvedValue({
        success: true,
        message: 'Sent',
        messageId: 'msg-123',
      });

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      await command.execute();

      // Temp file should be cleaned up
      if (createdFilePath) {
        expect(fs.existsSync(createdFilePath)).toBe(false);
      }
    });

    it('should clean up temp file on error', async () => {
      // Create a test story
      seedTestStory(storyRepository['db']);

      const mockSendToKindleConfig = {
        get: jest.fn((key: string) => {
          if (key === 'emailService') return 'gmail';
          if (key === 'senderEmail') return 'sender@gmail.com';
          if (key === 'recipientEmail') return 'kindle@kindle.com';
          return undefined;
        }),
      };

      const mockExportConfig = {
        get: jest.fn((key: string) => {
          if (key === 'pandocTemplatesPath') return '/valid/path';
          return undefined;
        }),
      };

      (vscode.workspace.getConfiguration as jest.Mock).mockImplementation((section: string) => {
        if (section === 'babel.sendToKindle') return mockSendToKindleConfig;
        if (section === 'babel.export') return mockExportConfig;
        return mockSendToKindleConfig;
      });

      let createdFilePath: string | null = null;

      mockExportService.exportStory.mockImplementation(async (storyId, savePath) => {
        fs.writeFileSync(savePath, Buffer.alloc(1024 * 1024));
        createdFilePath = savePath;
        return {
          success: true,
          message: 'Exported',
          filePath: savePath,
        };
      });

      mockEmailService.sendEmail.mockRejectedValue(new Error('Network error'));

      (vscode.window.showQuickPick as jest.Mock).mockResolvedValue({
        label: 'Test Story',
        storyId: 'test-story-1',
      });

      await command.execute();

      // Temp file should be cleaned up
      if (createdFilePath) {
        expect(fs.existsSync(createdFilePath)).toBe(false);
      }
    });
  });

  describe('validatePrerequisites', () => {
    it('should return true when workspace exists', async () => {
      const valid = await (command as any).validatePrerequisites();
      expect(valid).toBe(true);
    });

    it('should return false when workspace does not exist', async () => {
      (vscode.workspace.workspaceFolders as any) = undefined;

      const valid = await (command as any).validatePrerequisites();
      expect(valid).toBe(false);
    });
  });
});
