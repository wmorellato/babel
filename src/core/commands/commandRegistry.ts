/**
 * Command Registry
 * Central registry for all VSCode commands
 */

import * as vscode from 'vscode';
import { BabelDatabase } from '../../db/database';
import { GitRepository } from '../../git/gitRepository';
import { StoryRepository } from '../../db/storyRepository';
import { VersionRepository } from '../../db/versionRepository';
import { WordCountRepository } from '../../db/wordCountRepository';
import { VersionSwitcher } from '../versionSwitcher';
import { CreateStoryCommand } from './createStoryCommand';
import { RenameStoryCommand } from './renameStoryCommand';
import { CreateVersionCommand } from './createVersionCommand';
import { SwitchVersionCommand } from './switchVersionCommand';
import { DeleteVersionCommand } from './deleteVersionCommand';
import { ViewActivityCommand } from './viewActivityCommand';
import { ExportStoryCommand } from './exportStoryCommand';
import { SendToKindleCommand } from './sendToKindleCommand';
import { RenameStoryTreeCommand } from './renameStoryTreeCommand';
import { ChangeVersionTreeCommand } from './changeVersionTreeCommand';
import { DeleteStoryCommand } from './deleteStoryCommand';
import { ChangeIconCommand } from './changeIconCommand';
import { CreateVersionTreeCommand } from './createVersionTreeCommand';
import { AuthorizeDropboxCommand } from './authorizeDropboxCommand';
import { RevokeDropboxTokenCommand } from './revokeDropboxTokenCommand';
import { registerBackupToggleCommands } from './backupToggleCommands';
import { TokenManager } from '../../services/tokenManager';
import { PandocExportService } from '../../services/export/pandocExportService';
import { EmailService } from '../../services/email/emailService';
import { VSCodeSecretStorage } from '../../services/credentialStorage';
import { Logger } from '../../utils/logger';
import { ForceCommitCommand } from './forceCommitCommand';
import { AutoCommitManager } from '../autoCommitManager';

const logger = new Logger('CommandRegistry');

/**
 * Registry for all Babel commands
 * Creates and registers command handlers
 */
export class CommandRegistry {
  private database: BabelDatabase;
  private gitRepository: GitRepository;
  private storyRepository: StoryRepository;
  private versionRepository: VersionRepository;
  private wordCountRepository: WordCountRepository;
  private versionSwitcher: VersionSwitcher;
  private workspaceRoot: string;
  private treeRefreshCallback?: () => void;
  private tokenManager?: TokenManager;
  private credentialStorage?: VSCodeSecretStorage;
  private autoCommitManager?: AutoCommitManager;

  constructor(
    database: BabelDatabase,
    gitRepository: GitRepository,
    workspaceRoot: string = '',
    treeRefreshCallback?: () => void,
    tokenManager?: TokenManager,
    credentialStorage?: VSCodeSecretStorage,
    autoCommitManager?: AutoCommitManager
  ) {
    this.database = database;
    this.gitRepository = gitRepository;
    this.workspaceRoot = workspaceRoot;
    this.treeRefreshCallback = treeRefreshCallback;
    this.tokenManager = tokenManager;
    this.credentialStorage = credentialStorage;
    this.autoCommitManager = autoCommitManager;

    // Initialize repositories
    this.storyRepository = new (require('../../db/storyRepository').StoryRepository)(
      database.getDb()
    );
    this.versionRepository = new (require('../../db/versionRepository').VersionRepository)(
      database.getDb()
    );
    this.wordCountRepository = new (require('../../db/wordCountRepository').WordCountRepository)(
      database.getDb()
    );

    // Initialize version switcher
    this.versionSwitcher = new VersionSwitcher(gitRepository);
  }

