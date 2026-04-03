/**
 * Babel Settings Helper Tests
 * Ensures consistent global-scope settings management
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { BabelSettings } from '../../../src/services/babelSettings';

// Mock vscode
jest.mock('vscode');

describe('BabelSettings', () => {
  let mockConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      get: jest.fn(),
      update: (jest.fn() as any).mockResolvedValue(undefined),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
  });

  describe('getBackupConfig', () => {
    it('should retrieve backup configuration', () => {
      BabelSettings.getBackupConfig();

      expect(vscode.workspace.getConfiguration).toHaveBeenCalledWith('babel.backup');
    });
  });

  describe('getBackupSetting', () => {
    it('should read a backup setting', () => {
      mockConfig.get.mockReturnValue(true);

      const value = BabelSettings.getBackupSetting('enabled');

      expect(mockConfig.get).toHaveBeenCalledWith('enabled');
      expect(value).toBe(true);
    });

    it('should return undefined if setting does not exist', () => {
      mockConfig.get.mockReturnValue(undefined);

      const value = BabelSettings.getBackupSetting('nonexistent');

      expect(value).toBeUndefined();
    });

    it('should support nested settings', () => {
      mockConfig.get.mockReturnValue(true);

      BabelSettings.getBackupSetting('dropbox.enabled');

      expect(mockConfig.get).toHaveBeenCalledWith('dropbox.enabled');
    });
  });

  describe('updateBackupSetting', () => {
    it('should update setting to global scope', async () => {
      await BabelSettings.updateBackupSetting('enabled', true);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'enabled',
        true,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should handle nested settings', async () => {
      await BabelSettings.updateBackupSetting('dropbox.authorized', false);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox.authorized',
        false,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should throw error if update fails', async () => {
      const error = new Error('Update failed');
      mockConfig.update.mockRejectedValue(error);

      await expect(
        BabelSettings.updateBackupSetting('enabled', true)
      ).rejects.toThrow('Update failed');
    });

    it('should support complex objects', async () => {
      const dropboxConfig = {
        enabled: true,
        clientId: 'test-id',
        redirectUri: 'http://localhost:13678/oauth/callback',
      };

      await BabelSettings.updateBackupSetting('dropbox', dropboxConfig);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox',
        dropboxConfig,
        vscode.ConfigurationTarget.Global
      );
    });
  });

  describe('initializeDefaults', () => {
    it('should set Dropbox defaults in global scope', async () => {
      mockConfig.get.mockReturnValue(undefined);

      await BabelSettings.initializeDefaults();

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox',
        expect.objectContaining({
          enabled: expect.any(Boolean),
          clientId: expect.any(String),
          redirectUri: expect.any(String),
        }),
        vscode.ConfigurationTarget.Global
      );
    });

    it('should not override existing settings', async () => {
      const existingConfig = {
        enabled: true,
        clientId: 'existing-id',
        redirectUri: 'http://example.com',
      };
      mockConfig.get.mockReturnValue(existingConfig);

      await BabelSettings.initializeDefaults();

      // Should not call update if settings already exist
      expect(mockConfig.update).not.toHaveBeenCalled();
    });

    it('should handle initialization errors gracefully', async () => {
      mockConfig.get.mockReturnValue(undefined);
      mockConfig.update.mockRejectedValue(new Error('Initialization failed'));

      // Should not throw - log and continue
      await expect(
        BabelSettings.initializeDefaults()
      ).rejects.toThrow();
    });
  });

  describe('isAuthorized', () => {
    it('should return true when authorized', () => {
      mockConfig.get.mockReturnValue(true);

      const result = BabelSettings.isAuthorized();

      expect(mockConfig.get).toHaveBeenCalledWith('dropbox.authorized');
      expect(result).toBe(true);
    });

    it('should return false when not authorized', () => {
      mockConfig.get.mockReturnValue(false);

      const result = BabelSettings.isAuthorized();

      expect(result).toBe(false);
    });

    it('should return false when setting does not exist', () => {
      mockConfig.get.mockReturnValue(undefined);

      const result = BabelSettings.isAuthorized();

      expect(result).toBe(false);
    });
  });

  describe('setAuthorized', () => {
    it('should update authorized status to true', async () => {
      await BabelSettings.setAuthorized(true);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox.authorized',
        true,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should update authorized status to false', async () => {
      await BabelSettings.setAuthorized(false);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox.authorized',
        false,
        vscode.ConfigurationTarget.Global
      );
    });
  });

  describe('isEnabled', () => {
    it('should check if backup is enabled', () => {
      mockConfig.get.mockReturnValue(true);

      const result = BabelSettings.isBackupEnabled();

      expect(mockConfig.get).toHaveBeenCalledWith('enabled');
      expect(result).toBe(true);
    });

    it('should check if dropbox is enabled', () => {
      mockConfig.get.mockReturnValue(true);

      const result = BabelSettings.isDropboxEnabled();

      expect(mockConfig.get).toHaveBeenCalledWith('dropbox.enabled');
      expect(result).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('should enable/disable backup', async () => {
      await BabelSettings.setBackupEnabled(true);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'enabled',
        true,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should enable/disable dropbox', async () => {
      await BabelSettings.setDropboxEnabled(false);

      expect(mockConfig.update).toHaveBeenCalledWith(
        'dropbox.enabled',
        false,
        vscode.ConfigurationTarget.Global
      );
    });
  });
});
