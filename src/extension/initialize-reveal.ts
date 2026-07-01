/**
 * Reveal Feature
 * Auto-reveals story file in tree view when editor opens/switches to story markdown files
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ExtensionDependencies } from './types';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEBOUNCE_MS = 100;

/**
 * Initialize reveal feature
 * Hooks into editor changes to auto-reveal the current story file in the tree view
 */
export async function initializeReveal(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { coordinator, workspacePath, treeDataProvider, logger: depsLogger } = deps;

  if (!treeDataProvider) {
    depsLogger.warn('TreeDataProvider not available, skipping reveal initialization');
    return vscode.Disposable.from();
  }

  // Get the TreeView instance registered for 'babelStories'
  const treeView = vscode.window.createTreeView('babelStories', {
    treeDataProvider,
  });

  let revealTimer: NodeJS.Timeout | null = null;
  let pendingEditor: vscode.TextEditor | undefined;

  /**
   * Handler for editor changes - reveals the story file in the tree
   */
  const editorChangeHandler = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    // Clear existing timer
    if (revealTimer) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }

    // No editor or file is outside workspace
    if (!editor || !editor.document.fileName.startsWith(workspacePath)) {
      return;
    }

    const fileName = editor.document.fileName;

    // Extract storyId from path: workspacePath/storyId/...
    const relativePath = path.relative(workspacePath, fileName);
    const pathSegments = relativePath.split(path.sep);

    if (pathSegments.length === 0) {
      return;
    }

    const storyId = pathSegments[0];

    // Validate storyId is UUID format (ignore non-story files)
    if (!UUID_PATTERN.test(storyId)) {
      return;
    }

    // Store reference to detect if editor changes while debouncing
    pendingEditor = editor;

    // Debounce: wait 100ms to batch rapid editor switches
    revealTimer = setTimeout(async () => {
      // Check if editor changed while we were debouncing
      if (pendingEditor?.document.fileName !== fileName) {
        return;
      }

      // Skip when the tree view isn't visible (e.g. Zen Mode or fullscreen hide
      // the sidebar). VSCode exposes no API to detect Zen Mode directly, but
      // reveal() force-opens a hidden view, so guarding on visibility avoids
      // disrupting a distraction-free editing session.
      if (!treeView.visible) {
        depsLogger.debug('Tree view not visible (Zen Mode/fullscreen?), skipping reveal');
        return;
      }

      try {
        // Find the FileTreeItem in the tree
        const fileItem = treeDataProvider.getFileTreeItem(storyId, fileName);

        if (fileItem) {
          // Reveal the file item (auto-expands story via getParent)
          await treeView.reveal(fileItem, {
            select: true,  // Highlight/select the item
            focus: false,  // Don't steal focus from editor
          });

          depsLogger.debug(`Revealed file for story ${storyId}: ${path.basename(fileName)}`);
        } else {
          // File not found in tree - this can happen if file was just created or not yet in tree
          depsLogger.debug(`File not found in tree: ${fileName}`);
        }
      } catch (error) {
        depsLogger.error(`Failed to reveal file: ${error instanceof Error ? error.message : String(error)}`);
      }
    }, DEBOUNCE_MS);
  };

  // Register the editor change handler with the coordinator
  coordinator.registerEditorChangeHandler(editorChangeHandler);

  depsLogger.info('Reveal feature initialized');

  // Return disposable for cleanup
  return vscode.Disposable.from(treeView);
}
