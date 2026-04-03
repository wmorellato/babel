/**
 * Email Service Tests
 */

import * as vscode from 'vscode';
import { EmailService } from '../../../../src/services/email/emailService';
import { GmailProvider, YahooProvider } from '../../../../src/services/email/emailProvider';
import { ICredentialStorage, StoredCredential } from '../../../../src/services/credentialStorage';

// Test helper for mocking credential storage
class MockCredentialStorage implements ICredentialStorage {
  private credentials: Map<string, StoredCredential> = new Map();

  async store(key: string, credential: StoredCredential): Promise<void> {
    this.credentials.set(key, credential);
  }

  async retrieve(key: string): Promise<StoredCredential | null> {
    return this.credentials.get(key) || null;
  }

  async delete(key: string): Promise<void> {
    this.credentials.delete(key);
  }

  async list(): Promise<string[]> {
    return Array.from(this.credentials.keys());
  }

  async isMigrationNeeded(): Promise<boolean> {
    return false;
  }

  async migrateFromLegacy(): Promise<void> {
    // No-op for testing
  }
}

// Mock VSCode window
jest.mock('vscode', () => ({
  window: {
    showInputBox: jest.fn(),
  },
}));

describe('EmailService', () => {
  let emailService: EmailService;
  let mockCredentialStorage: MockCredentialStorage;
  let mockNodemailer: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCredentialStorage = new MockCredentialStorage();
    mockNodemailer = {
      createTransport: jest.fn(),
    };
    emailService = new EmailService(mockCredentialStorage, mockNodemailer);
  });

  describe('getEmailPassword', () => {
    it('should retrieve password from storage if available', async () => {
      const storedPassword = 'stored-app-password';
      await mockCredentialStorage.store('kindle-email-password', {
        version: '1.0',
        type: 'email-password',
        provider: 'kindle',
        accessToken: storedPassword,
      });

      const password = await emailService.getEmailPassword('test@gmail.com');

      expect(password).toBe(storedPassword);
    });

    it('should prompt user and store password if not found', async () => {
      const newPassword = 'new-app-password';
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(newPassword);

      const password = await emailService.getEmailPassword('test@gmail.com');

      expect(password).toBe(newPassword);
      expect(vscode.window.showInputBox).toHaveBeenCalledWith(
        expect.objectContaining({
          prompt: 'App-specific password for test@gmail.com:',
          password: true,
          ignoreFocusOut: true,
        })
      );

      // Verify password was stored
      const stored = await mockCredentialStorage.retrieve('kindle-email-password');
      expect(stored).not.toBeNull();
      expect(stored?.accessToken).toBe(newPassword);
    });

    it('should return null if user cancels password prompt', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const password = await emailService.getEmailPassword('test@gmail.com');

      expect(password).toBeNull();
    });

    it('should not store password if user cancels', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      await emailService.getEmailPassword('test@gmail.com');

      const stored = await mockCredentialStorage.retrieve('kindle-email-password');
      expect(stored).toBeNull();
    });
  });

  describe('getProvider', () => {
    it('should return GmailProvider for gmail service', () => {
      const provider = emailService.getProvider('gmail');
      expect(provider).toBeInstanceOf(GmailProvider);
    });

    it('should return YahooProvider for yahoo service', () => {
      const provider = emailService.getProvider('yahoo');
      expect(provider).toBeInstanceOf(YahooProvider);
    });

    it('should throw error for unknown service', () => {
      expect(() => emailService.getProvider('aol')).toThrow('Unknown email service: aol');
    });

    it('should throw error for empty service', () => {
      expect(() => emailService.getProvider('')).toThrow();
    });
  });

  describe('sendEmail', () => {
    it('should return failure if password is not available', async () => {
      (vscode.window.showInputBox as jest.Mock).mockResolvedValue(undefined);

      const result = await emailService.sendEmail({
        senderEmail: 'test@gmail.com',
        recipientEmail: 'kindle@example.com',
        emailService: 'gmail',
        filePath: '/path/to/story.epub',
        fileName: 'story.epub',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Password required');
    });

    it('should send email with valid credentials', async () => {
      const password = 'app-password';
      await mockCredentialStorage.store('kindle-email-password', {
        version: '1.0',
        type: 'email-password',
        provider: 'kindle',
        accessToken: password,
      });

      // Set up nodemailer mock
      const mockSendMail = jest.fn().mockResolvedValue({ messageId: '<message@id>' });
      const mockTransporter = {
        sendMail: mockSendMail,
      };
      mockNodemailer.createTransport.mockReturnValue(mockTransporter);

      const result = await emailService.sendEmail({
        senderEmail: 'test@gmail.com',
        recipientEmail: 'kindle@example.com',
        emailService: 'gmail',
        filePath: '/path/to/story.epub',
        fileName: 'story.epub',
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('Kindle');
      expect(mockSendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          from: 'test@gmail.com',
          to: 'kindle@example.com',
          subject: 'Story: story.epub',
        })
      );
    });

    it('should handle authentication errors gracefully', async () => {
      const password = 'bad-password';
      await mockCredentialStorage.store('kindle-email-password', {
        version: '1.0',
        type: 'email-password',
        provider: 'kindle',
        accessToken: password,
      });

      // Mock nodemailer to throw error
      const mockSendMail = jest.fn().mockRejectedValue(
        new Error('Invalid login credentials')
      );
      const mockTransporter = {
        sendMail: mockSendMail,
      };
      mockNodemailer.createTransport.mockReturnValue(mockTransporter);

      const result = await emailService.sendEmail({
        senderEmail: 'test@gmail.com',
        recipientEmail: 'kindle@example.com',
        emailService: 'gmail',
        filePath: '/path/to/story.epub',
        fileName: 'story.epub',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Authentication failed');
    });

    it('should handle network errors gracefully', async () => {
      const password = 'app-password';
      await mockCredentialStorage.store('kindle-email-password', {
        version: '1.0',
        type: 'email-password',
        provider: 'kindle',
        accessToken: password,
      });

      // Mock nodemailer to throw network error
      const mockSendMail = jest.fn().mockRejectedValue(
        new Error('ECONNREFUSED: Connection refused')
      );
      const mockTransporter = {
        sendMail: mockSendMail,
      };
      mockNodemailer.createTransport.mockReturnValue(mockTransporter);

      const result = await emailService.sendEmail({
        senderEmail: 'test@gmail.com',
        recipientEmail: 'kindle@example.com',
        emailService: 'gmail',
        filePath: '/path/to/story.epub',
        fileName: 'story.epub',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });
  });
});
