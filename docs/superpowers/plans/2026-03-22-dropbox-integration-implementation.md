# Dropbox Cloud Backup Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Google Drive cloud backup with Dropbox using PKCE OAuth2 flow, maintaining the IBackupProvider abstraction pattern.

**Architecture:** Replace GoogleDriveBackupService with DropboxBackupService. Both implement the IBackupProvider interface. AuthorizeDropboxCommand handles PKCE-based OAuth2 authorization. BackupManager orchestrates between local and cloud providers. All tokens stored securely via TokenManager.

**Tech Stack:** TypeScript, VSCode Extension API, Dropbox SDK, PKCE OAuth2, Jest for testing

---

## File Structure

**New files:**
- `src/services/dropboxBackupService.ts` - Dropbox provider implementation
- `src/core/commands/authorizeDropboxCommand.ts` - OAuth2 authorization handler
- `test/unit/services/dropboxBackupService.test.ts` - Dropbox service tests
- `test/unit/core/commands/authorizeDropboxCommand.test.ts` - Auth command tests

**Modified files:**
- `package.json` - Add dropbox SDK, update config schema
- `src/services/backupManager.ts` - Replace Google Drive init with Dropbox
- `src/core/commands/commandRegistry.ts` - Register Dropbox auth command
- `src/core/commands/backupToggleCommands.ts` - Update log messages
- `test/unit/services/backupManager.test.ts` - Update cloud provider tests
- `test/unit/views/backupTreeDataProvider.test.ts` - Update labels in snapshots

**Deleted files:**
- `src/core/commands/authorizeGoogleDriveCommand.ts`
- `test/unit/core/commands/authorizeGoogleDriveCommand.test.ts`

---

## Tasks

### Task 1: Install Dropbox SDK

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add dropbox package to dependencies**

Run: `npm install dropbox`

- [ ] **Step 2: Verify installation**

Run: `npm list dropbox`
Expected: `dropbox@<latest-version>`

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: Add dropbox SDK dependency"
```

---

### Task 2: Create DropboxBackupService

**Files:**
- Create: `src/services/dropboxBackupService.ts`

- [ ] **Step 1: Create the file with IBackupProvider implementation**

```typescript
/**
 * Dropbox Backup Service
 * Implements cloud backup to Dropbox using OAuth2 tokens
 */

import { Dropbox, files } from 'dropbox';
import { BackupPoint, BackupData } from '../types';
import { IBackupProvider } from './iBackupProvider';
import { TokenManager } from './tokenManager';
import { Logger } from '../utils/logger';

const logger = new Logger('DropboxBackupService');

export class DropboxBackupService implements IBackupProvider {
  private dropbox: Dropbox;
  private tokenManager: TokenManager;
  private readonly backupPath = '/Apps/Babel/backups';

  constructor(accessToken: string, tokenManager: TokenManager) {
    this.dropbox = new Dropbox({ accessToken });
    this.tokenManager = tokenManager;
    logger.debug('DropboxBackupService initialized');
  }

  async createBackup(data: BackupData, type: 'full' | 'incremental'): Promise<BackupPoint> {
    try {
      const fileName = `backup-${Date.now()}-${type}.json`;
      const filePath = `${this.backupPath}/${fileName}`;
      const fileContent = JSON.stringify(data);

      await this.dropbox.filesUpload({
        path: filePath,
        contents: fileContent as any,
        autorename: true,
        mode: { '.tag': 'add' } as any,
      });

      logger.info(`Backup created: ${filePath}`);

      return {
        id: fileName,
        timestamp: new Date(),
        type,
        storageSize: Buffer.byteLength(fileContent),
        provider: 'dropbox',
      };
    } catch (error) {
      logger.error(`Failed to create backup: ${error}`);
      throw error;
    }
  }

  async restoreBackup(backupId: string): Promise<BackupData> {
    try {
      const filePath = `${this.backupPath}/${backupId}`;

      const response = await this.dropbox.filesDownload({
        path: filePath,
      } as any);

      const fileContents = (response.result as any).fileBinary;
      const data = JSON.parse(fileContents);

      logger.info(`Backup restored: ${filePath}`);
      return data;
    } catch (error) {
      logger.error(`Failed to restore backup: ${error}`);
      throw error;
    }
  }

