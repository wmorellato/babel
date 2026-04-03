/**
 * Version repository tests
 */

import { IDatabase } from '../../../src/db/database';
import { VersionRepository } from '../../../src/db/versionRepository';
import { Version } from '../../../src/types';
import { ValidationError } from '../../../src/utils/errorHandler';
import { createTestDatabase, seedTestStory } from '../../helpers/database';

describe('VersionRepository', () => {
  let db: IDatabase;
  let repository: VersionRepository;

  beforeEach(() => {
    db = createTestDatabase();
    repository = new VersionRepository(db);
    seedTestStory(db, { id: 'story-1' });
  });

  afterEach(() => {
    db.close();
  });

  describe('create', () => {
    it('should create a version', () => {
      const version: Version = {
        id: 'version-1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      };

      repository.create(version);

      const created = repository.findById('version-1');
      expect(created).toBeDefined();
      expect(created?.gitBranch).toBe('main');
      expect(created?.deletedAt).toBeUndefined();
    });

    it('should throw validation error if missing id', () => {
      const version: Version = {
        id: '',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      };

      expect(() => repository.create(version)).toThrow(ValidationError);
    });

    it('should throw validation error if missing storyId', () => {
      const version: Version = {
        id: 'version-1',
        storyId: '',
        gitBranch: 'main',
        createdAt: new Date(),
      };

      expect(() => repository.create(version)).toThrow(ValidationError);
    });

    it('should throw validation error if missing gitBranch', () => {
      const version: Version = {
        id: 'version-1',
        storyId: 'story-1',
        gitBranch: '',
        createdAt: new Date(),
      };

      expect(() => repository.create(version)).toThrow(ValidationError);
    });
  });

  describe('findById', () => {
    it('should find version by id', () => {
      const version: Version = {
        id: 'version-1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      };
      repository.create(version);

      const found = repository.findById('version-1');

      expect(found).toBeDefined();
      expect(found?.gitBranch).toBe('main');
    });

    it('should return undefined if version not found', () => {
      const found = repository.findById('nonexistent');

      expect(found).toBeUndefined();
    });
  });

  describe('findByStoryId', () => {
    it('should find all versions for a story', () => {
      repository.create({
        id: 'v1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      });
      repository.create({
        id: 'v2',
        storyId: 'story-1',
        gitBranch: 'draft',
        createdAt: new Date(),
      });

      const versions = repository.findByStoryId('story-1');

      expect(versions).toHaveLength(2);
      expect(versions.map((v) => v.gitBranch)).toEqual(
        expect.arrayContaining(['main', 'draft'])
      );
    });

    it('should not return deleted versions', () => {
      repository.create({
        id: 'v1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      });
      repository.create({
        id: 'v2',
        storyId: 'story-1',
        gitBranch: 'draft',
        createdAt: new Date(),
      });

      repository.softDelete('v2');

      const versions = repository.findByStoryId('story-1');

      expect(versions).toHaveLength(1);
      expect(versions[0].id).toBe('v1');
    });

    it('should return empty array if no versions exist', () => {
      const versions = repository.findByStoryId('nonexistent-story');

      expect(versions).toEqual([]);
    });
  });

  describe('findByGitBranch', () => {
    it('should find version by git branch', () => {
      repository.create({
        id: 'v1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      });

      const version = repository.findByGitBranch('story-1', 'main');

      expect(version).toBeDefined();
      expect(version?.id).toBe('v1');
    });

    it('should return undefined if branch not found', () => {
      const version = repository.findByGitBranch('story-1', 'nonexistent');

      expect(version).toBeUndefined();
    });
  });

  describe('softDelete', () => {
    it('should soft delete a version', () => {
      repository.create({
        id: 'v1',
        storyId: 'story-1',
        gitBranch: 'main',
        createdAt: new Date(),
      });

      repository.softDelete('v1');

      const deleted = repository.findById('v1');
      expect(deleted?.deletedAt).toBeDefined();
    });

    it('should throw validation error if version does not exist', () => {
      expect(() => repository.softDelete('nonexistent')).toThrow(ValidationError);
    });
  });
});
