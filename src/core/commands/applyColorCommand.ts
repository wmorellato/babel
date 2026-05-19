/**
 * Apply Color Command
 * Applies a color decoration to the current text selection
 */

import * as vscode from 'vscode';
import { ColorDecorationManager } from '../../views/colorDecorationManager';
import { ColorPalette } from '../../types';
import { Logger } from '../../utils/logger';
import { CommandHandler, CommandResult } from './commandHandler';

const logger = new Logger('ApplyColorCommand');

export class ApplyColorCommand extends CommandHandler {
  constructor(private colorManager: ColorDecorationManager) {
    super('ApplyColorCommand');
  }

  async execute(color: string): Promise<CommandResult> {
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

      // Apply the decoration
      const range = new vscode.Range(selection.start, selection.end);
      this.colorManager.applyDecoration(range, color);

      this.logger.debug(`Applied color '${color}' to selection`);

      return {
        success: true,
        message: `Applied color '${color}' to selection`,
        data: { color, range: { start: selection.start, end: selection.end } },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to apply color', { error });
      return {
        success: false,
        message: `Failed to apply color: ${message}`,
      };
    }
  }

  protected async validatePrerequisites(): Promise<boolean> {
    return vscode.window.activeTextEditor !== undefined;
  }

  /**
   * Register apply color commands for all colors in palette
   */
  static register(
    context: vscode.ExtensionContext,
    colorManager: ColorDecorationManager,
    palette: ColorPalette
  ): void {
    for (const colorName of Object.keys(palette)) {
      const disposable = vscode.commands.registerCommand(
        `babel.applyColor.${colorName}`,
        async () => {
          const command = new ApplyColorCommand(colorManager);
          return command.execute(colorName);
        }
      );
      context.subscriptions.push(disposable);
    }

    logger.info(`ApplyColorCommand registered for ${Object.keys(palette).length} colors`);
  }
}
