/**
 * Remove Color Command
 * Removes a color decoration from the current text selection
 */

import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../views/colorDecorationManager';
import { Logger } from '../../utils/logger';
import { CommandHandler, CommandResult } from './commandHandler';

const logger = new Logger('RemoveColorCommand');

export class RemoveColorCommand extends CommandHandler {
  constructor(private colorManager: ColorDecorationManager) {
    super('RemoveColorCommand');
  }

  async execute(): Promise<CommandResult> {
    try {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        return {
          success: false,
          message: 'No active editor',
        };
      }

      const selection = editor.selection;
      if (!selection || selection.isEmpty) {
        return {
          success: false,
          message: 'No text selected',
        };
      }

      // Convert range to character offsets
      const startOffset = editor.document.offsetAt(selection.start);
      const endOffset = editor.document.offsetAt(selection.end);

      // Remove the decoration
      this.colorManager.removeDecoration(startOffset, endOffset);

      this.logger.debug('Removed color from selection');

      return {
        success: true,
        message: 'Removed color from selection',
        data: { startOffset, endOffset },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to remove color', { error });
      return {
        success: false,
        message: `Failed to remove color: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return vscode.window.activeTextEditor !== undefined;
  }

  /**
   * Register the remove color command
   */
  static register(context: vscode.ExtensionContext, colorManager: ColorDecorationManager): void {
    const disposable = vscode.commands.registerCommand('babel.removeColor', async () => {
      const command = new RemoveColorCommand(colorManager);
      return command.execute();
    });
    context.subscriptions.push(disposable);

    logger.info('RemoveColorCommand registered');
  }
}
