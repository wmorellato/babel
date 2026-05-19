/**
 * Auto-Commit Manager Tests
 */

import { AutoCommitManager } from '../../../src/core/autoCommitManager';
import { StoryRepository } from '../../../src/db/storyRepository';
import { AutoCommitHandler } from '../../../src/core/autoCommitHandler';
import { Story, StoryType } from '../../../src/types';
import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
jest.mock('../../../src/git/gitRepository');
jest.mock('../../../src/core/storyWordCountService');
jest.mock('../../../src/core/autoCommitHandler');

describe('AutoCommitManager', () => {
  let manager: AutoCommitManager;
  let mockRepository: jest.Mocked<StoryRepository>;
  const workspaceRoot = '/workspace';
  const storyId = '123e4567-e89b-12d3-a456-426614174000';

  const mockStory: Story = {
    id: storyId,
    displayName: 'Test Story',
    type: StoryType.SHORT_STORY,
    currentWordCount: 100,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockRepository = {
      findById: jest.fn(),
    } as any;

    manager = new AutoCommitManager(mockRepository, workspaceRoot);

    // Mock fs functions
    (fs.existsSync as jest.Mock).mockReturnValue(true);
  });

  describe('ensureHandler', () => {
    it('should return immediately if handler already exists', async () => {
      const mockHandler = {
        stopWatching: jest.fn(),
      } as any;

      // Manually set up a handler
      const handlerMap = new Map();
      handlerMap.set(storyId, mockHandler);
      (manager as any).handlerMap = handlerMap;

      await manager.ensureHandler(storyId);

      // Handler should not be recreated
      expect(manager.hasHandler(storyId)).toBe(true);
    });

    it('should return if story not found in database', async () => {
      mockRepository.findById.mockReturnValue(undefined);

      await manager.ensureHandler(storyId);

      expect(manager.hasHandler(storyId)).toBe(false);
    });

    it('should return if story directory does not exist', async () => {
      mockRepository.findById.mockReturnValue(mockStory);
      (fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return !dir.includes(storyId);
      });

      await manager.ensureHandler(storyId);

      expect(manager.hasHandler(storyId)).toBe(false);
    });

    it('should return if .git directory does not exist', async () => {
      mockRepository.findById.mockReturnValue(mockStory);
      (fs.existsSync as jest.Mock).mockImplementation((dir: string) => {
        return !dir.includes('.git');
      });

      await manager.ensureHandler(storyId);

      expect(manager.hasHandler(storyId)).toBe(false);
    });

    it('should create handler for valid story with git repo', async () => {
      mockRepository.findById.mockReturnValue(mockStory);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await manager.ensureHandler(storyId);

      expect(manager.hasHandler(storyId)).toBe(true);
      expect(AutoCommitHandler).toHaveBeenCalledWith(
        expect.any(Object), // gitRepository
        undefined, // config
        storyId,
        expect.any(Function) // callback
      );
    });

    it('should initialize handler with word count from database', async () => {
      mockRepository.findById.mockReturnValue(mockStory);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await manager.ensureHandler(storyId);

      const handler = manager.getHandler(storyId);
      expect(handler?.setWordCount).toHaveBeenCalledWith(100);
    });

    it('should initialize handler with 0 if story has no word count', async () => {
      const storyWithoutCount = { ...mockStory, currentWordCount: undefined };
      mockRepository.findById.mockReturnValue(storyWithoutCount);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await manager.ensureHandler(storyId);

      const handler = manager.getHandler(storyId);
      expect(handler?.setWordCount).toHaveBeenCalledWith(0);
    });

    it('should call watch on handler', async () => {
      mockRepository.findById.mockReturnValue(mockStory);
      (fs.existsSync as jest.Mock).mockReturnValue(true);

      await manager.ensureHandler(storyId);

      const handler = manager.getHandler(storyId);
      const expectedPath = path.join(workspaceRoot, storyId);
      expect(handler?.watch).toHaveBeenCalledWith(expectedPath);
    });
  });

  describe('disposeAll', () => {
    it('should stop all handlers', () => {
      const mockHandler1 = { stopWatching: jest.fn() } as any;
      const mockHandler2 = { stopWatching: jest.fn() } as any;

      (manager as any).handlerMap.set('story-1', mockHandler1);
      (manager as any).handlerMap.set('story-2', mockHandler2);

      manager.disposeAll();

      expect(mockHandler1.stopWatching).toHaveBeenCalled();
      expect(mockHandler2.stopWatching).toHaveBeenCalled();
      expect((manager as any).handlerMap.size).toBe(0);
    });

    it('should clear the handler map', () => {
      const mockHandler = { stopWatching: jest.fn() } as any;
      (manager as any).handlerMap.set(storyId, mockHandler);

      manager.disposeAll();

      expect(manager.hasHandler(storyId)).toBe(false);
    });
  });

  describe('getHandler', () => {
    it('should return handler if exists', () => {
      const mockHandler = { stopWatching: jest.fn() } as any;
      (manager as any).handlerMap.set(storyId, mockHandler);

      const handler = manager.getHandler(storyId);

      expect(handler).toBe(mockHandler);
    });

    it('should return undefined if handler does not exist', () => {
      const handler = manager.getHandler(storyId);

      expect(handler).toBeUndefined();
    });
  });

  describe('hasHandler', () => {
    it('should return true if handler exists', () => {
      const mockHandler = { stopWatching: jest.fn() } as any;
      (manager as any).handlerMap.set(storyId, mockHandler);

      const hasHandler = manager.hasHandler(storyId);

      expect(hasHandler).toBe(true);
    });

    it('should return false if handler does not exist', () => {
      const hasHandler = manager.hasHandler(storyId);

      expect(hasHandler).toBe(false);
    });
  });

  describe('getAllHandlers', () => {
    it('should return all handlers', () => {
      const mockHandler1 = { stopWatching: jest.fn() } as any;
      const mockHandler2 = { stopWatching: jest.fn() } as any;

      (manager as any).handlerMap.set('story-1', mockHandler1);
      (manager as any).handlerMap.set('story-2', mockHandler2);

      const handlers = manager.getAllHandlers();

      expect(handlers).toHaveLength(2);
      expect(handlers).toContain(mockHandler1);
      expect(handlers).toContain(mockHandler2);
    });

    it('should return empty array if no handlers', () => {
      const handlers = manager.getAllHandlers();

      expect(handlers).toHaveLength(0);
    });
  });
});
