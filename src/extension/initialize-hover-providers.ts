import * as vscode from 'vscode';
import { SelectionWordCountHover } from '../views/selectionWordCountHover';
import { ColorHoverProvider } from '../views/colorHoverProvider';
import { BabelSettings } from '../services/babelSettings';
import { ExtensionDependencies } from './types';

/**
 * Initialize hover providers for markdown files.
 * Registers:
 * - SelectionWordCountHover: shows word count for selected text
 * - ColorHoverProvider: shows color annotation details on hover
 */
export function initializeHoverProviders(deps: ExtensionDependencies): vscode.Disposable {
  const { colorAnnotationRepository, logger } = deps;

  const disposables: vscode.Disposable[] = [];

  // Selection word count hover
  const selectionHoverProvider = new SelectionWordCountHover();
  const selectionHoverRegistration = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'markdown' },
    selectionHoverProvider
  );
  disposables.push(selectionHoverRegistration);
  logger.info('Selection word count hover provider registered');

  // Color hover provider
  const colorHoverProvider = new ColorHoverProvider(
    BabelSettings.getColorPalette(),
    colorAnnotationRepository
  );
  const colorHoverRegistration = vscode.languages.registerHoverProvider(
    { scheme: 'file', language: 'markdown' },
    colorHoverProvider
  );
  disposables.push(colorHoverRegistration);
  logger.info('Color hover provider registered');

  return vscode.Disposable.from(...disposables);
}
