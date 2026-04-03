/**
 * Backup Tree Items
 * Custom tree items for provider groups and backup entries
 */

import * as vscode from 'vscode';

export class ProviderGroupItem extends vscode.TreeItem {
  constructor(
    public readonly providerName: string,  // "Local Backups" or "Cloud Backups"
    public readonly isEnabled: boolean,
    public readonly isCloud: boolean,      // true for cloud, false for local
    public readonly isAuthorized?: 'authorized' | 'unauthorized'
  ) {
    super(
      `${providerName}`,
      vscode.TreeItemCollapsibleState.Expanded
    );

    // Set context value to distinguish local vs cloud for when clauses
    this.contextValue = isCloud ? 'providerGroup.cloud' : 'providerGroup.local';
  }
}

export class BackupItem extends vscode.TreeItem {
  constructor(
    public readonly backupId: string,
    public readonly timestamp: Date,
    public readonly size: number,        // in bytes
    public readonly type: 'full' | 'incremental',
    public readonly isCloud: boolean = false  // true for cloud, false for local
  ) {
    const dateStr = timestamp.toLocaleString();
    const sizeStr = (size / 1024 / 1024).toFixed(1);
    const label = `${dateStr}`;

    super(label, vscode.TreeItemCollapsibleState.None);

    this.description = `${sizeStr} MB`;
    if (type === 'full') {
      this.iconPath = new vscode.ThemeIcon('archive');
    } else {
      this.iconPath = new vscode.ThemeIcon('diff-single');
    }
    // Set context value to distinguish local vs cloud for when clauses
    this.contextValue = isCloud ? 'backup.cloud' : 'backup.local';
  }
}
