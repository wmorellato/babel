/**
 * File Tree Item Tests
 */

import { FileTreeItem } from '../../../src/views/fileTreeItem';
import * as vscode from 'vscode';

// Don't mock vscode module, we need the real TreeItem class

describe('FileTreeItem', () => {
  const storyId = '123e4567-e89b-12d3-a456-426614174000';
  const filePath = '/workspace/story-folder/chapter-1.md';

  it('should set label to file name', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.label).toBe('chapter-1.md');
  });

  it('should have no collapsible state', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
  });

  it('should set contextValue to babelFile', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.contextValue).toBe('babelFile');
  });

  it('should have markdown icon', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.iconPath).toBeDefined();
  });

  it('should set command to open file', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.command).toBeDefined();
    expect(item.command?.command).toBe('vscode.open');
    expect(item.command?.arguments).toContainEqual(vscode.Uri.file(filePath));
  });

  it('should set resourceUri', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.resourceUri).toBeDefined();
  });

  it('should store filePath', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.filePath).toBe(filePath);
  });

  it('should store storyId', () => {
    const item = new FileTreeItem('chapter-1.md', filePath, storyId);
    expect(item.storyId).toBe(storyId);
  });

  it('should handle nested file paths', () => {
    const nestedPath = 'chapters/part-1/chapter-1.md';
    const item = new FileTreeItem(nestedPath, filePath, storyId);
    expect(item.label).toBe(nestedPath);
  });
});
