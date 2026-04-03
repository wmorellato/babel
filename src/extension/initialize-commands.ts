import * as vscode from 'vscode';
import { CommandRegistry } from '../core/commands/commandRegistry';
import { ExtensionDependencies } from './types';

/**
 * Initialize the command registry and register all Babel commands with VSCode.
 * Depends on treeDataProvider being set on deps (from initializeTreeProviders).
 */
export function initializeCommands(deps: ExtensionDependencies): vscode.Disposable {
  const { context, database, gitRepository, tokenManager, logger, treeDataProvider, credentialStorage } = deps;

  const commandRegistry = new CommandRegistry(
    database,
    gitRepository,
    deps.workspacePath,
    () => treeDataProvider?.refresh(),
    tokenManager,
    credentialStorage
  );
  commandRegistry.registerAll(context);

  logger.info('Command registry initialized');

  // CommandRegistry registers directly with context.subscriptions; nothing to wrap.
  return vscode.Disposable.from();
}
