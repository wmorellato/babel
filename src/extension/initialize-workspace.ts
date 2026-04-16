import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { Logger } from '../utils/logger';
import { BabelDatabase } from '../db/database';

const logger = new Logger('InitializeWorkspace');

export async function createWorkspaceHandler(
  workspacePath: string,
  databasePath: string,
  context: vscode.ExtensionContext
): Promise<void> {
  try {
    const babelDir = path.dirname(databasePath);

    // Create .babel directory if it doesn't exist
    if (!fs.existsSync(babelDir)) {
      fs.mkdirSync(babelDir, { recursive: true });
      logger.info(`Created .babel directory at ${babelDir}`);
    }

    // Initialize database with schema
    const database = new BabelDatabase({ path: databasePath });
    await database.initialize();
    logger.info('Babel database initialized');

    vscode.window.showInformationMessage('Babel workspace created! Reloading...');

    // Reload window to trigger full extension initialization
    await vscode.commands.executeCommand('workbench.action.reloadWindow');
  } catch (error) {
    logger.error('Failed to create workspace', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    vscode.window.showErrorMessage(`Failed to create Babel workspace: ${errorMessage}`);
  }
}
