import * as fs from 'fs'
import * as path from 'path'
import { migrationExecutor } from '../../../src/services/migrationExecutor'
import { migrationValidator } from '../../../src/services/migrationValidator'
import { StoryType } from '../../../src/types'
import { createTestDatabase, seedTestStory } from '../../helpers/database'

describe('migrationExecutor', () => {
  const tempV1Dir = path.join(__dirname, '../../../.test-temp-exec-v1')
  const tempV2Dir = path.join(__dirname, '../../../.test-temp-exec-v2')

  beforeEach(() => {
    ;[tempV1Dir, tempV2Dir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true })
      }
      fs.mkdirSync(dir, { recursive: true })
    })
  })

  afterEach(() => {
    ;[tempV1Dir, tempV2Dir].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true })
      }
    })
  })

  describe('executePhaseA', () => {
    it('should copy non-standard version files to draft branch', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test Story',
            created: 1588885386918,
            versions: [
              'aaaaaaaa-aaaa-1aaa-8aaa-000000000001', // Non-standard version
              'aaaaaaaa-aaaa-1aaa-8aaa-000000000002', // Non-standard version
              '12345678-1234-5234-8234-123456789abc', // draft (standard)
            ],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: 'aaaaaaaa-aaaa-1aaa-8aaa-000000000001',
            name: 'I',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 1000,
            created: 1588885386919,
          },
          {
            id: 'aaaaaaaa-aaaa-1aaa-8aaa-000000000002',
            name: 'II',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 1500,
            created: 1588885386920,
          },
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386921,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      // Note: v1 structure is v1Dir/storyId/, not v1Dir/stories/storyId/
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'I.md'), 'I content')
      fs.writeFileSync(path.join(storyDir, 'II.md'), 'II content')
      // Must have draft.md or outline/characters for validator to accept story
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'draft '.repeat(500))

      const plan = migrationValidator.validate(tempV1Dir)

      // Create test database
      const db = createTestDatabase()

      const report = await migrationExecutor.executePhaseA(plan, tempV2Dir, db)

      // Verify non-standard files were copied to draft branch
      const v2StoryDir = path.join(tempV2Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      expect(fs.existsSync(path.join(v2StoryDir, 'I.md'))).toBe(true)
      expect(fs.existsSync(path.join(v2StoryDir, 'II.md'))).toBe(true)
      expect(fs.readFileSync(path.join(v2StoryDir, 'I.md'), 'utf-8')).toBe('I content')
      expect(fs.readFileSync(path.join(v2StoryDir, 'II.md'), 'utf-8')).toBe('II content')
      expect(report.summary.versionsMigrated).toBeGreaterThan(0)
    })
  })

  describe('execute', () => {
    it('should create story records in database', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test Story',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))

      const plan = migrationValidator.validate(tempV1Dir)
      const db = createTestDatabase()

      // Initialize schema
      db.exec(`CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        icon_name TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        deleted_at TEXT
      )`)

      // Create database adapter that wraps repositories
      const { StoryRepository } = await import('../../../src/db/storyRepository')
      const { VersionRepository } = await import('../../../src/db/versionRepository')
      const storyRepository = new StoryRepository(db)
      const versionRepository = new VersionRepository(db)

      const databaseAdapter = {
        createStory: (story: any) => {
          storyRepository.create({
            id: story.id,
            displayName: story.displayName,
            type: story.type,
            createdAt: story.createdAt,
            updatedAt: story.updatedAt,
          })
        },
        createVersion: (version: any) => {
          versionRepository.create({
            id: version.id,
            storyId: version.storyId,
            gitBranch: version.gitBranch,
            createdAt: version.createdAt,
          })
        },
      }

      const report = await migrationExecutor.execute(plan, tempV2Dir, databaseAdapter as any)

      expect(report.summary.storiesCreated).toBe(1)
      // Verify story was created in database
      const stories = storyRepository.findAll()
      expect(stories).toHaveLength(1)
      expect(stories[0].id).toBe('83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      expect(stories[0].type).toBe(StoryType.SHORT_STORY)
    })

    it('should initialize git repo for each story', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Git Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'test content')

      const plan = migrationValidator.validate(tempV1Dir)
      const mockDb = { stories: [], versions: [], createStory: () => {}, createVersion: () => {} }

      await migrationExecutor.execute(plan, tempV2Dir, mockDb)

      const gitDir = path.join(tempV2Dir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65/.git')
      expect(fs.existsSync(gitDir)).toBe(true)
    })

    it('should create draft.md file and commit', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Draft Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'test content')

      const plan = migrationValidator.validate(tempV1Dir)
      const mockDb = { stories: [], versions: [], createStory: () => {}, createVersion: () => {} }

      await migrationExecutor.execute(plan, tempV2Dir, mockDb)

      const draftPath = path.join(tempV2Dir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65/draft.md')
      expect(fs.existsSync(draftPath)).toBe(true)
      expect(fs.readFileSync(draftPath, 'utf-8')).toBe('test content')
    })

    it('should handle multiple versions with branches', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Multi Version Story',
            created: 1588885386918,
            versions: [
              '12345678-1234-5234-8234-123456789abc',
              '87654321-4321-5234-8234-987654321abc',
            ],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386919,
          },
          {
            id: '87654321-4321-5234-8234-987654321abc',
            name: 'draft1',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 3000,
            created: 1588885386920,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'draft content')
      fs.writeFileSync(path.join(storyDir, 'draft1.md'), 'draft1 content')

      const plan = migrationValidator.validate(tempV1Dir)
      const mockDb = { stories: [], versions: [], createStory: () => {}, createVersion: () => {} }

      const report = await migrationExecutor.execute(plan, tempV2Dir, mockDb)

      expect(report.summary.versionsMigrated).toBe(2)
      expect(report.storiesProcessed[0].versionsCreated).toBe(2)
    })

    it('should return migration report with summary', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Report Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'draft',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempV1Dir, '83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'test content')

      const plan = migrationValidator.validate(tempV1Dir)
      const mockDb = { stories: [], versions: [], createStory: () => {}, createVersion: () => {} }

      const report = await migrationExecutor.execute(plan, tempV2Dir, mockDb)

      expect(report.timestamp).toBeInstanceOf(Date)
      expect(report.v1Source).toBe(tempV1Dir)
      expect(report.v2Destination).toBe(tempV2Dir)
      expect(report.summary.totalStories).toBe(1)
      expect(report.summary.storiesCreated).toBe(1)
      expect(report.summary.storiesSkipped).toBe(0)
      expect(report.storiesProcessed).toHaveLength(1)
      expect(report.storiesProcessed[0].status).toBe('created')
    })

    it('should skip stories with status skipped', async () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'No Draft Story',
            created: 1588885386918,
            versions: [],
            versioningMode: 'git',
          },
        ],
        versions: [],
      }

      const babelJsonPath = path.join(tempV1Dir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      fs.mkdirSync(path.join(tempV1Dir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65'), {
        recursive: true,
      })

      const plan = migrationValidator.validate(tempV1Dir)
      const mockDb = { stories: [], versions: [], createStory: () => {}, createVersion: () => {} }

      const report = await migrationExecutor.execute(plan, tempV2Dir, mockDb)

      expect(report.summary.storiesSkipped).toBe(1)
      expect(report.storiesProcessed[0].status).toBe('skipped')
    })
  })
})
