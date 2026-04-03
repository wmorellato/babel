/**
 * Selection Word Count Hover Provider
 * Shows word count tooltip in editor when hovering over selection
 */

import * as vscode from 'vscode';
import { countWords } from '../utils/wordCounter';
import { Logger } from '../utils/logger';

const logger = new Logger('SelectionWordCountHover');

export class SelectionWordCountHover implements vscode.HoverProvider {
  /**
   * Provide hover information for selections
   */
  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    try {
      // Get all editors for this document to check for selections
      const editors = vscode.window.visibleTextEditors.filter(
        (editor) => editor.document === document
      );

      if (editors.length === 0) {
        return null;
      }

      // Check if position is within any selection
      for (const editor of editors) {
        for (const selection of editor.selections) {
          if (selection.isEmpty) {
            continue;
          }

          // Check if hover position is within this selection
          if (position.isAfterOrEqual(selection.start) && position.isBeforeOrEqual(selection.end)) {
            const selectedText = document.getText(selection);
            const wordCount = countWords(selectedText);

            if (wordCount === 0) {
              return null;
            }

            // Create hover content
            const word = wordCount === 1 ? 'word' : 'words';
            const content = new vscode.MarkdownString(`**${wordCount} ${word}**`);

            return new vscode.Hover(content, selection);
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error in selection word count hover: ${error}`);
      return null;
    }
  }
}
