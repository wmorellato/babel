/**
 * BackupTreeDataProvider Tests
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import * as vscode from 'vscode';
import { BackupTreeDataProvider } from '../../../src/views/backupTreeDataProvider';
import { ProviderGroupItem, BackupItem } from '../../../src/views/backupTreeItem';
import { createTestDatabase } from '../../helpers/database';
import { BackupRepository } from '../../../src/db/backupRepository';
import { BackupManager } from '../../../src/services/backupManager';

describe('BackupTreeDataProvider', () => {
  let provider: BackupTreeDataProvider;
  let backupRepository: BackupRepository;
  let backupManager: any; // Mock

  beforeEach(() => {
    // Create mock database and repositories
    const db = createTestDatabase();
    backupRepository = new BackupRepository(db);

    // Create mock BackupManager with event emitters
    backupManager = {
      onBackupComplete: jest.fn((listener) => {}),
      onRestoreComplete: jest.fn((listener) => {}),
      onDeleteComplete: jest.fn((listener) => {}),
      onCloudBackupComplete: jest.fn((listener) => {}),
    };

    provider = new BackupTreeDataProvider(backupRepository, backupManager);
  });

  it('should return provider groups at root', async () => {
    const children = await provider.getChildren();

    expect(children).toHaveLength(2);
    expect(children[0]).toBeInstanceOf(ProviderGroupItem);
    expect(children[1]).toBeInstanceOf(ProviderGroupItem);
    expect((children[0] as ProviderGroupItem).providerName).toBe('Local Backups');
    expect((children[1] as ProviderGroupItem).providerName).toBe('Cloud Backups');
  });

  it('should have clean labels without status suffix', async () => {
    const children = (await provider.getChildren()) as ProviderGroupItem[];

    // Status is now shown via icon color, not label suffix
    expect(children[0].label).toBe('Local Backups');
    expect(children[1].label).toBe('Cloud Backups');
  });

  it('should return backups under local provider group', async () => {
    // Create a mock backup in repository
    const mockBackup = {
      id: 'test-backup-1',
      timestamp: new Date(),
      hash: 'test-hash',
      storageSize: 1024 * 1024, // 1 MB
      type: 'full',
      status: 'verified',
    };
    backupRepository.create(mockBackup as any);

    const localGroup = new ProviderGroupItem('Local Backups', true, false);
    const children = await provider.getChildren(localGroup);

    expect(children).toHaveLength(1);
    expect(children[0]).toBeInstanceOf(BackupItem);
    expect((children[0] as BackupItem).backupId).toBe('test-backup-1');
  });

  it('should return empty list for cloud provider when disabled', async () => {
    const cloudGroup = new ProviderGroupItem('Cloud Backups', false, true);
    const children = await provider.getChildren(cloudGroup);

    expect(children).toHaveLength(0);
  });

  it('should refresh on backup complete event', () => {
    // Capture the listener function
    let onBackupCompleteListener: any;
    (backupManager.onBackupComplete as jest.Mock).mockImplementation((listener: any) => {
      onBackupCompleteListener = listener;
    });

    const newProvider = new BackupTreeDataProvider(backupRepository, backupManager);
    const refreshSpy = jest.spyOn(newProvider, 'refresh');

    // Fire the event
    if (onBackupCompleteListener) {
      onBackupCompleteListener();
    }

    expect(refreshSpy).toHaveBeenCalled();
  });

  it('should toggle cloud backup setting', async () => {
    // Mock vscode.workspace.getConfiguration
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'dropbox.enabled') return false;
        return null;
      }),
      update: jest.fn(),
    };
    jest.spyOn(vscode.workspace, 'getConfiguration').mockReturnValue(mockConfig as any);

    await provider.toggleCloudBackup();

    expect(mockConfig.update).toHaveBeenCalledWith('dropbox.enabled', true, vscode.ConfigurationTarget.Global);
  });
});
