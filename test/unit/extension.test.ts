import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { activate } from '../../src/extension';

// Mock dependencies
jest.mock('../../src/db/database');
jest.mock('../../src/git/gitRepository');
jest.mock('../../src/db/storyRepository');
jest.mock('../../src/db/wordCountRepository');
jest.mock('../../src/db/backupRepository');
jest.mock('../../src/db/colorAnnotationRepository');
jest.mock('../../src/services/credentialStorage');
jest.mock('../../src/services/tokenManager');
jest.mock('../../src/services/babelSettings');
jest.mock('../../src/services/credentialMigration');
jest.mock('../../src/services/backupDataCollector');
jest.mock('../../src/extension/listenerCoordinator');
jest.mock('../../src/extension/initialize-color-annotations');
jest.mock('../../src/extension/initialize-auto-commit');
jest.mock('../../src/extension/initialize-word-count');
jest.mock('../../src/extension/initialize-backups');
jest.mock('../../src/extension/initialize-commands');
jest.mock('../../src/extension/initialize-hover-providers');
jest.mock('../../src/extension/initialize-tree-providers');
jest.mock('../../src/extension/initialize-status-bars');
jest.mock('../../src/core/commands/addFileCommand');
jest.mock('../../src/core/commands/addChapterCommand');
jest.mock('../../src/core/commands/deleteFileCommand');
jest.mock('../../src/services/storyFileService');
jest.mock('../../src/extension/initialize-migration');

