/**
 * File Tree Item
 * Represents a markdown file in the Babel Stories sidebar
 */

import * as vscode from 'vscode';

export class FileTreeItem extends vscode.TreeItem {
  readonly filePath: string;
  readonly storyId: string;

  constructor(fileName: string, filePath: string, storyId: string) {
    super(fileName, vscode.TreeItemCollapsibleState.None);

    this.filePath = filePath;
    this.storyId = storyId;
    this.contextValue = 'babelFile';
    const iconName = this.getDefaultIconForFileName(fileName);
    this.iconPath = new vscode.ThemeIcon(iconName);
    this.resourceUri = vscode.Uri.file(filePath);

    // Open file when clicked
    this.command = {
      command: 'vscode.open',
      title: 'Open File',
      arguments: [vscode.Uri.file(filePath)],
    };
  }

  private getDefaultIconForFileName(fileName: string): string {
    if (fileName.startsWith('character')) {
      return 'person';
    }
    if (fileName.startsWith('outline')) {
      return 'map-vertical';
    }
    return 'file-text';
  }
}
