/**
 * Email Service
 * Handles SMTP operations for sending emails with attachments
 */

import * as vscode from 'vscode';
import * as nodemailer from 'nodemailer';
import { Logger } from '../../utils/logger';
import { ICredentialStorage } from '../credentialStorage';
import { IEmailProvider, GmailProvider, YahooProvider } from './emailProvider';

const logger = new Logger('EmailService');

export interface SendEmailOptions {
  senderEmail: string;
  recipientEmail: string;
  emailService: 'gmail' | 'yahoo';
  filePath: string;
  fileName: string;
}

export interface SendEmailResult {
  success: boolean;
  message: string;
  messageId?: string;
}

export interface INodemailer {
  createTransport(options: any): any;
}

/**
 * Email Service for sending files via SMTP
 * Orchestrates credential retrieval, provider selection, and SMTP operations
 */
export class EmailService {
  constructor(
    private credentialStorage: ICredentialStorage,
    private nodemailerClient: INodemailer = nodemailer
  ) {}

  /**
   * Get email password from storage or prompt user
   * @param senderEmail Email address for context in prompt
   * @returns Password or null if user cancels
   */
  async getEmailPassword(senderEmail: string): Promise<string | null> {
    try {
      // Try to retrieve from storage
      const stored = await this.credentialStorage.retrieve('kindle-email-password');
      if (stored) {
        logger.debug('Retrieved password from storage');
        return stored.accessToken;
      }

      // Prompt user for password
      const password = await vscode.window.showInputBox({
        prompt: `App-specific password for ${senderEmail}:`,
        password: true,
        ignoreFocusOut: true,
      });

      if (!password) {
        logger.debug('User cancelled password prompt');
        return null;
      }

      // Store password for future use
      await this.credentialStorage.store('kindle-email-password', {
        version: '1.0',
        type: 'email-password',
        provider: 'kindle',
        accessToken: password,
      });

      logger.debug('Stored password to storage');
      return password;
    } catch (error) {
      logger.error('Failed to get email password', error);
      throw error;
    }
  }

  /**
   * Get email provider instance based on service name
   * @param service Email service name (gmail or yahoo)
   * @returns Provider instance
   * @throws Error if service is unknown
   */
  getProvider(service: string): IEmailProvider {
    switch (service) {
      case 'gmail':
        return new GmailProvider();
      case 'yahoo':
        return new YahooProvider();
      default:
        throw new Error(`Unknown email service: ${service}`);
    }
  }

  /**
   * Send email with file attachment
   * @param options Send email options
   * @returns Result with success status and message ID
   */
  async sendEmail(options: SendEmailOptions): Promise<SendEmailResult> {
    try {
      logger.debug(`Sending email to ${options.recipientEmail} via ${options.emailService}`);

      // Get password
      const password = await this.getEmailPassword(options.senderEmail);
      if (!password) {
        return {
          success: false,
          message: 'Password required to send to Kindle',
        };
      }

      // Get provider
      const provider = this.getProvider(options.emailService);
      const smtpConfig = provider.getSmtpConfig(options.senderEmail, password);

      // Create transporter
      const transporter = this.nodemailerClient.createTransport(smtpConfig);

      // Send email
      const result = await transporter.sendMail({
        from: options.senderEmail,
        to: options.recipientEmail,
        subject: `Story: ${options.fileName}`,
        text: `Your story "${options.fileName}" is attached.`,
        attachments: [
          {
            filename: options.fileName,
            path: options.filePath,
          },
        ],
      });

      logger.info(`Email sent successfully. Message ID: ${result.messageId}`);

      return {
        success: true,
        message: 'Story sent to Kindle!',
        messageId: result.messageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to send email: ${errorMessage}`, error);

      // Interpret common SMTP errors
      if (errorMessage.includes('Invalid login')) {
        return {
          success: false,
          message: 'Authentication failed. Check your app-specific password.',
        };
      }

      if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ETIMEDOUT')) {
        return {
          success: false,
          message: 'Network error connecting to email provider.',
        };
      }

      return {
        success: false,
        message: `Failed to send: ${errorMessage}`,
      };
    }
  }
}
