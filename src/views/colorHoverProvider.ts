/**
 * Color Hover Provider
 * Shows color palette buttons and eraser on selection hover
 */

import * as vscode from 'vscode';
import { ColorPalette } from '../types';
import { ColorAnnotationRepository } from '../db/colorAnnotationRepository';
import { Logger } from '../utils/logger';

const logger = new Logger('ColorHoverProvider');

export class ColorHoverProvider implements vscode.HoverProvider {
  constructor(
    private colorPalette: ColorPalette,
    private colorRepository: ColorAnnotationRepository | null
  ) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): Promise<vscode.Hover | null> {
    try {
      const editors = vscode.window.visibleTextEditors.filter((e) => e.document === document);

      if (editors.length === 0) {
        return null;
      }

      for (const editor of editors) {
        for (const selection of editor.selections) {
          if (selection.isEmpty) {
            continue;
          }

          if (position.isAfterOrEqual(selection.start) && position.isBeforeOrEqual(selection.end)) {
            return this.createColorHover(selection);
          }
        }
      }

      return null;
    } catch (error) {
      logger.debug(`Error in color hover provider: ${error}`);
      return null;
    }
  }

  private createColorHover(selection: vscode.Selection): vscode.Hover {
    const contents: (string | vscode.MarkdownString)[] = [];
    const startOffset = selection.start.character;
    const endOffset = selection.end.character;

    const colorButtons = Object.keys(this.colorPalette)
      .map(
        (colorName) =>
          `[<span style="color:${this.colorPalette[colorName]};">$(circle-large-filled)</span>](command:babel.applyColor.${colorName}?${encodeURIComponent(
            JSON.stringify([colorName, startOffset, endOffset])
          )})`
      )
      .join('  ');

    const eraserButton = `[<span style="color:#fff;">$(eraser)</span>](command:babel.removeColor?${encodeURIComponent(
      JSON.stringify([startOffset, endOffset])
    )})`;

    const markdown = new vscode.MarkdownString(undefined, true);
    markdown.supportHtml = true;
    markdown.isTrusted = true;
    markdown.appendMarkdown(`${colorButtons} | ${eraserButton}`);

    contents.push(markdown);

    return new vscode.Hover(contents, selection);
  }
}
