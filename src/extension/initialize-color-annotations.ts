import * as vscode from 'vscode';
import * as path from 'path';
import { ColorDecorationManager } from '../views/colorDecorationManager';
import { ApplyColorCommand } from '../core/commands/applyColorCommand';
import { RemoveColorCommand } from '../core/commands/removeColorCommand';
import { GitRepository } from '../git/gitRepository';
import { BabelSettings } from '../services/babelSettings';
import { ExtensionDependencies } from './types';

/**
 * A mutable holder for the current ColorDecorationManager instance.
 * Commands registered once at startup always delegate through this holder so
 * they automatically use the manager for whichever editor is currently active.
 */
interface ColorManagerHolder {
  current: ColorDecorationManager | null;
}

/**
 * Initialize color annotation support.
 *
 * - Loads color decorations when the active editor changes
 * - Persists color annotations on file save
 * - Handles document changes to track annotation positions
 * - Registers ApplyColor commands (one per palette entry) and RemoveColor command
 */
export async function initializeColorAnnotations(deps: ExtensionDependencies): Promise<vscode.Disposable> {
  const { context, colorAnnotationRepository, workspacePath, coordinator, logger } = deps;

  const holder: ColorManagerHolder = { current: null };

  // Load color decorations for the given editor
  const updateColorDecorations = async (editor: vscode.TextEditor | undefined): Promise<void> => {
    if (!editor) return;

    const filePath = editor.document.uri.fsPath;
    if (!filePath.startsWith(workspacePath)) return;

    const storyId = path.relative(workspacePath, filePath).split(path.sep)[0];
    const storyDir = path.join(workspacePath, storyId);

    let versionId: string | undefined;
    try {
      const storyGitRepo = new GitRepository(storyDir);
      versionId = await storyGitRepo.getCurrentBranch();
    } catch (error) {
      logger.debug(`Story folder ${storyId} is not a git repository, skipping color decorations`);
      return;
    }

    if (!versionId) return;

    holder.current = new ColorDecorationManager(
      editor,
      BabelSettings.getColorPalette(),
      colorAnnotationRepository
    );

    try {
      await holder.current.loadVersion(storyId, versionId);
      logger.debug(`Loaded color annotations for ${storyId}/${versionId}`);
    } catch (error) {
      logger.error('Failed to load color annotations', { error });
    }
  };

  // Initial load for current editor on activation
  if (vscode.window.activeTextEditor) {
    await updateColorDecorations(vscode.window.activeTextEditor);
  }

  // Reload decorations when editor changes
  coordinator.registerEditorChangeHandler(updateColorDecorations);
  logger.info('Color editor change listener registered');

  // Persist color annotations on file save
  coordinator.registerDocumentSaveHandler(async (_doc) => {
    if (!holder.current) return;
    try {
      const annotations = holder.current.getDecorations();
      if (annotations.length > 0) {
        for (const annotation of annotations) {
          await colorAnnotationRepository.save(annotation);
        }
        logger.debug(`Saved ${annotations.length} color annotations`);
      }
    } catch (error) {
      logger.error('Failed to save color annotations', { error });
    }
  });
  logger.info('Color save listener registered');

  // Track annotation positions on document change
  coordinator.registerDocumentChangeHandler((event) => {
    if (!holder.current) return;
    if (event.document !== holder.current.getEditor().document) return;
    try {
      holder.current.handleDocumentChange(event);
    } catch (error) {
      logger.debug('Error handling document change for colors', { error });
    }
  });

  // Register apply/remove commands, delegating to the current manager via holder.
  // Commands are registered once; they read holder.current at invocation time.
  const palette = BabelSettings.getColorPalette();
  const commandDisposables: vscode.Disposable[] = [];

  for (const colorName of Object.keys(palette)) {
    const disposable = vscode.commands.registerCommand(
      `babel.applyColor.${colorName}`,
      async () => {
        if (!holder.current) return;
        const command = new ApplyColorCommand(holder.current);
        return command.execute(colorName);
      }
    );
    commandDisposables.push(disposable);
    context.subscriptions.push(disposable);
  }
  logger.info(`ApplyColorCommand registered for ${Object.keys(palette).length} colors`);

  const removeColorDisposable = vscode.commands.registerCommand('babel.removeColor', async () => {
    if (!holder.current) return;
    const command = new RemoveColorCommand(holder.current);
    return command.execute();
  });
  commandDisposables.push(removeColorDisposable);
  context.subscriptions.push(removeColorDisposable);
  logger.info('RemoveColorCommand registered');

  logger.info('Color annotations initialized');

  return vscode.Disposable.from(...commandDisposables);
}
