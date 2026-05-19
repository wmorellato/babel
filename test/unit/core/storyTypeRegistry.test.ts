/**
 * Story Type Registry tests
 */

import { StoryTypeRegistry, StoryTypeDefinition } from '../../../src/core/storyTypeRegistry';
import { StoryType } from '../../../src/types';

describe('StoryTypeRegistry', () => {
  let registry: StoryTypeRegistry;

  beforeEach(() => {
    registry = new StoryTypeRegistry();
  });

  describe('predefined types', () => {
    it('should have SHORT_STORY type', () => {
      const type = registry.getType(StoryType.SHORT_STORY);
      expect(type).toBeDefined();
      expect(type?.type).toBe(StoryType.SHORT_STORY);
    });

    it('should have NOVEL type', () => {
      const type = registry.getType(StoryType.NOVEL);
      expect(type).toBeDefined();
      expect(type?.type).toBe(StoryType.NOVEL);
    });

    it('should have NOVELLA type', () => {
      const type = registry.getType(StoryType.NOVELLA);
      expect(type).toBeDefined();
      expect(type?.type).toBe(StoryType.NOVELLA);
    });

    it('should have ESSAY type', () => {
      const type = registry.getType(StoryType.ESSAY);
      expect(type).toBeDefined();
      expect(type?.type).toBe(StoryType.ESSAY);
    });
  });

  describe('getting types', () => {
    it('should return type definition with files', () => {
      const type = registry.getType(StoryType.SHORT_STORY);

      expect(type?.displayName).toBeDefined();
      expect(type?.description).toBeDefined();
      expect(type?.files).toBeDefined();
      expect(Object.keys(type?.files || {}).length).toBeGreaterThan(0);
    });

    it('should return undefined for unknown type', () => {
      const type = registry.getType('unknown' as StoryType);
      expect(type).toBeUndefined();
    });

    it('should include story.md in all types', () => {
      const types = [StoryType.SHORT_STORY, StoryType.NOVEL, StoryType.NOVELLA, StoryType.ESSAY];

      for (const storyType of types) {
        const type = registry.getType(storyType);
        expect(type?.files['story.md']).toBeDefined();
        expect(typeof type?.files['story.md']).toBe('string');
        expect(type?.files['story.md']!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('boilerplate content', () => {
    it('should have non-empty content for SHORT_STORY', () => {
      const type = registry.getType(StoryType.SHORT_STORY)!;

      expect(type.files['story.md']).toBeTruthy();
      expect(type.files['story.md'].length).toBeGreaterThan(10);
    });

    it('should have character file for NOVEL', () => {
      const type = registry.getType(StoryType.NOVEL)!;

      expect(type.files['characters.md']).toBeDefined();
      expect(type.files['characters.md'].length).toBeGreaterThan(0);
    });

    it('should have chapter file for NOVELLA', () => {
      const type = registry.getType(StoryType.NOVELLA)!;

      expect(type.files['chapter1.md']).toBeDefined();
      expect(type.files['chapter1.md'].length).toBeGreaterThan(0);
    });

    it('should have unique content per type', () => {
      const shortStory = registry.getType(StoryType.SHORT_STORY)!;
      const novel = registry.getType(StoryType.NOVEL)!;

      // Content should be different
      expect(shortStory.files['story.md']).not.toBe(novel.files['story.md']);
    });
  });

  describe('registering custom types', () => {
    it('should register custom type', () => {
      const customType: StoryTypeDefinition = {
        type: 'custom' as StoryType,
        displayName: 'Custom Type',
        description: 'A custom story type',
        files: {
          'story.md': '# Custom Story',
        },
      };

      registry.registerType(customType);

      const registered = registry.getType('custom' as StoryType);
      expect(registered).toEqual(customType);
    });

    it('should override existing type', () => {
      const override: StoryTypeDefinition = {
        type: StoryType.ESSAY,
        displayName: 'Modified Essay',
        description: 'Modified description',
        files: {
          'story.md': 'Modified content',
        },
      };

      registry.registerType(override);

      const registered = registry.getType(StoryType.ESSAY);
      expect(registered?.displayName).toBe('Modified Essay');
    });
  });

  describe('listing all types', () => {
    it('should return array of all types', () => {
      const types = registry.getAllTypes();

      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThanOrEqual(4);
    });

    it('should include all predefined types', () => {
      const types = registry.getAllTypes();
      const typeNames = types.map((t) => t.type);

      expect(typeNames).toContain(StoryType.SHORT_STORY);
      expect(typeNames).toContain(StoryType.NOVEL);
      expect(typeNames).toContain(StoryType.NOVELLA);
      expect(typeNames).toContain(StoryType.ESSAY);
    });
  });

  describe('validation', () => {
    it('should validate type exists before returning', () => {
      const result = registry.getType('invalid' as StoryType);
      expect(result).toBeUndefined();
    });

    it('should have valid displayName and description', () => {
      const types = registry.getAllTypes();

      for (const type of types) {
        expect(type.displayName).toBeTruthy();
        expect(type.displayName.length).toBeGreaterThan(0);
        expect(type.description).toBeTruthy();
        expect(type.description.length).toBeGreaterThan(0);
      }
    });

    it('should have at least one file per type', () => {
      const types = registry.getAllTypes();

      for (const type of types) {
        expect(Object.keys(type.files).length).toBeGreaterThan(0);
      }
    });
  });
});
