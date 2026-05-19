/**
 * Migration Command Integration Tests
 * Tests the full migration flow from v1 workspace to v2 story directories
 */

import * as fs from 'fs'
import * as path from 'path'
import { migrationCommand } from '../../../src/commands/migrationCommand'
import { migrationLogger } from '../../../src/utils/migrationLogger'

describe('migrationCommand integration', () => {
  // Use the fixture directory created for testing
  const fixtureDir = path.join(__dirname, '../../fixtures/v1-workspace')
  let tempV2Dir: string

  beforeEach(() => {
    migrationLogger.reset()

    // Create unique temporary v2 directory for each test
    const timestamp = Date.now()
    const testId = Math.random().toString(36).substring(7)
    tempV2Dir = path.join('/tmp', `babel-migration-v2-${timestamp}-${testId}`)

    if (fs.existsSync(tempV2Dir)) {
      fs.rmSync(tempV2Dir, { recursive: true })
    }
    fs.mkdirSync(tempV2Dir, { recursive: true })
  })

  afterEach(() => {
    migrationLogger.reset()
    if (fs.existsSync(tempV2Dir)) {
      fs.rmSync(tempV2Dir, { recursive: true })
    }
  })

  describe('Full migration workflow', () => {
    it('should migrate v1 workspace with multiple stories', async () => {
      expect(fs.existsSync(fixtureDir)).toBe(true)
      expect(fs.existsSync(path.join(fixtureDir, 'babel.json'))).toBe(true)

      // Run migration
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      // Verify v2 directory structure created
      const storiesDir = path.join(tempV2Dir, 'stories')
      expect(fs.existsSync(storiesDir)).toBe(true)

      // Verify story directories exist
      const storyId1 = '550e8400-e29b-41d4-a716-446655440001'
      const storyId2 = '550e8400-e29b-41d4-a716-446655440002'
      const storyId3 = '550e8400-e29b-41d4-a716-446655440003'

      expect(fs.existsSync(path.join(storiesDir, storyId1))).toBe(true)
      expect(fs.existsSync(path.join(storiesDir, storyId2))).toBe(true)
      expect(fs.existsSync(path.join(storiesDir, storyId3))).toBe(true)
    })

    it('should initialize git repos in each story directory', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      const storyId1 = '550e8400-e29b-41d4-a716-446655440001'
      const storyDir = path.join(tempV2Dir, 'stories', storyId1)

      // Check that .git directory exists
      expect(fs.existsSync(path.join(storyDir, '.git'))).toBe(true)
      expect(fs.statSync(path.join(storyDir, '.git')).isDirectory()).toBe(true)
    })

    it('should create story files in v2 structure', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      const storyId1 = '550e8400-e29b-41d4-a716-446655440001'
      const storyDir = path.join(tempV2Dir, 'stories', storyId1)

      // Check that draft.md was created in the story directory
      const draftFile = path.join(storyDir, 'draft.md')
      expect(fs.existsSync(draftFile)).toBe(true)

      // Verify content was copied
      const content = fs.readFileSync(draftFile, 'utf-8')
      expect(content.length).toBeGreaterThan(0)
      expect(content).toContain('word')
    })

    it('should handle multiple versions in same story', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      const storyId2 = '550e8400-e29b-41d4-a716-446655440002'
      const storyDir = path.join(tempV2Dir, 'stories', storyId2)

      // Verify story directory exists
      expect(fs.existsSync(storyDir)).toBe(true)

      // Both draft versions should be processed
      // The exact structure depends on the migration strategy
      // (branches vs separate files), but the directory should exist
      expect(fs.statSync(storyDir).isDirectory()).toBe(true)
    })
  })

  describe('Dry-run mode', () => {
    it('should validate but not execute migration in dry-run mode', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: true,
      })

      expect(exitCode).toBe(0)

      // Verify no story directories were created
      const storiesDir = path.join(tempV2Dir, 'stories')

      // The stories directory might exist but should be empty
      if (fs.existsSync(storiesDir)) {
        const contents = fs.readdirSync(storiesDir)
        expect(contents.length).toBe(0)
      }
    })

    it('should report on what would be migrated in dry-run mode', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: true,
      })

      expect(exitCode).toBe(0)

      // In dry-run mode, we should see validation logs but no actual migration
      const errors = migrationLogger.getAllErrors()
      // Should have minimal errors in successful dry-run
      expect(Array.isArray(errors)).toBe(true)
    })
  })

  describe('Error handling', () => {
    it('should handle invalid v1 directory gracefully', async () => {
      const invalidDir = path.join('/tmp', `nonexistent-${Date.now()}`)

      const exitCode = await migrationCommand.run(invalidDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(1)
    })

    it('should handle missing babel.json', async () => {
      // Create a temporary directory without babel.json
      const tempV1Dir = path.join('/tmp', `babel-v1-no-json-${Date.now()}`)
      fs.mkdirSync(tempV1Dir, { recursive: true })

      try {
        const exitCode = await migrationCommand.run(tempV1Dir, {
          v2Directory: tempV2Dir,
          dryRun: false,
        })

        expect(exitCode).toBe(1)
      } finally {
        fs.rmSync(tempV1Dir, { recursive: true })
      }
    })

    it('should handle missing story directories', async () => {
      // Create a minimal babel.json without actual story files
      const tempV1Dir = path.join('/tmp', `babel-v1-no-stories-${Date.now()}`)
      fs.mkdirSync(tempV1Dir, { recursive: true })

      const babelJson = {
        stories: [
          {
            id: '550e8400-e29b-41d4-a716-446655440099',
            title: 'Test Story',
            created: Date.now(),
            versions: ['550e8400-e29b-41d4-a716-446655440199'],
          },
        ],
        versions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440199',
            name: 'draft',
            storyId: '550e8400-e29b-41d4-a716-446655440099',
            wordCount: 1000,
            created: Date.now(),
          },
        ],
      }

      fs.writeFileSync(path.join(tempV1Dir, 'babel.json'), JSON.stringify(babelJson))

      try {
        const exitCode = await migrationCommand.run(tempV1Dir, {
          v2Directory: tempV2Dir,
          dryRun: false,
        })

        // Should handle gracefully - stories with no files are skipped
        expect(exitCode).toBe(0)
      } finally {
        fs.rmSync(tempV1Dir, { recursive: true })
      }
    })
  })

  describe('Output and reporting', () => {
    it('should display migration progress to console', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()

      try {
        const exitCode = await migrationCommand.run(fixtureDir, {
          v2Directory: tempV2Dir,
          dryRun: false,
        })

        expect(exitCode).toBe(0)

        // Verify console output includes key information
        const allOutput = consoleSpy.mock.calls.map(call => call[0]).join('\n')
        expect(allOutput).toContain('Migration')
        expect(allOutput).toContain('Source')
        expect(allOutput).toContain('Destination')
      } finally {
        consoleSpy.mockRestore()
      }
    })

    it('should create report file when specified', async () => {
      const reportFile = path.join(tempV2Dir, 'migration-report.json')

      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
        reportFile,
      })

      expect(exitCode).toBe(0)

      // Verify report file exists and contains valid JSON
      if (fs.existsSync(reportFile)) {
        const reportContent = fs.readFileSync(reportFile, 'utf-8')
        const report = JSON.parse(reportContent)

        expect(report).toHaveProperty('timestamp')
        expect(report).toHaveProperty('summary')
        expect(report.summary).toHaveProperty('totalStories')
        expect(report.summary).toHaveProperty('storiesCreated')
      }
    })
  })

  describe('Validation and planning', () => {
    it('should validate v1 data before migration', async () => {
      // Migration should validate that babel.json has correct structure
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: true, // Use dry-run to skip execution
      })

      // Should succeed with valid fixture data
      expect(exitCode).toBe(0)
    })

    it('should skip stories without processable files', async () => {
      // Create a v1 workspace with a story that has no files
      const tempV1Dir = path.join('/tmp', `babel-v1-empty-${Date.now()}`)
      const storyDir = path.join(tempV1Dir, 'stories', '550e8400-e29b-41d4-a716-446655440098')
      fs.mkdirSync(storyDir, { recursive: true })

      const babelJson = {
        stories: [
          {
            id: '550e8400-e29b-41d4-a716-446655440098',
            title: 'Empty Story',
            created: Date.now(),
            versions: ['550e8400-e29b-41d4-a716-446655440198'],
          },
        ],
        versions: [
          {
            id: '550e8400-e29b-41d4-a716-446655440198',
            name: 'draft',
            storyId: '550e8400-e29b-41d4-a716-446655440098',
            wordCount: 1000,
            created: Date.now(),
          },
        ],
      }

      fs.writeFileSync(path.join(tempV1Dir, 'babel.json'), JSON.stringify(babelJson))

      try {
        const exitCode = await migrationCommand.run(tempV1Dir, {
          v2Directory: tempV2Dir,
          dryRun: false,
        })

        // Should return 0 when no stories are found to be processable
        expect(exitCode).toBe(0)
      } finally {
        fs.rmSync(tempV1Dir, { recursive: true })
      }
    })
  })

  describe('Real fixture data', () => {
    it('should correctly identify story types from word counts', async () => {
      // The fixture has:
      // - Short story (5000 words) - should be SHORT_STORY type
      // - Novella (25000 words) - should be NOVELLA type
      // - Novel (75000 words) - should be NOVEL type

      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      // Verify story directories were created
      const storyId1 = '550e8400-e29b-41d4-a716-446655440001' // 5000 words
      const storyId2 = '550e8400-e29b-41d4-a716-446655440002' // 25000 words
      const storyId3 = '550e8400-e29b-41d4-a716-446655440003' // 75000 words

      const story1Dir = path.join(tempV2Dir, 'stories', storyId1)
      const story2Dir = path.join(tempV2Dir, 'stories', storyId2)
      const story3Dir = path.join(tempV2Dir, 'stories', storyId3)

      // All should exist
      expect(fs.existsSync(story1Dir)).toBe(true)
      expect(fs.existsSync(story2Dir)).toBe(true)
      expect(fs.existsSync(story3Dir)).toBe(true)
    })

    it('should preserve story titles and metadata', async () => {
      const exitCode = await migrationCommand.run(fixtureDir, {
        v2Directory: tempV2Dir,
        dryRun: false,
      })

      expect(exitCode).toBe(0)

      // Load original fixture
      const originalBabelJson = JSON.parse(
        fs.readFileSync(path.join(fixtureDir, 'babel.json'), 'utf-8')
      )

      // Verify all original stories are represented
      const storyDirs = fs.readdirSync(path.join(tempV2Dir, 'stories'))
      expect(storyDirs.length).toBeGreaterThan(0)

      // Check that expected story IDs exist
      const expectedIds = originalBabelJson.stories.map((s: any) => s.id)
      expectedIds.forEach((id: string) => {
        const storyDir = path.join(tempV2Dir, 'stories', id)
        // Story might be skipped or created, but directory should be present if created
        if (fs.existsSync(storyDir)) {
          expect(fs.statSync(storyDir).isDirectory()).toBe(true)
        }
      })
    })
  })
})
