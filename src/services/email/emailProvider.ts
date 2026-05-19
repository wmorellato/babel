/**
 * Email Provider Interface and Implementations
 * Defines SMTP configuration for different email services
 */

import { EmailError } from '../../utils/emailError';

/**
 * SMTP configuration for nodemailer
 * @example
 * // Use with nodemailer:
 * const transporter = nodemailer.createTransport(config);
 */
export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

/**
 * Email provider interface for different email services
 */
export interface IEmailProvider {
  /**
   * Get SMTP configuration for this provider
   * @param senderEmail Email address that will send the message
   * @param password App-specific password (NOT the account password)
   *                 For Gmail: Generate at myaccount.google.com/apppasswords
   *                 For Yahoo: Use account password or app-specific password
   * @returns SMTP configuration for nodemailer
   * @throws EmailError if senderEmail or password are empty
   * @throws EmailError if email format is invalid
   */
  getSmtpConfig(senderEmail: string, password: string): SmtpConfig;
}

/**
 * Gmail SMTP provider
 * Requires Gmail app-specific password (not account password)
 */
export class GmailProvider implements IEmailProvider {
  getSmtpConfig(senderEmail: string, password: string): SmtpConfig {
    // Input validation
    if (!senderEmail?.trim()) {
      throw new EmailError('senderEmail is required');
    }
    if (!password?.trim()) {
      throw new EmailError('password is required');
    }
    if (!senderEmail.includes('@')) {
      throw new EmailError('Invalid email format: senderEmail must contain @');
    }

    return {
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: senderEmail,
        pass: password,
      },
    };
  }
}

/**
 * Yahoo Mail SMTP provider
 * Supports both account password and app-specific password
 */
export class YahooProvider implements IEmailProvider {
  getSmtpConfig(senderEmail: string, password: string): SmtpConfig {
    // Input validation
    if (!senderEmail?.trim()) {
      throw new EmailError('senderEmail is required');
    }
    if (!password?.trim()) {
      throw new EmailError('password is required');
    }
    if (!senderEmail.includes('@')) {
      throw new EmailError('Invalid email format: senderEmail must contain @');
    }

    return {
      host: 'smtp.mail.yahoo.com',
      port: 587,
      secure: false,
      auth: {
        user: senderEmail,
        pass: password,
      },
    };
  }
}