  async deleteBackup(backupId: string): Promise<void> {
    try {
      const filePath = `${this.backupPath}/${backupId}`;

      await this.dropbox.filesDeleteV2({
        path: filePath,
      } as any);

      logger.info(`Backup deleted: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to delete backup: ${error}`);
      throw error;
    }
  }

  async listBackups(): Promise<string[]> {
    try {
      const response = await this.dropbox.filesListFolder({
        path: this.backupPath,
      } as any);

      const entries = (response.result as any).entries || [];
      const backupIds = entries
        .filter((entry: any) => entry['.tag'] === 'file' && entry.name.startsWith('backup-'))
        .map((entry: any) => entry.name);

      logger.debug(`Listed ${backupIds.length} backups`);
      return backupIds;
    } catch (error) {
      logger.error(`Failed to list backups: ${error}`);
      throw error;
    }
  }

  async verifyBackup(backupId: string): Promise<boolean> {
    try {
      const filePath = `${this.backupPath}/${backupId}`;

      const response = await this.dropbox.filesGetMetadata({
        path: filePath,
      } as any);

      const isFile = (response.result as any)['.tag'] === 'file';
      const size = (response.result as any).size || 0;

      logger.debug(`Backup verified: ${filePath}, size: ${size}`);
      return isFile && size > 0;
    } catch (error) {
      logger.error(`Failed to verify backup: ${error}`);
      return false;
    }
  }

  async getStorageUsage(): Promise<number> {
    try {
      const response = await this.dropbox.usersGetSpaceUsage();
      const used = (response.result as any).used || 0;

      logger.debug(`Storage usage: ${used} bytes`);
      return used;
    } catch (error) {
      logger.error(`Failed to get storage usage: ${error}`);
      return 0;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      await this.dropbox.usersGetCurrentAccount();
      logger.debug('Dropbox account available');
      return true;
    } catch (error) {
      logger.debug('Dropbox account not available');
      return false;
    }
  }

