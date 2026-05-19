/**
 * Backup Tree Item Tests
 */

import { ProviderGroupItem, BackupItem } from '../../../src/views/backupTreeItem';
import * as vscode from 'vscode';

describe('ProviderGroupItem', () => {
  it('should accept basic parameters', () => {
    const item = new ProviderGroupItem('Local Backups', true, false);
    expect(item.providerName).toBe('Local Backups');
    expect(item.isEnabled).toBe(true);
    expect(item.isCloud).toBe(false);
  });

  it('should have expanded collapsible state', () => {
    const item = new ProviderGroupItem('Local Backups', true, false);
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Expanded);
  });

  it('should set contextValue based on provider type', () => {
    const localItem = new ProviderGroupItem('Local Backups', true, false);
    expect(localItem.contextValue).toBe('providerGroup.local');

    const cloudItem = new ProviderGroupItem('Cloud Backups', true, true);
    expect(cloudItem.contextValue).toBe('providerGroup.cloud');
  });

  it('should not set icon in constructor (set by TreeDataProvider)', () => {
    const item = new ProviderGroupItem('Local Backups', true, false);
    expect(item.iconPath).toBeUndefined();
  });

  it('should have label without status suffix', () => {
    const item = new ProviderGroupItem('Local Backups', true, false);
    expect(item.label).toBe('Local Backups');
  });
});

describe('ProviderGroupItem with authorization states', () => {
  it('should support isAuthorized property for cloud', () => {
    const item = new ProviderGroupItem('Cloud Backups', true, true, 'authorized');

    expect(item.isAuthorized).toBe('authorized');
  });

  it('should accept unauthorized state', () => {
    const item = new ProviderGroupItem('Cloud Backups', true, true, 'unauthorized');

    expect(item.isAuthorized).toBe('unauthorized');
  });

  it('should handle undefined isAuthorized', () => {
    const item = new ProviderGroupItem('Local Backups', true, false);

    expect(item.isAuthorized).toBeUndefined();
  });
});

describe('BackupItem', () => {
  it('should create backup item with all properties', () => {
    const backupId = 'backup-123';
    const timestamp = new Date('2026-03-20T10:30:00Z');
    const size = 5242880; // 5 MB in bytes
    const type = 'full' as const;

    const item = new BackupItem(backupId, timestamp, size, type);

    expect(item.backupId).toBe('backup-123');
    expect(item.timestamp).toEqual(timestamp);
    expect(item.size).toBe(5242880);
    expect(item.type).toBe('full');
  });

  it('should have no collapsible state', () => {
    const item = new BackupItem('backup-123', new Date(), 1024, 'full');
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
  });

  it('should set contextValue based on backup type', () => {
    const localItem = new BackupItem('backup-123', new Date(), 1024, 'full', false);
    expect(localItem.contextValue).toBe('backup.local');

    const cloudItem = new BackupItem('backup-456', new Date(), 1024, 'full', true);
    expect(cloudItem.contextValue).toBe('backup.cloud');
  });

  it('should have file icon', () => {
    const item = new BackupItem('backup-123', new Date(), 1024, 'full');
    expect(item.iconPath).toBeDefined();
  });

  it('should include size in description', () => {
    const item = new BackupItem('backup-123', new Date(), 1048576, 'incremental');
    expect(item.description).toBe('1.0 MB');
  });

  it('should format size in MB in description', () => {
    const item = new BackupItem('backup-123', new Date(), 5242880, 'full');
    expect(item.description).toBe('5.0 MB');
  });

  it('should handle incremental backup type', () => {
    const item = new BackupItem('backup-456', new Date(), 1048576, 'incremental');
    expect(item.type).toBe('incremental');
    expect(item.description).toBe('1.0 MB');
  });
});
