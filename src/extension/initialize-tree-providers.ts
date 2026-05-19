import * as vscode from 'vscode';
import { BabelStoriesTreeDataProvider } from '../views/storyTreeDataProvider';
import { ExtensionDependencies } from './types';

/**
 * Initialize the Babel Stories tree data provider for the sidebar.
 * Creates and registers BabelStoriesTreeDataProvider, then stores a reference
 * on the deps object so downstream features (commands, backups) can refresh it.
 *
 * Returns a Disposable for cleanup, and mutates deps.treeDataProvider so that
 * subsequent initialization functions can access the provider.
 */
export function initializeTreeProviders(deps: ExtensionDependencies): vscode.Disposable {
  const { context, storyRepository, versionRepository, gitRepository, workspacePath, database, logger } = deps;

  const treeDataProvider = new BabelStoriesTreeDataProvider(storyRepository, versionRepository, gitRepository, workspacePath, database);
  const treeRegistration = vscode.window.registerTreeDataProvider('babelStories', treeDataProvider);
  context.subscriptions.push(treeRegistration);

  // Store reference so other features can call treeDataProvider.refresh()
  deps.treeDataProvider = treeDataProvider;

  logger.info('TreeDataProvider registered for Babel Stories sidebar');

  return vscode.Disposable.from(treeRegistration);
}