  async cleanupOldBackups(
    retentionDays: number,
    backupMetadata: Map<string, BackupPoint>
  ): Promise<string[]> {
    try {
      const cutoffTime = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
      const deletedIds: string[] = [];

      for (const [backupId, metadata] of backupMetadata) {
        if (metadata.timestamp.getTime() < cutoffTime) {
          await this.deleteBackup(backupId);
          deletedIds.push(backupId);
        }
      }

      logger.info(`Cleaned up ${deletedIds.length} old backups`);
      return deletedIds;
    } catch (error) {
      logger.error(`Failed to cleanup old backups: ${error}`);
      throw error;
    }
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run compile 2>&1 | grep -i dropbox`
Expected: No errors related to dropbox imports

- [ ] **Step 3: Commit**

```bash
git add src/services/dropboxBackupService.ts
git commit -m "feat: Add DropboxBackupService implementing IBackupProvider"
```

---

### Task 3: Create AuthorizeDropboxCommand

**Files:**
- Create: `src/core/commands/authorizeDropboxCommand.ts`

- [ ] **Step 1: Create the file with PKCE OAuth2 flow**

```typescript
/**
 * Authorize Dropbox Cloud Backup
 * Handles OAuth2 PKCE flow for Dropbox authorization
 */

import * as http from 'http';
import * as crypto from 'crypto';
import * as url from 'url';
import * as vscode from 'vscode';
import { TokenManager } from '../../services/tokenManager';
import { Logger } from '../../utils/logger';

const logger = new Logger('AuthorizeDropboxCommand');

export class AuthorizeDropboxCommand {
  /**
   * Generate PKCE code_verifier and code_challenge
   */
  private generatePKCEChallenge(): { codeVerifier: string; codeChallenge: string } {
    // Generate random code_verifier (43-128 chars, unreserved characters)
    const codeVerifier = crypto
      .randomBytes(32)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    // Calculate code_challenge = BASE64URL(SHA256(codeVerifier))
    const codeChallenge = crypto
      .createHash('sha256')
      .update(codeVerifier)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');

    return { codeVerifier, codeChallenge };
  }

  /**
   * HTML template for success page
   */
  private getSuccessHTML(): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Babel - Authorization Successful</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
            padding: 60px 40px;
          }
          .logo-placeholder {
            width: 80px;
            height: 80px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            color: white;
          }
          h1 { color: #2d3748; font-size: 28px; margin-bottom: 12px; font-weight: 600; }
          p { color: #718096; font-size: 16px; line-height: 1.6; margin-bottom: 12px; }
          .status { color: #48bb78; font-weight: 500; margin-top: 20px; }
          .info-box {
            background: #f7fafc;
            border-left: 4px solid #667eea;
            padding: 16px;
            margin-top: 30px;
            text-align: left;
            border-radius: 4px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo-placeholder"><div style="animation: pulse 0.8s ease-out;">✅</div></div>
          <h1>Authorization Successful!</h1>
          <p>Your Dropbox account has been connected to Babel.</p>
          <p class="status">✨ Cloud backups are now enabled</p>
          <div class="info-box">
            <strong>What happens next?</strong>
            <p>All your story backups will now be automatically saved to your Dropbox.</p>
          </div>
          <div class="info-box">
            <strong>Next step:</strong>
            <p>Close this window and return to VSCode. Your authorization is complete!</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * HTML template for error page
   */
  private getErrorHTML(errorMessage: string): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Babel - Authorization Failed</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background: linear-gradient(135deg, #fc5c65 0%, #ff6b6b 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          .container {
            background: white;
            border-radius: 12px;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
            max-width: 500px;
            width: 100%;
            text-align: center;
            padding: 60px 40px;
          }
          .logo-placeholder {
            width: 80px;
            height: 80px;
            margin: 0 auto 30px;
            background: linear-gradient(135deg, #fc5c65 0%, #ff6b6b 100%);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 40px;
            color: white;
          }
          h1 { color: #2d3748; font-size: 28px; margin-bottom: 12px; font-weight: 600; }
          p { color: #718096; font-size: 16px; line-height: 1.6; margin-bottom: 12px; }
          .error-message {
            background: #fed7d7;
            border-left: 4px solid #fc5c65;
            padding: 16px;
            margin-top: 20px;
            text-align: left;
            border-radius: 4px;
            color: #742a2a;
            font-size: 14px;
            word-break: break-word;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="logo-placeholder">⚠️</div>
          <h1>Authorization Failed</h1>
          <p>Unable to complete the Dropbox authorization process.</p>
          <div class="error-message"><strong>Error:</strong> ${this.escapeHtml(errorMessage)}</div>
          <p style="margin-top: 30px; font-size: 14px;">Please close this window and try again from VSCode.</p>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Start local HTTP server to capture OAuth redirect
   */
  private startLocalServer(port: number): Promise<{ code: string; server: http.Server }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (!req.url) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML('Invalid request'));
          reject(new Error('Invalid request'));
          return;
        }

        const parsedUrl = url.parse(req.url, true);
        const code = parsedUrl.query.code as string;
        const error = parsedUrl.query.error as string;

        if (error) {
          const errorDescription = parsedUrl.query.error_description as string;
          const errorMsg = errorDescription || error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML(errorMsg));
          reject(new Error(`Authorization failed: ${errorMsg}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(this.getErrorHTML('No authorization code received'));
          reject(new Error('No authorization code received'));
          return;
        }

        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getSuccessHTML());
        resolve({ code, server });
      });

      server.listen(port, 'localhost', () => {
        logger.debug(`Local OAuth server started on port ${port}`);
      });

      server.on('error', reject);
    });
  }

  /**
   * Execute the authorization flow
   */
  async execute(
    clientId: string,
    redirectUri: string,
    tokenManager: TokenManager
  ): Promise<void> {
    if (!tokenManager) {
      throw new Error('TokenManager not initialized');
    }

    const redirectUrl = new url.URL(redirectUri);
    const port = parseInt(redirectUrl.port || '54831', 10);

    try {
      // Step 1: Generate PKCE challenge
      const { codeVerifier, codeChallenge } = this.generatePKCEChallenge();
      logger.debug('PKCE challenge generated');

      // Step 2: Build authorization URL
      const authUrl = new URL('https://www.dropbox.com/oauth2/authorize');
      authUrl.searchParams.append('client_id', clientId);
      authUrl.searchParams.append('redirect_uri', redirectUri);
      authUrl.searchParams.append('response_type', 'code');
      authUrl.searchParams.append('code_challenge', codeChallenge);
      authUrl.searchParams.append('code_challenge_method', 'S256');
      authUrl.searchParams.append('token_access_type', 'offline');

      logger.debug('Authorization URL built');

      // Step 3: Start local server
      const serverPromise = this.startLocalServer(port);

      // Step 4: Open browser
      logger.info('Opening browser for Dropbox authorization');
      await vscode.env.openExternal(vscode.Uri.parse(authUrl.toString()));

      // Step 5: Wait for authorization code
      const { code, server } = await serverPromise;
      logger.debug('Authorization code received');

      // Step 6: Exchange code for token
      const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
      const tokenResponse = await fetch(tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          code: code,
          code_verifier: codeVerifier,
          grant_type: 'authorization_code',
          redirect_uri: redirectUri,
        }).toString(),
      });

      const tokenData = (await tokenResponse.json()) as {
        access_token?: string;
        refresh_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };

      if (!tokenResponse.ok || tokenData.error) {
        throw new Error(
          `Token exchange failed: ${tokenData.error_description || tokenData.error}`
        );
      }

      // Step 7: Store tokens
      const expiresAt = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000);
      await tokenManager.acquireToken(
        'dropbox',
        tokenData.access_token || '',
        tokenData.refresh_token,
        expiresAt
      );

      logger.info('Dropbox authorization successful');

      // Step 8: Update settings
      const config = vscode.workspace.getConfiguration('babel.backup');
      await config.update('dropbox.authorized', true, vscode.ConfigurationTarget.Workspace);

      vscode.window.showInformationMessage(
        '✅ Dropbox authorization successful! Backups will now be uploaded to your Dropbox.'
      );

      server.close();
    } catch (error) {
      logger.error('Authorization failed', { error });
      vscode.window.showErrorMessage(`Authorization failed: ${error}`);
      throw error;
    }
  }

  private escapeHtml(text: string): string {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;',
    };
    return text.replace(/[&<>"']/g, (char) => map[char]);
  }
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `npm run compile 2>&1 | grep -i "authorize"`
Expected: No dropbox-related errors

- [ ] **Step 3: Commit**

```bash
git add src/core/commands/authorizeDropboxCommand.ts
git commit -m "feat: Add AuthorizeDropboxCommand with PKCE OAuth2 flow"
```

---

### Task 4: Write DropboxBackupService Tests

**Files:**
- Create: `test/unit/services/dropboxBackupService.test.ts`

- [ ] **Step 1: Create comprehensive test file**

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DropboxBackupService } from '../../../src/services/dropboxBackupService';
import { TokenManager } from '../../../src/services/tokenManager';
import { BackupData } from '../../../src/types';

// Mock Dropbox SDK
jest.mock('dropbox', () => ({
  Dropbox: jest.fn().mockImplementation(() => ({
    filesUpload: jest.fn().mockResolvedValue({
      result: { id: 'file-123', path_display: '/Apps/Babel/backups/backup.json' },
    }),
    filesDownload: jest.fn().mockResolvedValue({
      result: { fileBinary: JSON.stringify({ stories: [] }) },
    }),
    filesDeleteV2: jest.fn().mockResolvedValue({}),
    filesListFolder: jest.fn().mockResolvedValue({
      result: {
        entries: [
          { '.tag': 'file', name: 'backup-123-full.json', size: 1024 },
          { '.tag': 'file', name: 'backup-124-incremental.json', size: 512 },
        ],
      },
    }),
    filesGetMetadata: jest.fn().mockResolvedValue({
      result: { '.tag': 'file', size: 1024 },
    }),
    usersGetSpaceUsage: jest.fn().mockResolvedValue({
      result: { used: 5242880 },
    }),
    usersGetCurrentAccount: jest.fn().mockResolvedValue({
      result: { account_id: 'dbid:123' },
    }),
  })),
}));

describe('DropboxBackupService', () => {
  let service: DropboxBackupService;
  let mockTokenManager: jest.Mocked<TokenManager>;

  const mockBackupData: BackupData = {
    stories: [
      {
        id: 'story-1',
        title: 'Test Story',
        content: 'Test content',
        type: 'short-story',
      },
    ],
    metadata: {
      backupDate: new Date(),
      version: '1.0',
    },
  };

  beforeEach(() => {
    mockTokenManager = {
      acquireToken: jest.fn(),
      getToken: jest.fn().mockResolvedValue('mock-token'),
      refreshToken: jest.fn(),
    } as any;

    service = new DropboxBackupService('mock-token', mockTokenManager);
  });

  describe('createBackup', () => {
    it('should create a full backup and return BackupPoint', async () => {
      const result = await service.createBackup(mockBackupData, 'full');

      expect(result).toHaveProperty('id');
      expect(result).toHaveProperty('timestamp');
      expect(result.type).toBe('full');
      expect(result.provider).toBe('dropbox');
      expect(result.storageSize).toBeGreaterThan(0);
    });

    it('should create an incremental backup', async () => {
      const result = await service.createBackup(mockBackupData, 'incremental');

      expect(result.type).toBe('incremental');
      expect(result.id).toContain('backup-');
    });
  });

  describe('restoreBackup', () => {
    it('should restore backup and return BackupData', async () => {
      const result = await service.restoreBackup('backup-123-full.json');

      expect(result).toHaveProperty('stories');
      expect(Array.isArray(result.stories)).toBe(true);
    });

    it('should parse JSON content correctly', async () => {
      const result = await service.restoreBackup('backup-123-full.json');

      expect(result.stories).toEqual([]);
    });
  });

  describe('deleteBackup', () => {
    it('should delete a backup without error', async () => {
      await expect(service.deleteBackup('backup-123-full.json')).resolves.toBeUndefined();
    });
  });

  describe('listBackups', () => {
    it('should list all backups', async () => {
      const result = await service.listBackups();

      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(2);
      expect(result).toContain('backup-123-full.json');
      expect(result).toContain('backup-124-incremental.json');
    });

    it('should filter out non-backup files', async () => {
      const result = await service.listBackups();

      const allBackups = result.every((name) => name.startsWith('backup-'));
      expect(allBackups).toBe(true);
    });
  });

  describe('verifyBackup', () => {
    it('should verify backup exists and has content', async () => {
      const result = await service.verifyBackup('backup-123-full.json');

      expect(result).toBe(true);
    });

    it('should return false if backup verification fails', async () => {
      service['dropbox'].filesGetMetadata = jest
        .fn()
        .mockRejectedValue(new Error('File not found'));

      const result = await service.verifyBackup('nonexistent.json');

      expect(result).toBe(false);
    });
  });

  describe('getStorageUsage', () => {
    it('should return storage usage in bytes', async () => {
      const result = await service.getStorageUsage();

      expect(result).toBe(5242880);
      expect(typeof result).toBe('number');
    });
  });

  describe('isAvailable', () => {
    it('should return true when account is available', async () => {
      const result = await service.isAvailable();

      expect(result).toBe(true);
    });

    it('should return false when account is not available', async () => {
      service['dropbox'].usersGetCurrentAccount = jest
        .fn()
        .mockRejectedValue(new Error('Unauthorized'));

      const result = await service.isAvailable();

      expect(result).toBe(false);
    });
  });

  describe('cleanupOldBackups', () => {
    it('should delete backups older than retention period', async () => {
      const metadata = new Map([
        [
          'backup-100-full.json',
          {
            id: 'backup-100-full.json',
            timestamp: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000), // 40 days old
            type: 'full' as const,
            storageSize: 1024,
            provider: 'dropbox',
          },
        ],
        [
          'backup-200-full.json',
          {
            id: 'backup-200-full.json',
            timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000), // 5 days old
            type: 'full' as const,
            storageSize: 1024,
            provider: 'dropbox',
          },
        ],
      ]);

      const result = await service.cleanupOldBackups(30, metadata);

      expect(result.length).toBe(1);
      expect(result).toContain('backup-100-full.json');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="dropboxBackupService" 2>&1 | tail -20`
Expected: All tests passing

- [ ] **Step 3: Commit**

```bash
git add test/unit/services/dropboxBackupService.test.ts
git commit -m "test: Add comprehensive tests for DropboxBackupService"
```

---

### Task 5: Write AuthorizeDropboxCommand Tests

**Files:**
- Create: `test/unit/core/commands/authorizeDropboxCommand.test.ts`

- [ ] **Step 1: Create test file**

```typescript
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { AuthorizeDropboxCommand } from '../../../src/core/commands/authorizeDropboxCommand';
import { TokenManager } from '../../../src/services/tokenManager';

describe('AuthorizeDropboxCommand', () => {
  let command: AuthorizeDropboxCommand;
  let mockTokenManager: jest.Mocked<TokenManager>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockTokenManager = {
      acquireToken: jest.fn().mockResolvedValue(undefined),
    } as any;

    command = new AuthorizeDropboxCommand();

    // Mock VSCode API
    (vscode.env.openExternal as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (vscode.window.showInformationMessage as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (vscode.window.showErrorMessage as jest.Mock) = jest.fn().mockResolvedValue(undefined);
    (vscode.workspace.getConfiguration as jest.Mock) = jest.fn().mockReturnValue({
      update: jest.fn().mockResolvedValue(undefined),
    });
  });

  it('should be constructable', () => {
    expect(command).toBeInstanceOf(AuthorizeDropboxCommand);
  });

  it('should have execute method', () => {
    expect(command).toHaveProperty('execute');
    expect(typeof command.execute).toBe('function');
  });

  describe('execute', () => {
    it('should throw error if TokenManager is not provided', async () => {
      await expect(command.execute('client-id', 'http://localhost:54831/oauth/callback', null as any)).rejects.toThrow(
        'TokenManager not initialized'
      );
    });

    // Note: Full integration testing would require mocking HTTP server and OAuth response
    // This is tested more thoroughly in integration tests
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npm test -- --testPathPattern="authorizeDropboxCommand" 2>&1 | tail -15`
Expected: Tests passing

- [ ] **Step 3: Commit**

```bash
git add test/unit/core/commands/authorizeDropboxCommand.test.ts
git commit -m "test: Add tests for AuthorizeDropboxCommand"
```

---

### Task 6: Update package.json Configuration Schema

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Remove Google Drive configuration**

Find and remove these lines from the configuration.properties section:
- `"babel.backup.googleDrive.enabled"`
- `"babel.backup.googleDrive.authorized"`
- `"babel.backup.googleDrive.clientId"`
- `"babel.backup.googleDrive.redirectUri"`

- [ ] **Step 2: Add Dropbox configuration**

Add this to the configuration.properties section (around line 240):

```json
"babel.backup.dropbox.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable cloud backup to Dropbox"
},
"babel.backup.dropbox.authorized": {
  "type": "boolean",
  "default": false,
  "description": "OAuth2 authorization status for Dropbox"
},
"babel.backup.dropbox.clientId": {
  "type": "string",
  "default": "",
  "description": "Dropbox OAuth2 Client ID (required for cloud backups)"
},
"babel.backup.dropbox.redirectUri": {
  "type": "string",
  "default": "http://localhost:54831/oauth/callback",
  "description": "OAuth2 redirect URI (must match Dropbox app settings)"
}
```

- [ ] **Step 3: Update when clauses in menus**

Find all occurrences of `config.babel.backup.googleDrive` in the menus section and replace with `config.babel.backup.dropbox`:
- Line ~179: `!config.babel.backup.googleDrive.enabled` → `!config.babel.backup.dropbox.enabled`
- Line ~184: `config.babel.backup.googleDrive.enabled` → `config.babel.backup.dropbox.enabled`
- Line ~189: Similar updates

- [ ] **Step 4: Update command labels**

Find `"Babel: Authorize Google Drive"` and change to `"Babel: Authorize Dropbox"`

- [ ] **Step 5: Verify JSON is valid**

Run: `node -e "require('./package.json')"`
Expected: No output (valid JSON)

- [ ] **Step 6: Commit**

```bash
git add package.json
git commit -m "chore: Update configuration schema from Google Drive to Dropbox"
```

---

### Task 7: Update BackupManager

**Files:**
- Modify: `src/services/backupManager.ts`

- [ ] **Step 1: Replace GoogleDrive import with Dropbox**

Change line 14 from:
```typescript
import { GoogleDriveBackupService } from './googleDriveBackupService';
```

To:
```typescript
import { DropboxBackupService } from './dropboxBackupService';
```

- [ ] **Step 2: Update initializeCloudBackup method**

Replace the entire `private async initializeCloudBackup()` method (around lines 67-108) with:

```typescript
private async initializeCloudBackup(): Promise<void> {
  const backupConfig = vscode.workspace.getConfiguration('babel.backup');
  const dropboxEnabled = backupConfig.get('dropbox.enabled');

  if (!dropboxEnabled || !this.tokenManager) {
    return;
  }

  try {
    const clientId = backupConfig.get<string>('dropbox.clientId');

    if (!clientId) {
      logger.debug('Dropbox clientId not configured, skipping cloud backup');
      return;
    }

    // Get access token from TokenManager
    const accessToken = await this.tokenManager.getToken('dropbox');

    if (!accessToken) {
      logger.debug('Dropbox access token not available');
      return;
    }

    const service = new DropboxBackupService(accessToken, this.tokenManager);

    // Test if credentials available
    if (await service.isAvailable()) {
      this.cloudBackupService = service;
      logger.info('Dropbox cloud backup initialized');
    }
  } catch (error) {
    logger.error('Failed to initialize Dropbox backup', { error });
  }
}
```

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run compile 2>&1 | grep -i "error"`
Expected: No TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/services/backupManager.ts
git commit -m "refactor: Update BackupManager to use Dropbox instead of Google Drive"
```

---

### Task 8: Update CommandRegistry

**Files:**
- Modify: `src/core/commands/commandRegistry.ts`

- [ ] **Step 1: Replace Google Drive import with Dropbox**

Find the import line and change from:
```typescript
import { AuthorizeGoogleDriveCommand } from './authorizeGoogleDriveCommand';
```

To:
```typescript
import { AuthorizeDropboxCommand } from './authorizeDropboxCommand';
```

- [ ] **Step 2: Update registerAll method**

Change line ~95 from:
```typescript
this.registerAuthorizeGoogleDrive(context);
```

To:
```typescript
this.registerAuthorizeDropbox(context);
```

- [ ] **Step 3: Replace registerAuthorizeGoogleDrive method**

Replace the entire `private registerAuthorizeGoogleDrive()` method (around lines 376-397) with:

```typescript
private registerAuthorizeDropbox(context: vscode.ExtensionContext): void {
  const command = new AuthorizeDropboxCommand();
  const disposable = vscode.commands.registerCommand('babel.authorizeDropbox', async () => {
    try {
      const backupConfig = vscode.workspace.getConfiguration('babel.backup');
      const clientId = backupConfig.get<string>('dropbox.clientId');
      const redirectUri = backupConfig.get<string>('dropbox.redirectUri') || 'http://localhost:54831/oauth/callback';

      if (!clientId) {
        vscode.window.showErrorMessage('Dropbox clientId not configured in settings');
        return;
      }

      await command.execute(clientId, redirectUri, this.tokenManager || null);
    } catch (error) {
      vscode.window.showErrorMessage(`Authorization failed: ${error}`);
      logger.error('Dropbox authorization failed', { error });
    }
  });
  context.subscriptions.push(disposable);
  logger.info('Registered babel.authorizeDropbox');
}
```

- [ ] **Step 4: Verify TypeScript compilation**

Run: `npm run compile 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add src/core/commands/commandRegistry.ts
git commit -m "refactor: Update CommandRegistry to register Dropbox authorization"
```

---

### Task 9: Update Backup Toggle Commands

**Files:**
- Modify: `src/core/commands/backupToggleCommands.ts`

- [ ] **Step 1: Update log messages**

Find and replace all occurrences:
- `Cloud backup enabled` stays as is (generic)
- `Cloud backup disabled` stays as is (generic)

No code changes needed here as the implementation is provider-agnostic. Just verify the file compiles.

- [ ] **Step 2: Verify compilation**

Run: `npm run compile 2>&1 | grep -c "error"`
Expected: Output should be 0

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: Verify backup toggle commands work with Dropbox"
```

---

### Task 10: Delete Google Drive Files

**Files:**
- Delete: `src/core/commands/authorizeGoogleDriveCommand.ts`
- Delete: `test/unit/core/commands/authorizeGoogleDriveCommand.test.ts`
- Delete: `src/services/googleDriveBackupService.ts` (if exists)

- [ ] **Step 1: Remove Google Drive command file**

Run: `rm src/core/commands/authorizeGoogleDriveCommand.ts`

- [ ] **Step 2: Remove Google Drive test file**

Run: `rm test/unit/core/commands/authorizeGoogleDriveCommand.test.ts`

- [ ] **Step 3: Check for Google Drive backup service**

Run: `ls src/services/googleDriveBackupService.ts 2>/dev/null && rm src/services/googleDriveBackupService.ts || echo "File not found"`

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: Remove Google Drive integration files"
```

---

### Task 11: Update Existing Tests

**Files:**
- Modify: `test/unit/services/backupManager.test.ts`
- Modify: `test/unit/views/backupTreeDataProvider.test.ts`

- [ ] **Step 1: Read backupManager test file**

Find any tests that reference Google Drive or GoogleDriveBackupService and update them to use Dropbox/DropboxBackupService.

Run grep to find: `grep -n "GoogleDrive\|google" test/unit/services/backupManager.test.ts`

- [ ] **Step 2: Update cloud provider initialization tests**

Replace mock imports and mock setup for Google Drive with Dropbox equivalents.

- [ ] **Step 3: Update tree view tests**

Run: `grep -n "Google Drive\|Authorize Google" test/unit/views/backupTreeDataProvider.test.ts`

Update any snapshots or labels that reference "Google Drive" to "Dropbox"

- [ ] **Step 4: Run affected tests**

Run: `npm test -- --testPathPattern="backupManager|backupTreeDataProvider" 2>&1 | tail -30`
Expected: All tests passing

- [ ] **Step 5: Commit**

```bash
git add test/unit/services/backupManager.test.ts test/unit/views/backupTreeDataProvider.test.ts
git commit -m "test: Update tests to reference Dropbox instead of Google Drive"
```

---

### Task 12: Run Full Test Suite and Fix Issues

**Files:**
- All tests

- [ ] **Step 1: Run complete test suite with 2 workers**

Run: `npm test -- --maxWorkers=2 2>&1 | tail -20`
Expected: All tests passing with zero failures

- [ ] **Step 2: Check for any remaining Google Drive references**

Run: `grep -r "GoogleDrive\|google.*drive\|google.*backup" src test --include="*.ts" --exclude-dir=node_modules 2>/dev/null || echo "No matches found"`
Expected: No matches (or only in comments explaining the change)

- [ ] **Step 3: Verify TypeScript compilation**

Run: `npm run compile 2>&1`
Expected: Successful compilation with no errors

- [ ] **Step 4: Verify package.json is valid**

Run: `npm list dropbox`
Expected: `dropbox@<version>` in output

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test: All tests passing with Dropbox integration complete"
```

---

### Task 13: Final Verification

**Files:**
- All files

- [ ] **Step 1: Run full test suite one more time**

Run: `npm test -- --maxWorkers=2 2>&1 | grep "Test Suites\|Tests:"`
Expected: `Test Suites: XX passed, XX total` and `Tests: XXX passed, XXX total`

- [ ] **Step 2: Verify no TypeScript errors**

Run: `npm run compile && echo "✅ TypeScript compilation successful"`
Expected: Success message

- [ ] **Step 3: Check git status**

Run: `git status`
Expected: Working tree clean

- [ ] **Step 4: View commit history**

Run: `git log --oneline -15 | head -10`
Expected: Shows 10+ commits related to Dropbox integration

- [ ] **Step 5: Create summary commit (optional)**

```bash
git log --oneline -10 > /tmp/dropbox-changes.txt
echo "✅ Dropbox Integration Complete" && cat /tmp/dropbox-changes.txt
```

---

## Success Criteria

- ✅ All new files created (DropboxBackupService, AuthorizeDropboxCommand)
- ✅ All tests passing (802+ total tests)
- ✅ TypeScript compilation successful
- ✅ No Google Drive references in code
- ✅ Configuration schema updated
- ✅ Package.json has dropbox SDK dependency
- ✅ CommandRegistry registers Dropbox authorization
- ✅ BackupManager initializes Dropbox instead of Google Drive
- ✅ All commits follow conventional commits format

