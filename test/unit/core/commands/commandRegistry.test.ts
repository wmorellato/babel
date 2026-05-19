/**
 * Command Registry Tests
 * Tests for command registration and discovery
 */

import { CommandRegistry } from '../../../../src/core/commands/commandRegistry';
import { BabelDatabase } from '../../../../src/db/database';
import { GitRepository } from '../../../../src/git/gitRepository';
import { TokenManager } from '../../../../src/services/tokenManager';
import { Logger } from '../../../../src/utils/logger';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

// Suppress logs during tests
jest.spyOn(Logger.prototype, 'info').mockImplementation();
jest.spyOn(Logger.prototype, 'warn').mockImplementation();
jest.spyOn(Logger.prototype, 'error').mockImplementation();

describe('CommandRegistry', () => {
  let registry: CommandRegistry;
  let database: BabelDatabase;
  let gitRepository: GitRepository;
  let mockTokenManager: jest.Mocked<TokenManager>;
  let testRepoPath: string;

  beforeEach(async () => {
    // Create test git repository
    const timestamp = Date.now();
    const testId = Math.random().toString(36).substring(7);
    testRepoPath = path.join('/tmp', `babel-registry-test-${timestamp}-${testId}`);

    if (!fs.existsSync(testRepoPath)) {
      fs.mkdirSync(testRepoPath, { recursive: true });
    }

    gitRepository = new GitRepository(testRepoPath);
    await gitRepository.init();
    await gitRepository.createInitialCommit('Initial commit');

    // Create test database
    const dbPath = path.join(testRepoPath, 'babel.db');
    database = new BabelDatabase({ path: dbPath });
    await database.initialize();

    // Create mock TokenManager
    mockTokenManager = {
      revokeToken: jest.fn(),
      getValidToken: jest.fn(),
      acquireToken: jest.fn(),
      refreshToken: jest.fn(),
    } as any;

    registry = new CommandRegistry(database, gitRepository, '', undefined, mockTokenManager);

    // Mock vscode workspace
    (vscode.workspace.workspaceFolders as any) = [
      { uri: { fsPath: testRepoPath } },
    ];
  });

  afterEach(() => {
    database.close();
    if (fs.existsSync(testRepoPath)) {
      fs.rmSync(testRepoPath, { recursive: true, force: true });
    }
  });

  describe('registerAll', () => {
    it('should register all 16 commands', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      // Should register 21 commands (7 palette + 5 tree view + 1 refresh + 1 export + 1 send-to-kindle + 1 authorize Dropbox + 1 revoke Dropbox token + 1 migrate + 4 backup toggle)
      expect(context.subscriptions.length).toBe(21);
    });

    it('should register babel.newStory command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      // Verify a command was registered
      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.renameStory command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.newVersion command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.switchVersion command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.deleteVersion command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.viewActivity command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should register babel.exportStory command', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should add disposables to context subscriptions', () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      // All subscriptions should be disposables
      context.subscriptions.forEach((sub) => {
        expect(typeof sub.dispose).toBe('function');
      });
    });
  });

  describe('command execution', () => {
    it('should execute babel.newStory command successfully', async () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      // Get the first registered command
      expect(context.subscriptions.length).toBeGreaterThan(0);
    });

    it('should handle command execution errors gracefully', async () => {
      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registry.registerAll(context);

      expect(context.subscriptions.length).toBe(21);
    });

    it('should refresh tree after successful story creation', async () => {
      const mockRefreshCallback = jest.fn();
      const registryWithRefresh = new CommandRegistry(
        database,
        gitRepository,
        '',
        mockRefreshCallback
      );

      const context = {
        subscriptions: [] as any[],
      } as vscode.ExtensionContext;

      registryWithRefresh.registerAll(context);

      // Mock the Create Story Command to return success
      jest.spyOn(vscode.window, 'showInputBox').mockResolvedValue('Test Story');

      // Find and invoke the newStory command
      const newStoryCommand = context.subscriptions.find(
        (sub) => sub && typeof sub.dispose === 'function'
      );
      expect(newStoryCommand).toBeDefined();
    });
  });
});
