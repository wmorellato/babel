import * as fs from 'fs'
import * as path from 'path'
import { migrationValidator } from '../../../src/services/migrationValidator'
import { StoryType } from '../../../src/types'

describe('migrationValidator', () => {
  const tempDir = path.join(__dirname, '../../../.test-temp-validator')

  beforeEach(() => {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  describe('validate', () => {
    it('should skip story with no draft files', () => {
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      fs.mkdirSync(path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65'), {
        recursive: true,
      })

      const result = migrationValidator.validate(tempDir)

      expect(result.stories).toHaveLength(1)
      expect(result.stories[0].status).toBe('skipped')
      expect(result.stories[0].skipReason).toContain('No processable files')
    })

    it('should detect SHORT_STORY type from draft.md (< 10k words)', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Short Story',
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      expect(result.stories).toHaveLength(1)
      expect(result.stories[0].status).toBe('valid')
      expect(result.stories[0].type).toBe(StoryType.SHORT_STORY)
    })

    it('should detect NOVELLA type from draft.md (10k-50k words)', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Novella',
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
            wordCount: 25000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(25000))

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].type).toBe(StoryType.NOVELLA)
      expect(result.stories[0].status).toBe('valid')
    })

    it('should detect NOVEL type from draft.md (> 50k words)', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Novel',
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
            wordCount: 75000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(75000))

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].type).toBe(StoryType.NOVEL)
      expect(result.stories[0].status).toBe('valid')
    })

    it('should map draft version to draft.md with commit-to-current action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].versions).toHaveLength(1)
      const version = result.stories[0].versions[0]
      expect(version.name).toBe('draft')
      expect(version.targetFileName).toBe('draft.md')
      expect(version.targetBranch).toBe('draft')
      expect(version.action).toBe('commit-to-current')
    })

    it('should map outline version to outline.md with commit-to-current action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'outline',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 500,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'outline.md'), 'outline content')

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].versions).toHaveLength(1)
      const version = result.stories[0].versions[0]
      expect(version.targetFileName).toBe('outline.md')
      expect(version.targetBranch).toBe('draft')
      expect(version.action).toBe('commit-to-current')
    })

    it('should map characters version to characters.md with commit-to-current action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
        ],
        versions: [
          {
            id: '12345678-1234-5234-8234-123456789abc',
            name: 'characters',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 500,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'characters.md'), 'characters content')

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].versions).toHaveLength(1)
      const version = result.stories[0].versions[0]
      expect(version.targetFileName).toBe('characters.md')
      expect(version.targetBranch).toBe('draft')
      expect(version.action).toBe('commit-to-current')
    })

    it('should map draftX versions to draft.md with create-branch action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc', '22345678-2234-5234-8234-123456789abc'],
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
            id: '22345678-2234-5234-8234-123456789abc',
            name: 'draft2',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2500,
            created: 1588885386920,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))
      fs.writeFileSync(path.join(storyDir, 'draft2.md'), 'word '.repeat(2500))

      const result = migrationValidator.validate(tempDir)

      expect(result.stories[0].versions).toHaveLength(2)
      const draftVersion = result.stories[0].versions[1]
      expect(draftVersion.name).toBe('draft2')
      expect(draftVersion.targetFileName).toBe('draft.md')
      expect(draftVersion.targetBranch).toBe('draft2')
      expect(draftVersion.action).toBe('create-branch')
    })

    it('should map revision version to draft.md with create-branch action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc', '33345678-3334-5234-8234-123456789abc'],
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
            id: '33345678-3334-5234-8234-123456789abc',
            name: 'revision',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386920,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))
      fs.writeFileSync(path.join(storyDir, 'revision.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      const revisionVersion = result.stories[0].versions[1]
      expect(revisionVersion.targetFileName).toBe('draft.md')
      expect(revisionVersion.targetBranch).toBe('revision')
      expect(revisionVersion.action).toBe('create-branch')
    })

    it('should map translation version to draft.md with create-branch action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc', '44345678-4434-5234-8234-123456789abc'],
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
            id: '44345678-4434-5234-8234-123456789abc',
            name: 'translation',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386920,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))
      fs.writeFileSync(path.join(storyDir, 'translation.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      const translationVersion = result.stories[0].versions[1]
      expect(translationVersion.targetFileName).toBe('draft.md')
      expect(translationVersion.targetBranch).toBe('translation')
      expect(translationVersion.action).toBe('create-branch')
    })

    it('should map other file versions to filename.md with create-branch action', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc', '55345678-5534-5234-8234-123456789abc'],
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
            id: '55345678-5534-5234-8234-123456789abc',
            name: 'alt-ending',
            storyId: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            wordCount: 2000,
            created: 1588885386920,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))
      fs.writeFileSync(path.join(storyDir, 'alt-ending.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      const otherVersion = result.stories[0].versions[1]
      expect(otherVersion.targetFileName).toBe('alt-ending.md')
      expect(otherVersion.targetBranch).toBe('alt-ending')
      expect(otherVersion.action).toBe('create-branch')
    })

    it('should handle multiple stories with mixed statuses', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Valid Story',
            created: 1588885386918,
            versions: ['12345678-1234-5234-8234-123456789abc'],
            versioningMode: 'git',
          },
          {
            id: 'aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa',
            title: 'Skipped Story',
            created: 1588885386918,
            versions: [],
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))

      const story1Dir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(story1Dir, { recursive: true })
      fs.writeFileSync(path.join(story1Dir, 'draft.md'), 'word '.repeat(2000))

      const story2Dir = path.join(tempDir, 'stories/aaaaaaaa-aaaa-4aaa-baaa-aaaaaaaaaaaa')
      fs.mkdirSync(story2Dir, { recursive: true })

      const result = migrationValidator.validate(tempDir)

      expect(result.stories).toHaveLength(2)
      expect(result.stories[0].status).toBe('valid')
      expect(result.stories[1].status).toBe('skipped')
    })

    it('should return v1Source in result', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      expect(result.v1Source).toBe(tempDir)
    })

    it('should have empty globalErrors array on success', () => {
      const babelJson = {
        stories: [
          {
            id: '83e7dbac-1aaf-45db-8745-1c89a5f73c65',
            title: 'Test',
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

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(babelJson))
      const storyDir = path.join(tempDir, 'stories/83e7dbac-1aaf-45db-8745-1c89a5f73c65')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'word '.repeat(2000))

      const result = migrationValidator.validate(tempDir)

      expect(result.globalErrors).toEqual([])
    })
  })
})