  /**
   * Register all commands with VSCode
   */
  registerAll(context: vscode.ExtensionContext): void {
    logger.info('Registering Babel commands');

    // Register each command
    this.registerCreateStory(context);
    this.registerRenameStory(context);
    this.registerCreateVersion(context);
    this.registerSwitchVersion(context);
    this.registerDeleteVersion(context);
    this.registerViewActivity(context);
    this.registerExportStory(context);
    this.registerSendToKindle(context);
    this.registerRenameStoryTree(context);
    this.registerChangeVersionTree(context);
    this.registerCreateVersionTree(context);
    this.registerDeleteStory(context);
    this.registerChangeIcon(context);
    this.registerRefreshStories(context);
    this.registerAuthorizeDropbox(context);
    this.registerMigrate(context);
    this.registerForceCommit(context);

    // Register backup toggle commands (enable/disable providers)
    registerBackupToggleCommands(context);
    logger.info('Registered backup toggle commands');

    // Register revoke Dropbox token command
    this.registerRevokeDropboxToken(context);

    logger.info('All commands registered successfully');
  }

  /**
   * babel.newStory - Create a new story
   */
  private registerCreateStory(context: vscode.ExtensionContext): void {
    const command = new CreateStoryCommand(this.storyRepository, this.versionRepository);
    const disposable = vscode.commands.registerCommand('babel.newStory', async () => {
      try {
        const result = await command.execute();
        if (result.success) {
          this.treeRefreshCallback?.();
        } else {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.newStory');
  }

  /**
   * babel.renameStory - Rename an existing story
   */
  private registerRenameStory(context: vscode.ExtensionContext): void {
    const command = new RenameStoryCommand(this.storyRepository);
    const disposable = vscode.commands.registerCommand('babel.renameStory', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.renameStory');
  }

  /**
   * babel.newVersion - Create a new version (branch)
   */
  private registerCreateVersion(context: vscode.ExtensionContext): void {
    const command = new CreateVersionCommand(
      this.storyRepository,
      this.versionRepository,
      this.gitRepository
    );
    const disposable = vscode.commands.registerCommand('babel.newVersion', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.newVersion');
  }

  /**
   * babel.switchVersion - Switch to a different version
   */
  private registerSwitchVersion(context: vscode.ExtensionContext): void {
    const command = new SwitchVersionCommand(
      this.versionRepository,
      this.versionSwitcher,
      this.storyRepository
    );
    const disposable = vscode.commands.registerCommand('babel.switchVersion', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.switchVersion');
  }

  /**
   * babel.deleteVersion - Delete a version
   */
  private registerDeleteVersion(context: vscode.ExtensionContext): void {
    const command = new DeleteVersionCommand(
      this.versionRepository,
      this.gitRepository,
      this.storyRepository
    );
    const disposable = vscode.commands.registerCommand('babel.deleteVersion', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.deleteVersion');
  }

  /**
   * babel.viewActivity - View story activity and word count history
   */
  private registerViewActivity(context: vscode.ExtensionContext): void {
    const command = new ViewActivityCommand(this.storyRepository, this.wordCountRepository);
    const disposable = vscode.commands.registerCommand('babel.viewActivity', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.viewActivity');
  }

  /**
   * babel.exportStory - Export a story to DOCX format
   */
  private registerExportStory(context: vscode.ExtensionContext): void {
    const command = new ExportStoryCommand(this.storyRepository, this.workspaceRoot);
    const disposable = vscode.commands.registerCommand('babel.exportStory', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.exportStory');
  }

  /**
   * babel.sendToKindle - Export a story to DOCX and send to Kindle
   */
  private registerSendToKindle(context: vscode.ExtensionContext): void {
    const exportService = new PandocExportService(this.storyRepository, this.workspaceRoot);
    const emailService = new EmailService(this.credentialStorage || new VSCodeSecretStorage(context.secrets));
    const command = new SendToKindleCommand(
      this.storyRepository,
      this.workspaceRoot,
      exportService,
      emailService
    );
    const disposable = vscode.commands.registerCommand('babel.sendToKindle', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.sendToKindle');
  }

  /**
   * babel.renameStoryTree - Rename story from tree context menu
   */
  private registerRenameStoryTree(context: vscode.ExtensionContext): void {
    const command = new RenameStoryTreeCommand(
      this.storyRepository,
      () => this.treeRefreshCallback?.()
    );
    const disposable = vscode.commands.registerCommand('babel.renameStoryTree', async (treeItem) => {
      try {
        const result = await command.execute(treeItem);
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.renameStoryTree');
  }

  /**
   * babel.changeVersionTree - Change story version from tree context menu
   */
  private registerChangeVersionTree(context: vscode.ExtensionContext): void {
    const command = new ChangeVersionTreeCommand(
      this.versionRepository,
      this.workspaceRoot,
      () => this.treeRefreshCallback?.()
    );
    const disposable = vscode.commands.registerCommand('babel.changeVersionTree', async (treeItem) => {
      try {
        const result = await command.execute(treeItem);
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.changeVersionTree');
  }

  /**
   * babel.createVersionTree - Create a new version from tree context menu
   */
  private registerCreateVersionTree(context: vscode.ExtensionContext): void {
    const command = new CreateVersionTreeCommand(
      this.versionRepository,
      this.workspaceRoot,
      () => this.treeRefreshCallback?.()
    );
    const disposable = vscode.commands.registerCommand('babel.createVersionTree', async (treeItem) => {
      try {
        const result = await command.execute(treeItem);
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.createVersionTree');
  }

  /**
   * babel.deleteStory - Delete (soft-delete) a story from tree context menu
   */
  private registerDeleteStory(context: vscode.ExtensionContext): void {
    const command = new DeleteStoryCommand(
      this.storyRepository,
      this.workspaceRoot,
      () => this.treeRefreshCallback?.()
    );
    const disposable = vscode.commands.registerCommand('babel.deleteStory', async (treeItem) => {
      try {
        const result = await command.execute(treeItem);
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.deleteStory');
  }

  /**
   * babel.changeIcon - Change story icon from tree context menu
   */
  private registerChangeIcon(context: vscode.ExtensionContext): void {
    const command = new ChangeIconCommand(
      this.storyRepository,
      () => this.treeRefreshCallback?.()
    );
    const disposable = vscode.commands.registerCommand('babel.changeIcon', async (treeItem) => {
      try {
        await command.execute(treeItem);
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.changeIcon');
  }

  /**
   * babel.refreshStories - Refresh the stories tree view
   */
  private registerRefreshStories(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.refreshStories', () => {
      logger.info('Refreshing stories tree');
      this.treeRefreshCallback?.();
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.refreshStories');
  }

  /**
   * babel.authorizeDropbox - Authorize Dropbox cloud backup
   */
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

  /**
   * babel.revokeDropboxToken - Revoke Dropbox OAuth token
   */
  private registerRevokeDropboxToken(context: vscode.ExtensionContext): void {
    if (!this.tokenManager) {
      logger.warn('TokenManager not available, skipping revoke command registration');
      return;
    }

    const command = new RevokeDropboxTokenCommand(this.tokenManager);
    command.registerRevokeToken(context);
    logger.info('Registered babel.revokeDropboxToken');
  }

  /**
   * babel.migrate - Manually trigger migration from v1 to v2
   */
  private registerMigrate(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand('babel.migrate', async () => {
      try {
        const { MigrationInitializer } = await import('../../extension/initialize-migration');
        const migrator = new MigrationInitializer(
          this.workspaceRoot,
          this.database.getPath()
        );
        const success = await migrator.checkAndRunMigration();

        if (success) {
          await vscode.window.showInformationMessage('Migration completed successfully!');
        } else {
          await vscode.window.showWarningMessage('Migration was cancelled or failed.');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await vscode.window.showErrorMessage(`Migration error: ${errorMessage}`);
        logger.error('Migration command failed', { error });
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.migrate');
  }

  /**
   * babel.forceCommit - Force commit the current story, bypassing word count threshold
   */
  private registerForceCommit(context: vscode.ExtensionContext): void {
    if (!this.autoCommitManager) {
      logger.warn('AutoCommitManager not available, skipping forceCommit registration');
      return;
    }

    const command = new ForceCommitCommand(this.autoCommitManager, this.workspaceRoot);
    const disposable = vscode.commands.registerCommand('babel.forceCommit', async () => {
      try {
        const result = await command.execute();
        if (!result.success) {
          vscode.window.showErrorMessage(`Babel: ${result.message}`);
        }
      } catch (error) {
        logger.error(`Command failed: ${error}`);
      }
    });
    context.subscriptions.push(disposable);
    logger.info('Registered babel.forceCommit');
  }
}
