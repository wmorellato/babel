/**
 * Icon Registry Tests
 */

import { IconRegistry } from '../../../src/core/iconRegistry';
import { StoryType } from '../../../src/types/index';

describe('IconRegistry', () => {
  let registry: IconRegistry;

  beforeEach(() => {
    registry = new IconRegistry();
  });

  describe('initialization', () => {
    it('should load default icons on construction', () => {
      expect(registry.getAllIcons().length).toBeGreaterThan(0);
    });

    it('should have at least 20 icons', () => {
      expect(registry.getAllIcons().length).toBeGreaterThanOrEqual(20);
    });
  });

  describe('getIcon', () => {
    it('should retrieve icon by name', () => {
      const icon = registry.getIcon('book');
      expect(icon).toBeDefined();
      expect(icon?.name).toBe('book');
    });

    it('should return undefined for non-existent icon', () => {
      const icon = registry.getIcon('non-existent-icon-xyz');
      expect(icon).toBeUndefined();
    });

    it('should return icon with all properties', () => {
      const icon = registry.getIcon('book');
      expect(icon?.label).toBeDefined();
      expect(icon?.name).toBe('book');
    });
  });

  describe('getAllIcons', () => {
    it('should return array of all icons', () => {
      const icons = registry.getAllIcons();
      expect(Array.isArray(icons)).toBe(true);
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should return unique icons', () => {
      const icons = registry.getAllIcons();
      const names = icons.map(i => i.name);
      const uniqueNames = new Set(names);
      expect(names.length).toBe(uniqueNames.size);
    });

    it('each icon should have required properties', () => {
      const icons = registry.getAllIcons();
      icons.forEach(icon => {
        expect(icon.name).toBeDefined();
        expect(typeof icon.name).toBe('string');
        expect(icon.label).toBeDefined();
        expect(typeof icon.label).toBe('string');
      });
    });
  });

  describe('getDefaultIconForType', () => {
    it('should return book for NOVEL', () => {
      const icon = registry.getDefaultIconForType(StoryType.NOVEL);
      expect(icon).toBe('book');
    });

    it('should return file-text for SHORT_STORY', () => {
      const icon = registry.getDefaultIconForType(StoryType.SHORT_STORY);
      expect(icon).toBe('file-text');
    });

    it('should return book for NOVELLA', () => {
      const icon = registry.getDefaultIconForType(StoryType.NOVELLA);
      expect(icon).toBe('book');
    });

    it('should return note for ESSAY', () => {
      const icon = registry.getDefaultIconForType(StoryType.ESSAY);
      expect(icon).toBe('note');
    });

    it('should return book as fallback for unknown type', () => {
      const icon = registry.getDefaultIconForType('unknown' as StoryType);
      expect(icon).toBe('book');
    });
  });

  describe('isValidIcon', () => {
    it('should return true for valid icon names', () => {
      expect(registry.isValidIcon('book')).toBe(true);
      expect(registry.isValidIcon('lightbulb')).toBe(true);
    });

    it('should return false for invalid icon names', () => {
      expect(registry.isValidIcon('invalid-icon-xyz-abc-123')).toBe(false);
    });

    it('should return false for null or empty string', () => {
      expect(registry.isValidIcon('')).toBe(false);
    });
  });

  describe('getIconsByCategory', () => {
    it('should return icons for valid category', () => {
      const icons = registry.getIconsByCategory('default');
      expect(Array.isArray(icons)).toBe(true);
      expect(icons.length).toBeGreaterThan(0);
    });

    it('should return empty array for non-existent category', () => {
      const icons = registry.getIconsByCategory('non-existent-category');
      expect(Array.isArray(icons)).toBe(true);
      expect(icons.length).toBe(0);
    });

    it('each returned icon should have matching category', () => {
      const icons = registry.getIconsByCategory('creative');
      icons.forEach(icon => {
        expect(icon.category).toBe('creative');
      });
    });
  });

  describe('getAllCategories', () => {
    it('should return array of categories', () => {
      const categories = registry.getAllCategories();
      expect(Array.isArray(categories)).toBe(true);
      expect(categories.length).toBeGreaterThan(0);
    });

    it('should have default category', () => {
      const categories = registry.getAllCategories();
      expect(categories).toContain('default');
    });

    it('should return unique categories', () => {
      const categories = registry.getAllCategories();
      const uniqueCategories = new Set(categories);
      expect(categories.length).toBe(uniqueCategories.size);
    });
  });
});
