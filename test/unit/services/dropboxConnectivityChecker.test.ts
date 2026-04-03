import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { DropboxConnectivityChecker } from '../../../src/services/dropboxConnectivityChecker';
import { TokenManager } from '../../../src/services/tokenManager';

// Mock vscode
jest.mock('vscode');

// Mock Dropbox
jest.mock('dropbox');

describe('DropboxConnectivityChecker', () => {
  let checker: DropboxConnectivityChecker;
  let mockTokenManager: jest.Mocked<TokenManager>;
  let mockBackupConfig: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock TokenManager
    mockTokenManager = {
      getValidToken: jest.fn(),
      acquireToken: jest.fn(),
      refreshToken: jest.fn(),
    } as any;

    // Setup mock vscode config
    mockBackupConfig = {
      get: jest.fn(),
      update: jest.fn(),
    };

    (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(
      mockBackupConfig
    );

    // Setup default config values
    mockBackupConfig.get.mockImplementation((key: string) => {
      const defaults: { [key: string]: any } = {
        'dropbox.enabled': true,
        'dropbox.authorized': true,
      };
      return defaults[key];
    });

    checker = new DropboxConnectivityChecker(mockTokenManager);
  });

  describe('checkConnectivity', () => {
    it('should return false if Dropbox is not enabled', async () => {
      mockBackupConfig.get.mockImplementation((key: string) => {
        const defaults: { [key: string]: any } = {
          'dropbox.enabled': false,
          'dropbox.authorized': true,
        };
        return defaults[key];
      });

      const result = await checker.checkConnectivity();

      expect(result).toBe(false);
    });

    it('should return false if Dropbox is not authorized', async () => {
      mockBackupConfig.get.mockImplementation((key: string) => {
        const defaults: { [key: string]: any } = {
          'dropbox.enabled': true,
          'dropbox.authorized': false,
        };
        return defaults[key];
      });

      const result = await checker.checkConnectivity();

      expect(result).toBe(false);
    });

    it('should return false if no TokenManager available', async () => {
      const checkerNoToken = new DropboxConnectivityChecker(undefined);

      const result = await checkerNoToken.checkConnectivity();

      expect(result).toBe(false);
    });

    it('should return false if no valid token available', async () => {
      mockTokenManager.getValidToken.mockResolvedValue(null);

      const result = await checker.checkConnectivity();

      expect(result).toBe(false);
      expect(mockBackupConfig.update).toHaveBeenCalledWith(
        'dropbox.authorized',
        false,
        vscode.ConfigurationTarget.Global
      );
    });

    it('should return true if connectivity check succeeds', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('valid-token');

      const usersGetCurrentAccountFn = (jest.fn() as any).mockResolvedValue({
        result: { account_id: 'test-id' },
      });

      const mockDropbox = {
        usersGetCurrentAccount: usersGetCurrentAccountFn,
      };

      const { Dropbox } = require('dropbox');
      (Dropbox as jest.Mock).mockReturnValue(mockDropbox);

      const result = await checker.checkConnectivity();

      expect(result).toBe(true);
      expect(Dropbox).toHaveBeenCalledWith({ accessToken: 'valid-token' });
      expect(mockDropbox.usersGetCurrentAccount).toHaveBeenCalled();
    });

    it('should handle Dropbox API errors gracefully', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('valid-token');

      const usersGetCurrentAccountFn = (jest.fn() as any).mockRejectedValue(
        new Error('API Error')
      );

      const mockDropbox = {
        usersGetCurrentAccount: usersGetCurrentAccountFn,
      };

      const { Dropbox } = require('dropbox');
      (Dropbox as jest.Mock).mockReturnValue(mockDropbox);

      const result = await checker.checkConnectivity();

      expect(result).toBe(false);
    });
  });

  describe('checkAndUpdateStatus', () => {
    it('should call callback with connectivity status', async () => {
      mockTokenManager.getValidToken.mockResolvedValue('valid-token');

      const usersGetCurrentAccountFn = (jest.fn() as any).mockResolvedValue({
        result: { account_id: 'test-id' },
      });

      const mockDropbox = {
        usersGetCurrentAccount: usersGetCurrentAccountFn,
      };

      const { Dropbox } = require('dropbox');
      (Dropbox as jest.Mock).mockReturnValue(mockDropbox);

      const onStatusChange = jest.fn();

      const result = await checker.checkAndUpdateStatus(onStatusChange);

      expect(result).toBe(true);
      expect(onStatusChange).toHaveBeenCalledWith(true);
    });

    it('should call callback with false on failure', async () => {
      mockBackupConfig.get.mockImplementation((key: string) => {
        const defaults: { [key: string]: any } = {
          'dropbox.enabled': false,
          'dropbox.authorized': true,
        };
        return defaults[key];
      });

      const onStatusChange = jest.fn();

      const result = await checker.checkAndUpdateStatus(onStatusChange);

      expect(result).toBe(false);
      expect(onStatusChange).toHaveBeenCalledWith(false);
    });
  });
});
