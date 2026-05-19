/**
 * Story Manager - Orchestrates story operations
 */

import { v4 as uuidv4 } from 'uuid';
import { Story, Version, StoryType, StoryTypeDefinition } from '../types';
import { StoryRepository } from '../db/storyRepository';
import { VersionRepository } from '../db/versionRepository';
import { StoryTypeRegistry } from './storyTypeRegistry';
import { ValidationError } from '../utils/errorHandler';
import { Logger } from '../utils/logger';

const logger = new Logger('StoryManager');

export class StoryManager {
  constructor(
    private storyRepo: StoryRepository,
    private versionRepo: VersionRepository,
    private typeRegistry: StoryTypeRegistry
  ) {}

  /**
   * Create a new story with the given name and type
   * @param displayName - Display name for the story
   * @param type - Story type (determines boilerplate)
   * @returns The created story object
   * @throws ValidationError if displayName is empty or type is unknown
   */
  createStory(displayName: string, type: StoryType): Story {
    // Validation
    if (!displayName || displayName.trim().length === 0) {
      throw new ValidationError('Story name cannot be empty');
    }

    const typeDefinition = this.typeRegistry.getType(type);
    if (!typeDefinition) {
      throw new ValidationError(`Unknown story type: ${type}`);
    }

    // Create story
    const id = uuidv4();
    const now = new Date();
    const story: Story = {
      id,
      displayName: displayName.trim(),
      type,
      currentWordCount: 0,
      createdAt: now,
      updatedAt: now,
    };

    // Persist
    this.storyRepo.create(story);
    logger.info(`Story created: ${id}`, { name: displayName, type });

    // Create default version (draft1 branch)
    const defaultVersion: Version = {
      id: uuidv4(),
      storyId: id,
      gitBranch: 'draft1',
      createdAt: now,
    };
    this.versionRepo.create(defaultVersion);

    return story;
  }

  getStory(id: string): Story | undefined {
    return this.storyRepo.findById(id);
  }

  getAllStories(): Story[] {
    return this.storyRepo.findAll();
  }

  getStoriesByType(type: StoryType): Story[] {
    return this.storyRepo.findByType(type);
  }

  /**
   * Rename an existing story
   * @param id - Story ID
   * @param newName - New display name
   * @returns Updated story object
   * @throws ValidationError if story not found or newName is empty
   */
  renameStory(id: string, newName: string): Story {
    if (!newName || newName.trim().length === 0) {
      throw new ValidationError('Story name cannot be empty');
    }

    const story = this.getStory(id);
    if (!story) {
      throw new ValidationError(`Story with id ${id} not found`);
    }

    const updated = {
      ...story,
      displayName: newName.trim(),
      updatedAt: new Date(),
    };

    this.storyRepo.update(updated);
    logger.info(`Story renamed: ${id}`, { newName });

    return updated;
  }

  /**
   * Delete a story permanently
   * @param id - Story ID
   * @param confirmed - Must be true to perform deletion (safety check)
   * @throws ValidationError if story not found or confirmed is false
   */
  deleteStory(id: string, confirmed: boolean = false): void {
    if (!confirmed) {
      throw new ValidationError('Story deletion must be confirmed');
    }

    const story = this.getStory(id);
    if (!story) {
      throw new ValidationError(`Story with id ${id} not found`);
    }

    this.storyRepo.delete(id);
    logger.info(`Story deleted: ${id}`, { name: story.displayName });
  }

  /**
   * Create a new version (branch) from an existing story
   * @param storyId - Story ID to create version for
   * @param versionName - Name for the new version
   * @returns The created version object
   * @throws ValidationError if story not found or versionName is empty
   */
  createVersion(storyId: string, versionName: string): Version {
    // Validation
    if (!versionName || versionName.trim().length === 0) {
      throw new ValidationError('Version name cannot be empty');
    }

    const story = this.getStory(storyId);
    if (!story) {
      throw new ValidationError(`Story with id ${storyId} not found`);
    }

    // Create version
    const version: Version = {
      id: uuidv4(),
      storyId,
      gitBranch: versionName.trim().toLowerCase().replace(/\s+/g, '-'),
      createdAt: new Date(),
    };

    this.versionRepo.create(version);
    logger.info(`Version created: ${version.id}`, { storyId, branch: version.gitBranch });

    return version;
  }

  getStoryVersions(storyId: string): Version[] {
    return this.versionRepo.findByStoryId(storyId);
  }

  getStoryFiles(type: StoryType): Record<string, string> | undefined {
    return this.typeRegistry.getFiles(type);
  }

  getStoryTypeDisplayName(type: StoryType): string | undefined {
    return this.typeRegistry.getDisplayName(type);
  }

  getAllStoryTypes(): StoryTypeDefinition[] {
    return this.typeRegistry.getAllTypes();
  }
}
