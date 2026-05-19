/**
 * Command Handler Base Class
 * Abstract base for all VSCode commands in Babel
 */

import * as vscode from 'vscode';
import { Logger } from '../../utils/logger';

export interface CommandResult {
  success: boolean;
  message?: string;
  data?: unknown;
}

/**
 * Abstract base class for VSCode commands
 * All commands must:
 * - Validate prerequisites (workspace, git repo, etc.)
 * - Log execution with Logger
 * - Return structured CommandResult
 * - Handle errors gracefully
 */
export abstract class CommandHandler {
  protected logger: Logger;

  constructor(commandName: string) {
    this.logger = new Logger(commandName);
  }

  /**
   * Execute the command
   * Concrete implementations must define behavior
   */
  abstract execute(...args: unknown[]): Promise<CommandResult>;

  /**
   * Validate prerequisites before execution
   * @returns true if valid, false otherwise
   */
  protected abstract validatePrerequisites(): Promise<boolean>;

  /**
   * Show error dialog to user
   */
  protected showError(message: string): void {
    vscode.window.showErrorMessage(`Babel: ${message}`);
    this.logger.error(message);
  }

  /**
   * Show info dialog to user
   */
  protected showInfo(message: string): void {
    vscode.window.showInformationMessage(`Babel: ${message}`);
    this.logger.info(message);
  }

  /**
   * Show warning dialog to user
   */
  protected showWarning(message: string): void {
    vscode.window.showWarningMessage(`Babel: ${message}`);
    this.logger.warn(message);
  }

  /**
   * Get workspace root directory
   */
  protected getWorkspaceRoot(): string | undefined {
    const folders = vscode.workspace.workspaceFolders;
    return folders ? folders[0].uri.fsPath : undefined;
  }
}