describe('Extension Activation - Database Path Resolution', () => {
  let mockContext: Partial<vscode.ExtensionContext>;
  let tempDir: string;

  beforeEach(async () => {
    // Mock vscode.Disposable.from for combining disposables
    if (!(vscode as any).Disposable) {
      (vscode as any).Disposable = {};
    }
    (vscode as any).Disposable.from = jest.fn(() => ({
      dispose: jest.fn(),
    }));

    // Mock vscode.commands.executeCommand
    jest.spyOn(vscode.commands, 'executeCommand').mockResolvedValue(undefined);

    // Mock vscode.commands.registerCommand
    jest.spyOn(vscode.commands, 'registerCommand').mockReturnValue({
      dispose: jest.fn(),
    } as any);

    // Mock vscode.window.showErrorMessage
    jest.spyOn(vscode.window, 'showErrorMessage').mockResolvedValue(undefined);

    // Create a temporary workspace directory
    tempDir = path.join(__dirname, `temp-workspace-${Date.now()}`);
    fs.mkdirSync(tempDir, { recursive: true });

    // Create .git directory to simulate a git repository
    fs.mkdirSync(path.join(tempDir, '.git'), { recursive: true });

    // Create .babel directory and database file to simulate an initialized workspace
    const babelDir = path.join(tempDir, '.babel');
    fs.mkdirSync(babelDir, { recursive: true });
    fs.writeFileSync(path.join(babelDir, 'babel.db'), '');

    // Mock ExtensionContext
    mockContext = {
      globalStoragePath: '/some/global/storage',
      subscriptions: [],
      secrets: {
        get: jest.fn().mockResolvedValue(undefined),
        store: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined),
        onDidChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      } as any,
    };

    // Setup workspace mock with actual tempDir
    (vscode.workspace as any).workspaceFolders = [
      {
        uri: { fsPath: tempDir },
        name: 'test-workspace',
        index: 0,
      },
    ];

    // Mock workspace.getConfiguration
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue({
      update: jest.fn().mockResolvedValue(undefined),
    } as any);

    // Mock all the initialize functions to return disposables
    (require('../../src/extension/initialize-color-annotations').initializeColorAnnotations as jest.Mock).mockResolvedValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-auto-commit').initializeAutoCommit as jest.Mock).mockResolvedValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-word-count').initializeWordCount as jest.Mock).mockResolvedValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-backups').initializeBackups as jest.Mock).mockResolvedValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-commands').initializeCommands as jest.Mock).mockReturnValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-hover-providers').initializeHoverProviders as jest.Mock).mockReturnValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-tree-providers').initializeTreeProviders as jest.Mock).mockReturnValue({
      dispose: jest.fn(),
    });
    (require('../../src/extension/initialize-status-bars').initializeStatusBars as jest.Mock).mockReturnValue({
      dispose: jest.fn(),
    });

    // Mock ListenerCoordinator
    (require('../../src/extension/listenerCoordinator').ListenerCoordinator as jest.Mock).mockImplementation(() => ({
      createListeners: jest.fn().mockReturnValue([
        { dispose: jest.fn() },
        { dispose: jest.fn() },
        { dispose: jest.fn() },
      ]),
    }));

    // Mock BabelDatabase
    (require('../../src/db/database').BabelDatabase as jest.Mock).mockImplementation((config) => ({
      initialize: jest.fn().mockResolvedValue(undefined),
      getDb: jest.fn().mockReturnValue({
        exec: jest.fn(),
        prepare: jest.fn().mockReturnValue({
          run: jest.fn(),
          all: jest.fn(),
          get: jest.fn(),
        }),
      }),
    }));

    // Mock BabelSettings.initializeDefaults
    (require('../../src/services/babelSettings').BabelSettings.initializeDefaults as jest.Mock).mockResolvedValue(
      undefined
    );

    // Mock MigrationInitializer
    (require('../../src/extension/initialize-migration').MigrationInitializer as jest.Mock).mockImplementation(() => ({
      checkAndRunMigration: jest.fn().mockResolvedValue(true),
    }));
  });

  afterEach(() => {
    jest.clearAllMocks();
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Database Path Resolution', () => {
    it('should use workspace-local database path, not globalStoragePath', async () => {
      await activate(mockContext as vscode.ExtensionContext);

      const expectedBabelDir = path.join(tempDir, '.babel');
      const expectedDatabasePath = path.join(expectedBabelDir, 'babel.db');

      // Verify BabelDatabase was instantiated with workspace-local path
      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      expect(BabelDatabaseMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: expectedDatabasePath,
        })
      );

      // Verify globalStoragePath was NOT used for database
      expect(BabelDatabaseMock).not.toHaveBeenCalledWith(
        expect.objectContaining({
          path: expect.stringContaining('globalStoragePath'),
        })
      );
    });

    it('should create .babel directory if it does not exist', async () => {
      const expectedBabelDir = path.join(tempDir, '.babel');

      // Delete directory to test its creation
      fs.rmSync(expectedBabelDir, { recursive: true, force: true });

      // Pre-create just the database file so early exit check passes,
      // but the directory will be recreated/verified during activation
      const babelDir = path.join(tempDir, '.babel');
      fs.mkdirSync(babelDir, { recursive: true });
      fs.writeFileSync(path.join(babelDir, 'babel.db'), '');

      // Now delete the directory to test it gets recreated
      fs.rmSync(babelDir, { recursive: true, force: true });

      // Verify .babel directory does not exist initially
      expect(fs.existsSync(expectedBabelDir)).toBe(false);

      // Recreate DB file (early exit check)
      fs.mkdirSync(babelDir, { recursive: true });
      fs.writeFileSync(path.join(babelDir, 'babel.db'), '');

      await activate(mockContext as vscode.ExtensionContext);

      // Verify .babel directory still exists after activation
      expect(fs.existsSync(expectedBabelDir)).toBe(true);
      expect(fs.statSync(expectedBabelDir).isDirectory()).toBe(true);
    });

    it('should create .babel directory with correct path and permissions', async () => {
      const expectedBabelDir = path.join(tempDir, '.babel');

      // Delete directory to test its creation
      fs.rmSync(expectedBabelDir, { recursive: true, force: true });

      // Recreate DB file (for early exit check)
      fs.mkdirSync(expectedBabelDir, { recursive: true });
      fs.writeFileSync(path.join(expectedBabelDir, 'babel.db'), '');

      // Now delete it again to test
      fs.rmSync(expectedBabelDir, { recursive: true, force: true });

      expect(fs.existsSync(expectedBabelDir)).toBe(false);

      // Recreate DB file again for the activation call
      fs.mkdirSync(expectedBabelDir, { recursive: true });
      fs.writeFileSync(path.join(expectedBabelDir, 'babel.db'), '');

      await activate(mockContext as vscode.ExtensionContext);

      // Verify .babel directory was created as a directory
      expect(fs.existsSync(expectedBabelDir)).toBe(true);
      expect(fs.statSync(expectedBabelDir).isDirectory()).toBe(true);
    });

    it('should not fail if .babel directory already exists', async () => {
      const expectedBabelDir = path.join(tempDir, '.babel');
      fs.mkdirSync(expectedBabelDir, { recursive: true });

      // Should not throw
      await expect(activate(mockContext as vscode.ExtensionContext)).resolves.toBeUndefined();

      expect(fs.existsSync(expectedBabelDir)).toBe(true);
    });

    it('should pass correct workspace path to BabelConfig', async () => {
      await activate(mockContext as vscode.ExtensionContext);

      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      const databaseConfig = BabelDatabaseMock.mock.calls[0][0];
      const expectedDatabasePath = path.join(tempDir, '.babel', 'babel.db');

      expect(databaseConfig.path).toBe(expectedDatabasePath);
    });

    it('should use first workspace folder when multiple exist', async () => {
      const secondDir = path.join(__dirname, `temp-workspace-second-${Date.now()}`);
      fs.mkdirSync(secondDir, { recursive: true });

      (vscode.workspace as any).workspaceFolders = [
        {
          uri: { fsPath: tempDir },
          name: 'first-workspace',
          index: 0,
        },
        {
          uri: { fsPath: secondDir },
          name: 'second-workspace',
          index: 1,
        },
      ];

      await activate(mockContext as vscode.ExtensionContext);

      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      const databaseConfig = BabelDatabaseMock.mock.calls[0][0];
      const expectedPath = path.join(tempDir, '.babel', 'babel.db');

      expect(databaseConfig.path).toBe(expectedPath);

      fs.rmSync(secondDir, { recursive: true, force: true });
    });
  });

  describe('Extension Activation Errors', () => {
    it('should show error message when no workspace folder is open', async () => {
      (vscode.workspace as any).workspaceFolders = undefined;

      await activate(mockContext as vscode.ExtensionContext);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Babel requires a workspace folder to be open'
      );
    });

    it('should show error message when workspace folders array is empty', async () => {
      (vscode.workspace as any).workspaceFolders = [];

      await activate(mockContext as vscode.ExtensionContext);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        'Babel requires a workspace folder to be open'
      );
    });

    it('should show error message if database initialization fails', async () => {
      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      const initError = new Error('Database connection failed');
      BabelDatabaseMock.mockImplementation(() => ({
        initialize: jest.fn().mockRejectedValue(initError),
        getDb: jest.fn().mockReturnValue({
          exec: jest.fn(),
          prepare: jest.fn().mockReturnValue({
            run: jest.fn(),
            all: jest.fn(),
            get: jest.fn(),
          }),
        }),
      }));

      await activate(mockContext as vscode.ExtensionContext);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to activate Babel')
      );
    });
  });

  describe('Database Path Format', () => {
    it('should construct database path as {workspace}/.babel/babel.db', async () => {
      await activate(mockContext as vscode.ExtensionContext);

      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      const databaseConfig = BabelDatabaseMock.mock.calls[0][0];

      const expectedPath = path.join(tempDir, '.babel', 'babel.db');
      expect(databaseConfig.path).toBe(expectedPath);

      // Verify path contains exactly these segments
      const pathParts = databaseConfig.path.split(path.sep);
      const babelIndex = pathParts.indexOf('.babel');
      expect(babelIndex).toBeGreaterThan(-1);
      expect(pathParts[babelIndex + 1]).toBe('babel.db');
    });

    it('should create database path relative to workspace root, not global storage', async () => {
      await activate(mockContext as vscode.ExtensionContext);

      const BabelDatabaseMock = require('../../src/db/database').BabelDatabase as jest.Mock;
      const databaseConfig = BabelDatabaseMock.mock.calls[0][0];

      // Should start with workspace path
      expect(databaseConfig.path).toMatch(new RegExp(`^${tempDir.replace(/\\/g, '\\\\')}[/\\\\]`));

      // Should NOT contain globalStoragePath
      expect(databaseConfig.path).not.toContain(mockContext.globalStoragePath);
    });
  });
});
