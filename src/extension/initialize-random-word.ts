import * as vscode from 'vscode';
import { WordnikService, MissingApiKeyError } from '../services/wordnikService';
import { RandomWordStatusBar } from '../views/randomWordStatusBar';
import { ExtensionDependencies } from './types';

const DEFAULT_DEFINITION_COUNT = 3;

/**
 * Initialize the random word status bar feature.
 * Registers the babel.fetchRandomWord command and the status bar item.
 */
export function initializeRandomWord(deps: ExtensionDependencies): vscode.Disposable {
  const { logger } = deps;
  const service = new WordnikService();
  const statusBar = new RandomWordStatusBar();

  const fetchWord = async (): Promise<void> => {
    if (statusBar.isFetching) {
      return;
    }

    statusBar.setLoading();

    try {
      const word = await service.getRandomWord();
      const limit = vscode.workspace
        .getConfiguration('babel.wordnik')
        .get<number>('definitionCount', DEFAULT_DEFINITION_COUNT);
      const definitions = await service.getDefinitions(word, limit);
      statusBar.setWord(word, definitions);
    } catch (error) {
      statusBar.restorePrevious();
      const message =
        error instanceof MissingApiKeyError
          ? 'Set babel.wordnik.apiKey to use the random word feature.'
          : `Failed to fetch random word: ${error instanceof Error ? error.message : String(error)}`;
      void vscode.window.showErrorMessage(message);
      logger.warn(message, error);
    }
  };

  const commandDisposable = vscode.commands.registerCommand('babel.fetchRandomWord', fetchWord);

  logger.info('Random word feature initialized');

  return vscode.Disposable.from(commandDisposable, statusBar);
}
