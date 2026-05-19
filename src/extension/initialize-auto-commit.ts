import * as vscode from 'vscode';
import * as path from 'path';
import { AutoCommitManager } from '../core/autoCommitManager';
import { ExtensionDependencies } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Initialize the auto-commit manager which automatically commits story files
 * to git when word count changes are detected.
 *
 * - Creates AutoCommitManager
 * - Bootstraps handlers for all existing stories
 * - Registers editor change listener to lazily init handlers for new stories
 */
export async function initializeAutoCommit(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { storyRepository, workspacePath, coordinator, logger } = deps;

  const autoCommitManager = new AutoCommitManager(storyRepository, workspacePath);
  deps.autoCommitManager = autoCommitManager;

  // Bootstrap handlers for all existing stories
  const allStories = storyRepository.findAll();
  for (const story of allStories) {
    try {
      await autoCommitManager.ensureHandler(story.id);
    } catch (error) {
      logger.warn(`Failed to ensure handler for story ${story.id}: ${error}`);
    }
  }

  // Lazily init handler when user switches to a story file
  coordinator.registerEditorChangeHandler(async (editor) => {
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    if (!filePath.startsWith(workspacePath)) return;
    const storyId = path.relative(workspacePath, filePath).split(path.sep)[0];
    if (!UUID_PATTERN.test(storyId)) return;
    try {
      await autoCommitManager.ensureHandler(storyId);
    } catch (error) {
      logger.debug(`Failed to ensure handler on editor change: ${error}`);
    }
  });

  logger.info('Auto-commit manager initialized');

  return new vscode.Disposable(() => {
    autoCommitManager.disposeAll();
  });
}
