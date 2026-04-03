import * as vscode from 'vscode';
import { Logger } from '../utils/logger';

const logger = new Logger('ListenerCoordinator');

/**
 * Centralized coordinator for VSCode event listeners.
 * Prevents duplicate listener registrations when multiple features need to listen to the same events.
 */
export class ListenerCoordinator {
  private editorChangeHandlers: Array<(editor: vscode.TextEditor | undefined) => Promise<void>> = [];
  private documentSaveHandlers: Array<(document: vscode.TextDocument) => Promise<void>> = [];
  private documentChangeHandlers: Array<(event: vscode.TextDocumentChangeEvent) => void> = [];

  /**
   * Register a handler to be called when the active editor changes.
   * Handler will be called after other handlers; errors won't prevent others from running.
   */
  registerEditorChangeHandler(handler: (editor: vscode.TextEditor | undefined) => Promise<void>): void {
    this.editorChangeHandlers.push(handler);
  }

  /**
   * Register a handler to be called when a document is saved.
   * Handler will be called after other handlers; errors won't prevent others from running.
   */
  registerDocumentSaveHandler(handler: (document: vscode.TextDocument) => Promise<void>): void {
    this.documentSaveHandlers.push(handler);
  }

  /**
   * Register a handler to be called when document content changes.
   * Handler will be called after other handlers; errors won't prevent others from running.
   */
  registerDocumentChangeHandler(handler: (event: vscode.TextDocumentChangeEvent) => void): void {
    this.documentChangeHandlers.push(handler);
  }

  /**
   * Create and return VSCode event listeners that dispatch to all registered handlers.
   * Returns array of Disposables to register with vscode.ExtensionContext.subscriptions.
   */
  createListeners(): vscode.Disposable[] {
    const editorChangeListener = vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      for (const handler of this.editorChangeHandlers) {
        try {
          await handler(editor);
        } catch (error) {
          logger.debug('Error in editor change handler', { error });
        }
      }
    });

    const documentSaveListener = vscode.workspace.onDidSaveTextDocument(async (document) => {
      for (const handler of this.documentSaveHandlers) {
        try {
          await handler(document);
        } catch (error) {
          logger.debug('Error in document save handler', { error });
        }
      }
    });

    const documentChangeListener = vscode.workspace.onDidChangeTextDocument((event) => {
      for (const handler of this.documentChangeHandlers) {
        try {
          handler(event);
        } catch (error) {
          logger.debug('Error in document change handler', { error });
        }
      }
    });

    return [editorChangeListener, documentSaveListener, documentChangeListener];
  }
}
