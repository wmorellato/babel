import * as vscode from 'vscode';
import { StoryStatusBar } from '../views/storyStatusBar';
import { ExtensionDependencies } from './types';

/**
 * Initialize story status bar showing current file's story context.
 * Registers:
 * - StoryStatusBar: displays story name/info in the status bar
 * - Editor change listener to keep status bar updated
 */
export function initializeStatusBars(deps: ExtensionDependencies): vscode.Disposable {
  const { storyRepository, workspacePath, coordinator, logger } = deps;

  const disposables: vscode.Disposable[] = [];

  const storyStatusBar = new StoryStatusBar(storyRepository, workspacePath);
  disposables.push(storyStatusBar);

  // Update status bar when active editor changes
  coordinator.registerEditorChangeHandler(async (editor) => {
    storyStatusBar.updateForEditor(editor);
  });

  // Initial update for current editor
  storyStatusBar.updateForEditor(vscode.window.activeTextEditor);

  logger.info('StoryStatusBar initialized for story context display');

  return vscode.Disposable.from(...disposables);
}
