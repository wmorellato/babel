/**
 * Icon Registry - Manages VSCode theme icons for stories
 */

import { IconDefinition, StoryType } from '../types';

export class IconRegistry {
  private icons: Map<string, IconDefinition>;
  private categoryIndex: Map<string, IconDefinition[]>;
  private defaultIconsByType: Record<StoryType, string>;

  constructor() {
    this.icons = new Map();
    this.categoryIndex = new Map();
    this.defaultIconsByType = {
      [StoryType.NOVEL]: 'book',
      [StoryType.SHORT_STORY]: 'file-text',
      [StoryType.NOVELLA]: 'book',
      [StoryType.ESSAY]: 'note',
    };
    this.registerDefaultIcons();
  }

  private registerDefaultIcons(): void {
    const icons: IconDefinition[] = [
      // Default/Type-Specific (category: 'default')
      { name: 'book', label: 'Book', description: 'Classic book', category: 'default' },
      { name: 'library', label: 'Library', description: 'Collection', category: 'default' },

      // Story-Specific (category: 'story')
      { name: 'file-text', label: 'Text File', description: 'Generic text', category: 'story' },
      { name: 'quote', label: 'Quote', description: 'Narrative piece', category: 'story' },
      { name: 'note', label: 'Note', description: 'Essay or article', category: 'story' },
      { name: 'history', label: 'History', description: 'Older draft', category: 'story' },
      { name: 'bookmark', label: 'Bookmark', description: 'Favorite version', category: 'story' },

      // Creative/Theme (category: 'creative')
      { name: 'lightbulb', label: 'Lightbulb', description: 'Idea or draft', category: 'creative' },
      { name: 'rocket', label: 'Rocket', description: 'New story', category: 'creative' },
      { name: 'star', label: 'Star', description: 'Published or polished', category: 'creative' },
      { name: 'archive', label: 'Archive', description: 'Completed work', category: 'creative' },
      { name: 'folder-library', label: 'Library Folder', description: 'Archive collection', category: 'creative' },

      // Emotional/Tone (category: 'emotional')
      { name: 'heart', label: 'Heart', description: 'Romance or emotional', category: 'emotional' },
      { name: 'flame', label: 'Flame', description: 'Action or dramatic', category: 'emotional' },
      { name: 'zap', label: 'Lightning', description: 'Fast-paced', category: 'emotional' },
      { name: 'moon', label: 'Moon', description: 'Dark or mysterious', category: 'emotional' },
      { name: 'circle-large', label: 'Circle', description: 'Neutral', category: 'emotional' },

      // Additional variety (category: 'other')
      { name: 'edit', label: 'Edit', description: 'Work in progress', category: 'other' },
      { name: 'check', label: 'Check', description: 'Edited or reviewed', category: 'other' },
      { name: 'clock', label: 'Clock', description: 'Time-based story', category: 'other' },
    ];

    // Register icons and build category index
    icons.forEach(icon => {
      this.icons.set(icon.name, icon);

      const category = icon.category || 'other';
      if (!this.categoryIndex.has(category)) {
        this.categoryIndex.set(category, []);
      }
      this.categoryIndex.get(category)!.push(icon);
    });
  }

  /**
   * Get icon by name
   */
  getIcon(name: string): IconDefinition | undefined {
    return this.icons.get(name);
  }

  /**
   * Get all registered icons
   */
  getAllIcons(): IconDefinition[] {
    return Array.from(this.icons.values());
  }

  /**
   * Get default icon for story type
   */
  getDefaultIconForType(type: StoryType): string {
    return this.defaultIconsByType[type] || 'book';
  }

  /**
   * Check if icon name is valid
   */
  isValidIcon(name: string): boolean {
    if (!name || typeof name !== 'string' || name.trim() === '') {
      return false;
    }
    return this.icons.has(name);
  }

  /**
   * Get icons by category
   */
  getIconsByCategory(category: string): IconDefinition[] {
    return this.categoryIndex.get(category) || [];
  }

  /**
   * Get all available categories
   */
  getAllCategories(): string[] {
    return Array.from(this.categoryIndex.keys());
  }
}
