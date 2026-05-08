/**
 * Babel VSCode Extension - Main entry point
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from './utils/logger';
import { BabelConfig } from './types';
import { BabelDatabase } from './db/database';
import { GitRepository } from './git/gitRepository';
import { StoryRepository } from './db/storyRepository';
import { VersionRepository } from './db/versionRepository';
import { WordCountRepository } from './db/wordCountRepository';
import { BackupRepository } from './db/backupRepository';
import { ColorAnnotationRepository } from './db/colorAnnotationRepository';
import { VSCodeSecretStorage } from './services/credentialStorage';
import { TokenManager } from './services/tokenManager';
import { BabelSettings } from './services/babelSettings';
import { CredentialMigration } from './services/credentialMigration';
import { BackupDataCollector } from './services/backupDataCollector';
import { ListenerCoordinator } from './extension/listenerCoordinator';
import { ExtensionDependencies } from './extension/types';
import { initializeColorAnnotations } from './extension/initialize-color-annotations';
import { initializeAutoCommit } from './extension/initialize-auto-commit';
import { initializeWordCount } from './extension/initialize-word-count';
import { initializeReveal } from './extension/initialize-reveal';
import { initializeBackups } from './extension/initialize-backups';
import { initializeCommands } from './extension/initialize-commands';
import { initializeHoverProviders } from './extension/initialize-hover-providers';
import { initializeTreeProviders } from './extension/initialize-tree-providers';
import { initializeStatusBars } from './extension/initialize-status-bars';
import { AddFileCommand } from './core/commands/addFileCommand';
import { AddChapterCommand } from './core/commands/addChapterCommand';
import { DeleteFileCommand } from './core/commands/deleteFileCommand';
import { StoryFileService } from './services/storyFileService';
import { createWorkspaceHandler } from './extension/initialize-workspace';

const logger = new Logger('Extension');

let featureDisposablesForCleanup: vscode.Disposable | null = null;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  logger.info('Activating Babel extension...');

  try {
    // === INFRASTRUCTURE ===
    // Get workspace root (first folder if multi-root workspace)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      vscode.window.showErrorMessage('Babel requires a workspace folder to be open');
      return;
    }

    const workspacePath = workspaceFolders[0].uri.fsPath;
    const babelDir = path.join(workspacePath, '.babel');
    const databasePath = path.join(babelDir, 'babel.db');

    // Register workspace creation command (always available, even if workspace not initialized)
    context.subscriptions.push(
      vscode.commands.registerCommand('babel.createWorkspace', () =>
        createWorkspaceHandler(workspacePath, databasePath)
      )
    );

    // Early exit if workspace not initialized
    if (!fs.existsSync(databasePath)) {
      logger.info('Babel workspace not initialized in this folder');
      return;
    }

    // Set context to indicate workspace is initialized (used by viewsWelcome when clause)
    await vscode.commands.executeCommand('setContext', 'babel.workspaceInitialized', true);

    // Create .babel directory if it doesn't exist
    if (!fs.existsSync(babelDir)) {
      fs.mkdirSync(babelDir, { recursive: true });
    }

    // Check for v1 migration on startup
    const { MigrationInitializer } = await import('./extension/initialize-migration');
    const migrator = new MigrationInitializer(workspacePath, databasePath);
    const migrationComplete = await migrator.checkAndRunMigration();

    // If migration failed/cancelled, show warning and don't initialize other features
    if (!migrationComplete) {
      logger.warn('Migration check indicated v1 mode - features may not work correctly');
      // Can optionally disable Babel features here if needed
    }

    const database = new BabelDatabase({ path: databasePath });
    await database.initialize();

    // Create BabelConfig instance
    const babelConfig: BabelConfig = {
      workspaceRoot: workspacePath,
      databasePath: databasePath,
    };

    // Initialize services (created once, shared by all features)
    const gitRepository = new GitRepository(workspacePath);
    const storyRepository = new StoryRepository(database.getDb());
    const versionRepository = new VersionRepository(database.getDb());
    const wordCountRepository = new WordCountRepository(database.getDb());
    const backupRepository = new BackupRepository(database.getDb());
    const colorAnnotationRepository = new ColorAnnotationRepository(database.getDb());

    const credentialStorage = new VSCodeSecretStorage(context.secrets);
    const tokenManager = new TokenManager(credentialStorage);

    // Initialize settings and migrations
    await BabelSettings.initializeDefaults();

    // Optimize VSCode's git extension: only detect repos for open editors
    // This prevents scanning all 100+ story git repos on startup
    const workspaceConfig = vscode.workspace.getConfiguration('git');
    await workspaceConfig.update('autoRepositoryDetection', 'openEditors', vscode.ConfigurationTarget.Workspace);
    logger.info('Configured git.autoRepositoryDetection=openEditors for workspace');

    const legacyTokenPath = path.join(context.globalStoragePath, 'dropbox-token.json');
    const migration = new CredentialMigration(credentialStorage);
    if (await migration.detectLegacyTokens(legacyTokenPath)) {
      try {
        await migration.migrateTokensToSecureStorage(legacyTokenPath, 'dropbox');
        await vscode.window.showInformationMessage('Dropbox credentials migrated to secure storage.');
      } catch (error) {
        logger.warn(`Failed to migrate legacy tokens: ${error}`);
      }
    }

    // Create backup data collector used by both word count and backup features
    const backupDataCollector = new BackupDataCollector(database, storyRepository, babelConfig.workspaceRoot, babelConfig.databasePath);

    // Initialize StoryFileService for file management
    const storyFileService = new StoryFileService(gitRepository, workspacePath);

    // === LISTENER COORDINATION ===
    const coordinator = new ListenerCoordinator();

    // === BUILD DEPENDENCIES ===
    const deps: ExtensionDependencies = {
      context,
      database,
      workspacePath,
      gitRepository,
      storyRepository,
      versionRepository,
      wordCountRepository,
      backupRepository,
      colorAnnotationRepository,
      credentialStorage,
      tokenManager,
      backupDataCollector,
      coordinator,
      logger,
    };

    // === FEATURE INITIALIZATION (order matters for dependencies) ===
    // 1. Initialize UI providers first (tree, status bars) — other features depend on their refresh callbacks
    const treeProviderDisposable = initializeTreeProviders(deps);
    // deps.treeDataProvider is now set by initializeTreeProviders
    const statusBarDisposable = initializeStatusBars(deps);

    // 2. Initialize core features
    const colorDisposable = await initializeColorAnnotations(deps);
    const autoCommitDisposable = await initializeAutoCommit(deps);
    const wordCountDisposable = await initializeWordCount(deps);
    const revealDisposable = await initializeReveal(deps);

    // 3. Initialize features that depend on tree provider (must come after tree init)
    const commandDisposable = initializeCommands(deps);

    // Register story file management commands
    AddFileCommand.register(context, storyFileService, deps.treeDataProvider!);
    AddChapterCommand.register(context, storyFileService, storyRepository, deps.treeDataProvider!);
    DeleteFileCommand.register(context, storyFileService, deps.treeDataProvider!);

    const backupDisposable = await initializeBackups(deps);

    // 4. Initialize supporting features
    const hoverDisposable = initializeHoverProviders(deps);

    // === STORE DISPOSABLES FOR DEACTIVATION ===
    const featureDisposables = [
      treeProviderDisposable,
      statusBarDisposable,
      colorDisposable,
      autoCommitDisposable,
      wordCountDisposable,
      revealDisposable,
      commandDisposable,
      backupDisposable,
      hoverDisposable,
    ];

    featureDisposablesForCleanup = vscode.Disposable.from(...featureDisposables);

    // === REGISTER COORDINATED LISTENERS ===
    const listeners = coordinator.createListeners();
    listeners.forEach((listener) => context.subscriptions.push(listener));

    logger.info('Babel extension activated successfully');
  } catch (error) {
    logger.error('Failed to activate extension', { error });
    await vscode.window.showErrorMessage(`Failed to activate Babel: ${error}`);
  }
}

export async function deactivate(): Promise<void> {
  logger.info('Deactivating Babel extension...');

  try {
    if (featureDisposablesForCleanup) {
      featureDisposablesForCleanup.dispose();
      featureDisposablesForCleanup = null;
    }

    logger.info('Babel extension deactivated');
  } catch (error) {
    logger.error('Error during deactivation', { error });
  }
}
