/**
 * Babel Settings Helper
 * Centralized settings management with consistent global scope
 * All backup settings are stored globally, never in workspace scope
 */

import * as vscode from 'vscode';
import { Logger } from '../utils/logger';
import { ColorPalette } from '../types';

const logger = new Logger('BabelSettings');

export class BabelSettings {
  /**
   * Get backup configuration object
   */
  static getBackupConfig() {
    return vscode.workspace.getConfiguration('babel.backup');
  }

  /**
   * Get a backup setting value
   */
  static getBackupSetting<T>(key: string): T | undefined {
    const config = this.getBackupConfig();
    return config.get<T>(key);
  }

  /**
   * Update a backup setting (always to global scope)
   */
  static async updateBackupSetting(key: string, value: any): Promise<void> {
    const config = this.getBackupConfig();
    try {
      await config.update(key, value, vscode.ConfigurationTarget.Global);
      logger.debug(`Updated ${key} to global scope`, { value });
    } catch (error) {
      logger.error(`Failed to update ${key}`, { error });
      throw error;
    }
  }

  /**
   * Initialize default Dropbox settings if not already configured
   */
  static async initializeDefaults(): Promise<void> {
    const config = this.getBackupConfig();
    const dropboxConfig = config.get<any>('dropbox');

    // Only initialize if not already configured
    if (!dropboxConfig?.clientId || !dropboxConfig?.redirectUri) {
      try {
        const defaults = {
          enabled: false,
          clientId: 'q0e787fjf1m58cj',
          redirectUri: 'http://localhost:13678/oauth/callback',
        };

        await this.updateBackupSetting('dropbox', defaults);
        logger.info('Dropbox default settings initialized');
      } catch (error) {
        logger.warn(`Failed to initialize Dropbox settings: ${error}`);
        throw error;
      }
    }
  }

  /**
   * Check if Dropbox is authorized
   */
  static isAuthorized(): boolean {
    return this.getBackupSetting<boolean>('dropbox.authorized') ?? false;
  }

  /**
   * Set Dropbox authorization status
   */
  static async setAuthorized(authorized: boolean): Promise<void> {
    await this.updateBackupSetting('dropbox.authorized', authorized);
  }

  /**
   * Check if backup is enabled
   */
  static isBackupEnabled(): boolean {
    return this.getBackupSetting<boolean>('enabled') ?? true;
  }

  /**
   * Set backup enabled status
   */
  static async setBackupEnabled(enabled: boolean): Promise<void> {
    await this.updateBackupSetting('enabled', enabled);
  }

  /**
   * Check if Dropbox is enabled
   */
  static isDropboxEnabled(): boolean {
    return this.getBackupSetting<boolean>('dropbox.enabled') ?? false;
  }

  /**
   * Set Dropbox enabled status
   */
  static async setDropboxEnabled(enabled: boolean): Promise<void> {
    await this.updateBackupSetting('dropbox.enabled', enabled);
  }

  /**
   * Get configured color palette with defaults
   */
  static getColorPalette(): ColorPalette {
    const config = vscode.workspace.getConfiguration('babel.colors');
    return config.get<ColorPalette>('palette') || {
      red: '#FF9999',
      orange: '#FFCC99',
      yellow: '#FFEA80',
      green: '#99DD99',
      cyan: '#99CCFF',
      blue: '#6699FF',
      purple: '#DD99FF',
      pink: '#FFAADD',
    };
  }
}
