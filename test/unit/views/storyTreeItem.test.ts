/**
 * Story Tree Item Tests
 */

import { StoryTreeItem } from '../../../src/views/storyTreeItem';
import { Story, StoryType } from '../../../src/types/index';
import * as vscode from 'vscode';

// No mocking needed for basic TreeItem tests

describe('StoryTreeItem', () => {
  const mockStory: Story = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    displayName: 'My Novel',
    type: StoryType.NOVEL,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-15'),
  };

  it('should set label to story displayName', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.label).toBe('My Novel');
  });

  it('should have collapsed state', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
  });

  it('should set contextValue to babelStory with story type', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.contextValue).toBe('babelStory:novel');
  });

  it('should include story type in contextValue for SHORT_STORY', () => {
    const shortStory: Story = { ...mockStory, type: StoryType.SHORT_STORY };
    const item = new StoryTreeItem(shortStory);
    expect(item.contextValue).toBe('babelStory:short-story');
  });

  it('should include story type in contextValue for ESSAY', () => {
    const essay: Story = { ...mockStory, type: StoryType.ESSAY };
    const item = new StoryTreeItem(essay);
    expect(item.contextValue).toBe('babelStory:essay');
  });

  it('should have book icon', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.iconPath).toBeDefined();
  });

  it('should set description to story type', () => {
    const item = new StoryTreeItem(mockStory);
    // When currentWordCount is not set, description should be empty
    expect(item.description).toBe('');
  });

  it('should set description to word count when available', () => {
    const story: Story = {
      ...mockStory,
      currentWordCount: 5000,
    };
    const item = new StoryTreeItem(story);
    expect(item.description).toBe('5000 words');
  });

  it('should set tooltip with creation date', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.tooltip).toContain('Created');
    expect(item.tooltip).toContain('2026');
  });

  it('should store storyId', () => {
    const item = new StoryTreeItem(mockStory);
    expect(item.storyId).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('should handle different story types', () => {
    const shortStory: Story = {
      ...mockStory,
      type: StoryType.SHORT_STORY,
      currentWordCount: 3000,
    };
    const item = new StoryTreeItem(shortStory);
    expect(item.description).toBe('3000 words');
  });

  describe('custom icons', () => {
    it('should use custom icon when iconName is set', () => {
      const storyWithCustomIcon: Story = {
        ...mockStory,
        iconName: 'star',
      };
      const item = new StoryTreeItem(storyWithCustomIcon);
      expect(item.iconPath).toBeDefined();
      expect((item.iconPath as any).id).toBe('star');
    });

    it('should use type-based default icon when iconName not set', () => {
      const story: Story = {
        ...mockStory,
        type: StoryType.NOVEL,
        // no iconName
      };
      const item = new StoryTreeItem(story);
      expect(item.iconPath).toBeDefined();
      expect((item.iconPath as any).id).toBe('book');
    });

    it('should use file-text icon for SHORT_STORY when no custom icon', () => {
      const story: Story = {
        ...mockStory,
        type: StoryType.SHORT_STORY,
      };
      const item = new StoryTreeItem(story);
      expect((item.iconPath as any).id).toBe('file-text');
    });

    it('should use book icon for NOVELLA when no custom icon', () => {
      const story: Story = {
        ...mockStory,
        type: StoryType.NOVELLA,
      };
      const item = new StoryTreeItem(story);
      expect((item.iconPath as any).id).toBe('book');
    });

    it('should use note icon for ESSAY when no custom icon', () => {
      const story: Story = {
        ...mockStory,
        type: StoryType.ESSAY,
      };
      const item = new StoryTreeItem(story);
      expect((item.iconPath as any).id).toBe('note');
    });

    it('should override type-based default with custom icon', () => {
      const story: Story = {
        ...mockStory,
        type: StoryType.ESSAY,
        iconName: 'rocket',
      };
      const item = new StoryTreeItem(story);
      expect((item.iconPath as any).id).toBe('rocket');
    });
  });
});
