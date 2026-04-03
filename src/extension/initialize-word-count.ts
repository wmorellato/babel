import * as vscode from 'vscode';
import * as path from 'path';
import { DailyWordCountTracker } from '../core/dailyWordCountTracker';
import { DailyWordCountStatusBar } from '../views/dailyWordCountStatusBar';
import { ExtensionDependencies } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Initialize daily word count tracking.
 *
 * - Creates DailyWordCountTracker and DailyWordCountStatusBar
 * - Bootstraps tracker for all existing stories
 * - Registers save handler to update daily word count delta on file save
 * - Registers editor change handler to update the status bar
 *
 * NOTE: Auto-save backup triggering lives in initialize-backups.ts, not here.
 */
export async function initializeWordCount(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { wordCountRepository, storyRepository, workspacePath, coordinator, logger } = deps;

  const disposables: vscode.Disposable[] = [];

  const dailyWordCountTracker = new DailyWordCountTracker(wordCountRepository);

  // Bootstrap tracker for all existing stories
  const allStories = storyRepository.findAll();
  for (const story of allStories) {
    try {
      await dailyWordCountTracker.initialize(story.id);
    } catch (error) {
      logger.debug(`Failed to initialize daily word count for ${story.id}: ${error}`);
    }
  }

  const dailyWordCountStatusBar = new DailyWordCountStatusBar(dailyWordCountTracker);
  disposables.push(dailyWordCountStatusBar);

  // Update daily word count delta on file save
  coordinator.registerDocumentSaveHandler(async (document) => {
    if (!document.uri.fsPath.startsWith(workspacePath)) return;

    const storyId = path.relative(workspacePath, document.uri.fsPath).split(path.sep)[0];
    if (!UUID_PATTERN.test(storyId)) return;

    const story = storyRepository.findById(storyId);
    if (!story) return;

    const { countWords } = await import('../utils/wordCounter');
    const newWordCount = countWords(document.getText());
    const oldWordCount = story.currentWordCount ?? 0;
    const delta = newWordCount - oldWordCount;

    if (delta !== 0) {
      dailyWordCountTracker.updateNetWords(storyId, delta);
      storyRepository.updateWordCount(storyId, newWordCount);
      dailyWordCountStatusBar.updateForStory(storyId);
      deps.treeDataProvider?.refresh();
      logger.debug(`Daily word count updated for ${storyId}: delta=${delta}`);
    }
  });

  // Update status bar when editor changes
  coordinator.registerEditorChangeHandler(async (editor) => {
    if (!editor) return;
    const filePath = editor.document.uri.fsPath;
    if (!filePath.startsWith(workspacePath)) return;
    const storyId = path.relative(workspacePath, filePath).split(path.sep)[0];
    if (!UUID_PATTERN.test(storyId)) return;

    try {
      await dailyWordCountTracker.initialize(storyId);
    } catch (error) {
      logger.debug(`Failed to initialize daily word count: ${error}`);
    }

    dailyWordCountStatusBar.updateForStory(storyId);
  });

  // Initial update for current editor
  if (vscode.window.activeTextEditor) {
    const filePath = vscode.window.activeTextEditor.document.uri.fsPath;
    if (filePath.startsWith(workspacePath)) {
      const storyId = path.relative(workspacePath, filePath).split(path.sep)[0];
      if (UUID_PATTERN.test(storyId)) {
        await dailyWordCountTracker.initialize(storyId);
        dailyWordCountStatusBar.updateForStory(storyId);
      }
    }
  }

  logger.info('Daily word count tracker initialized');

  return new vscode.Disposable(async () => {
    try {
      await dailyWordCountTracker.dispose();
    } catch (error) {
      logger.debug(`Error disposing daily word count tracker: ${error}`);
    }
    for (const d of disposables) {
      d.dispose();
    }
  });
}
