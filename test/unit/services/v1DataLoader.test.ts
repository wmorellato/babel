import * as fs from 'fs'
import * as path from 'path'
import { v1DataLoader } from '../../../src/services/v1DataLoader'

describe('v1DataLoader', () => {
  const tempDir = path.join(__dirname, '../../../.test-temp')

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

  describe('loadBabelJson', () => {
    it('should load valid babel.json', () => {
      const validJson = {
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
            wordCount: 1000,
            created: 1588885386919,
          },
        ],
      }

      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(validJson))

      const result = v1DataLoader.loadBabelJson(babelJsonPath)
      expect(result.stories).toHaveLength(1)
      expect(result.stories[0].title).toBe('Test Story')
      expect(result.versions).toHaveLength(1)
    })

    it('should throw error if babel.json does not exist', () => {
      const nonexistent = path.join(tempDir, 'nonexistent.json')
      expect(() => v1DataLoader.loadBabelJson(nonexistent)).toThrow('babel.json not found')
    })

    it('should throw error if babel.json is malformed', () => {
      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, 'invalid json {')

      expect(() => v1DataLoader.loadBabelJson(babelJsonPath)).toThrow('Failed to parse babel.json')
    })

    it('should throw error if babel.json is missing required fields', () => {
      const invalidJson = { stories: [] }
      const babelJsonPath = path.join(tempDir, 'babel.json')
      fs.writeFileSync(babelJsonPath, JSON.stringify(invalidJson))

      expect(() => v1DataLoader.loadBabelJson(babelJsonPath)).toThrow('Invalid babel.json structure')
    })
  })

  describe('getStoryFiles', () => {
    it('should list all .md files in story directory', () => {
      const storyDir = path.join(tempDir, 'stories/story-1')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')
      fs.writeFileSync(path.join(storyDir, 'draft2.md'), 'content')
      fs.writeFileSync(path.join(storyDir, 'outline.md'), 'content')

      const files = v1DataLoader.getStoryFiles(storyDir)
      expect(files.sort()).toEqual(['draft.md', 'draft2.md', 'outline.md'])
    })

    it('should return empty array for nonexistent directory', () => {
      const nonexistent = path.join(tempDir, 'nonexistent')
      const files = v1DataLoader.getStoryFiles(nonexistent)
      expect(files).toEqual([])
    })

    it('should ignore non-.md files', () => {
      const storyDir = path.join(tempDir, 'stories/story-2')
      fs.mkdirSync(storyDir, { recursive: true })
      fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')
      fs.writeFileSync(path.join(storyDir, 'readme.txt'), 'content')

      const files = v1DataLoader.getStoryFiles(storyDir)
      expect(files).toEqual(['draft.md'])
    })
  })

  describe('getFileWordCount', () => {
    it('should count words in a file', () => {
      const filePath = path.join(tempDir, 'test.md')
      fs.writeFileSync(filePath, 'hello world foo bar')
      const count = v1DataLoader.getFileWordCount(filePath)
      expect(count).toBe(4)
    })

    it('should handle empty files', () => {
      const filePath = path.join(tempDir, 'empty.md')
      fs.writeFileSync(filePath, '')
      const count = v1DataLoader.getFileWordCount(filePath)
      expect(count).toBe(0)
    })

    it('should handle files with multiple spaces/newlines', () => {
      const filePath = path.join(tempDir, 'multispace.md')
      fs.writeFileSync(filePath, 'hello  \n\n  world   \t   foo')
      const count = v1DataLoader.getFileWordCount(filePath)
      expect(count).toBe(3)
    })

    it('should throw error for nonexistent file', () => {
      const nonexistent = path.join(tempDir, 'nonexistent.md')
      expect(() => v1DataLoader.getFileWordCount(nonexistent)).toThrow('File not found')
    })
  })
})
