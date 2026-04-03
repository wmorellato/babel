/**
 * Email Provider Tests
 */

import { GmailProvider, YahooProvider } from '../../../../src/services/email/emailProvider';
import { EmailError } from '../../../../src/utils/emailError';

describe('EmailProvider', () => {
  describe('GmailProvider', () => {
    const provider = new GmailProvider();

    it('should return correct SMTP config', () => {
      const config = provider.getSmtpConfig('test@gmail.com', 'password123');

      expect(config.host).toBe('smtp.gmail.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.auth.user).toBe('test@gmail.com');
      expect(config.auth.pass).toBe('password123');
    });

    it('should throw error if senderEmail is empty', () => {
      expect(() => provider.getSmtpConfig('', 'password123')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('', 'password123')).toThrow('senderEmail is required');
    });

    it('should throw error if password is empty', () => {
      expect(() => provider.getSmtpConfig('test@gmail.com', '')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('test@gmail.com', '')).toThrow('password is required');
    });

    it('should throw error if email format is invalid', () => {
      expect(() => provider.getSmtpConfig('invalid-email', 'password123')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('invalid-email', 'password123')).toThrow('Invalid email format');
    });

    it('should accept valid whitespace-trimmed emails', () => {
      const config = provider.getSmtpConfig('  test@gmail.com  ', 'password');
      expect(config.auth.user).toBe('  test@gmail.com  ');
    });
  });

  describe('YahooProvider', () => {
    const provider = new YahooProvider();

    it('should return correct SMTP config', () => {
      const config = provider.getSmtpConfig('test@yahoo.com', 'password456');

      expect(config.host).toBe('smtp.mail.yahoo.com');
      expect(config.port).toBe(587);
      expect(config.secure).toBe(false);
      expect(config.auth.user).toBe('test@yahoo.com');
      expect(config.auth.pass).toBe('password456');
    });

    it('should throw error if senderEmail is empty', () => {
      expect(() => provider.getSmtpConfig('', 'password456')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('', 'password456')).toThrow('senderEmail is required');
    });

    it('should throw error if password is empty', () => {
      expect(() => provider.getSmtpConfig('test@yahoo.com', '')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('test@yahoo.com', '')).toThrow('password is required');
    });

    it('should throw error if email format is invalid', () => {
      expect(() => provider.getSmtpConfig('invalid-email', 'password456')).toThrow(EmailError);
      expect(() => provider.getSmtpConfig('invalid-email', 'password456')).toThrow('Invalid email format');
    });
  });
});
