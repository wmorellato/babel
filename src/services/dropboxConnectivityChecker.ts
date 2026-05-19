/**
 * Dropbox Connectivity Checker
 * Verifies communication with Dropbox API on startup
 */

import * as vscode from 'vscode';
import { TokenManager } from './tokenManager';
import { BabelSettings } from './babelSettings';
import { createDropboxRefreshHandler } from './dropboxTokenRefresher';
import { Logger } from '../utils/logger';

const logger = new Logger('DropboxConnectivityChecker');

export class DropboxConnectivityChecker {
  constructor(private tokenManager?: TokenManager) {}

  /**
   * Check if Dropbox is accessible with current credentials
   */
  async checkConnectivity(): Promise<boolean> {
    try {
      if (!BabelSettings.isDropboxEnabled()) {
        logger.debug('Dropbox not enabled');
        return false;
      }

      // Check if we have a token manager
      if (!this.tokenManager) {
        logger.debug('No TokenManager available');
        return false;
      }

      // Try to get a valid token, auto-refreshing if expired
      const token = await this.tokenManager.getValidToken('dropbox', createDropboxRefreshHandler());
      if (!token) {
        logger.warn('No valid Dropbox token available, updating authorized status to false');
        try {
          await BabelSettings.setAuthorized(false);
        } catch (updateError) {
          logger.error('Failed to update dropbox.authorized setting', { error: updateError });
        }
        return false;
      }

      // Try to make a test call to Dropbox
      try {
        const { Dropbox } = require('dropbox');
        const dropbox = new Dropbox({ accessToken: token });
        await dropbox.usersGetCurrentAccount();

        // Heal authorized flag in case it was incorrectly set to false during a prior
        // session when the access token had expired but the refresh token was still valid.
        await BabelSettings.setAuthorized(true);

        logger.info('✓ Dropbox connectivity verified');
        return true;
      } catch (error) {
        logger.error('✗ Failed to connect to Dropbox', { error });
        return false;
      }
    } catch (error) {
      logger.error('Connectivity check failed', { error });
      return false;
    }
  }

  /**
   * Check connectivity and update UI state
   */
  async checkAndUpdateStatus(
    onStatusChange?: (isConnected: boolean) => void
  ): Promise<boolean> {
    const isConnected = await this.checkConnectivity();
    onStatusChange?.(isConnected);
    return isConnected;
  }
}
