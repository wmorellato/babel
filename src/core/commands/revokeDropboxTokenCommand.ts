/**
 * Revoke Dropbox Token Command
 * Handles revocation of Dropbox OAuth2 token
 */

import * as vscode from 'vscode';
import { TokenManager } from '../../services/tokenManager';
import { BabelSettings } from '../../services/babelSettings';
import { Logger } from '../../utils/logger';

const logger = new Logger('RevokeDropboxTokenCommand');

export class RevokeDropboxTokenCommand {
  constructor(private tokenManager: TokenManager) {}

  /**
   * Execute revoke token command
   */
  async execute(): Promise<void> {
    try {
      await this.tokenManager.revokeToken('dropbox');

      // Update settings to show not authorized
      await BabelSettings.setAuthorized(false);

      logger.info('✅ Dropbox token revoked successfully');
      await vscode.window.showInformationMessage(
        '✅ Dropbox token revoked. You can authorize again.'
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to revoke token', { error });
      await vscode.window.showErrorMessage(`Failed to revoke token: ${errorMessage}`);
    }
  }

  /**
   * Register the revoke token command
   */
  registerRevokeToken(context: vscode.ExtensionContext): void {
    const disposable = vscode.commands.registerCommand(
      'babel.revokeDropboxToken',
      () => this.execute()
    );
    context.subscriptions.push(disposable);
    logger.debug('Revoke Dropbox token command registered');
  }
}
