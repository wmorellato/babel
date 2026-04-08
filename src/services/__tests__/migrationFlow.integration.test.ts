import * as fs from 'fs'
import * as path from 'path'
import { simpleGit } from 'simple-git'
import { migrationValidator } from '../migrationValidator'
import { migrationExecutor } from '../migrationExecutor'
import { MigrationBackup } from '../migrationBackup'
import { BabelDatabase } from '../../db/database'
import { StoryRepository } from '../../db/storyRepository'
import { VersionRepository } from '../../db/versionRepository'

describe('Migration Flow Integration', () => {
  let testDir: string
  let database: BabelDatabase

  beforeEach(async () => {
    testDir = path.join(__dirname, '../../..', 'test-migration-' + Date.now())
    fs.mkdirSync(testDir, { recursive: true })

    // Initialize database for testing
    const dbPath = path.join(testDir, 'babel.db')
    database = new BabelDatabase({ path: dbPath })
    await database.initialize()
  })

  afterEach(() => {
    database.close()
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true })
    }
  })

  test('Full migration flow: v1 repo → v2 repos', async () => {
    // Setup v1 workspace
    const v1Dir = path.join(testDir, 'v1')
    fs.mkdirSync(v1Dir)

    // Use valid UUIDs for test data
    const storyId = '550e8400-e29b-41d4-a716-446655440000'
    const draftVersionId = '550e8400-e29b-41d4-a716-446655440001'
    const outlineVersionId = '550e8400-e29b-41d4-a716-446655440002'
    const translationVersionId = '550e8400-e29b-41d4-a716-446655440003'

    // Create v1 babel.json
    const babelJson = {
      stories: [
        {
          id: storyId,
          title: 'Novel',
          created: Date.now(),
          versions: [draftVersionId, outlineVersionId, translationVersionId],
          versioningMode: 'git',
        },
      ],
      versions: [
        {
          id: draftVersionId,
          storyId,
          name: 'draft',
          created: Date.now(),
          wordCount: 1000,
          branch: 'draft1',
        },
        {
          id: outlineVersionId,
          storyId,
          name: 'outline',
          created: Date.now(),
          wordCount: 100,
          branch: 'outline',
        },
        {
          id: translationVersionId,
          storyId,
          name: 'translation',
          created: Date.now(),
          wordCount: 900,
          branch: 'translation',
        },
      ],
      backups: [],
      activity: [],
    }
    fs.writeFileSync(path.join(v1Dir, 'babel.json'), JSON.stringify(babelJson, null, 2))

    // Create v1 story git repo
    const storyDir = path.join(v1Dir, storyId)
    fs.mkdirSync(storyDir)
    const v1Git = simpleGit(storyDir)
    await v1Git.init()
    await v1Git.addConfig('user.email', 'test@test.local')
    await v1Git.addConfig('user.name', 'Test')

    // Create draft branch with draft.md
    fs.writeFileSync(path.join(storyDir, 'draft.md'), 'Draft content')
    await v1Git.add('draft.md')
    await v1Git.commit('initial: draft')
    await v1Git.branch(['-m', 'master', 'draft1'])

    // Create outline branch
    await v1Git.checkoutLocalBranch('outline')
    fs.writeFileSync(path.join(storyDir, 'outline.md'), 'Outline content')
    await v1Git.add('outline.md')
    await v1Git.commit('add outline')

    // Create translation branch
    await v1Git.checkout('draft1')
    await v1Git.checkoutLocalBranch('translation')
    fs.writeFileSync(path.join(storyDir, 'translation.md'), 'Translation content')
    await v1Git.add('translation.md')
    await v1Git.commit('add translation')

    // Setup v2 workspace (destination)
    const v2Dir = path.join(testDir, 'v2')
    fs.mkdirSync(v2Dir)

    // Initialize v2 story repos
    const v2StoryDir = path.join(v2Dir, storyId)
    fs.mkdirSync(v2StoryDir)
    const v2Git = simpleGit(v2StoryDir)
    await v2Git.init()
    await v2Git.addConfig('user.email', 'test@test.local')
    await v2Git.addConfig('user.name', 'Test')
    await v2Git.checkoutLocalBranch('draft')
    fs.writeFileSync(path.join(v2StoryDir, '.gitkeep'), '')
    await v2Git.add('.gitkeep')
    await v2Git.commit('initial commit')

    // Backup (move v1 data to backup)
    const backup = new MigrationBackup(v1Dir)
    const backupPath = backup.moveToBackup()
    expect(fs.existsSync(backupPath)).toBe(true)
    // Verify data was moved from v1Dir to backup
    expect(fs.existsSync(path.join(backupPath, 'babel.json'))).toBe(true)
    expect(fs.existsSync(path.join(backupPath, storyId))).toBe(true)

    // Validate - must validate from backup path since data was moved there
    const plan = migrationValidator.validate(backupPath)
    expect(plan.stories).toHaveLength(1)
    expect(plan.stories[0].versions).toHaveLength(3)

    // Execute Phase A & B
    const phaseAReport = await migrationExecutor.executePhaseA(plan, v2Dir, database.getDb())
    const phaseBReport = await migrationExecutor.executePhaseB(plan, v2Dir, database.getDb())

    // Verify v2 structure
    expect(fs.existsSync(v2StoryDir)).toBe(true)

    const branches = await v2Git.branch()

    // Should have draft and translation branches
    expect(branches.all).toContain('draft')
    expect(branches.all).toContain('translation')

    // Check draft branch files
    // For SHORT_STORY, migration writes to story.md, not draft.md
    await v2Git.checkout('draft')
    expect(fs.existsSync(path.join(v2StoryDir, 'story.md'))).toBe(true)
    expect(fs.existsSync(path.join(v2StoryDir, 'outline.md'))).toBe(true)

    // Check translation branch has inherited files
    await v2Git.checkout('translation')
    expect(fs.existsSync(path.join(v2StoryDir, 'story.md'))).toBe(true)
    expect(fs.existsSync(path.join(v2StoryDir, 'outline.md'))).toBe(true)

    // Verify database records were created
    const storyRepository = new StoryRepository(database.getDb())
    const story = storyRepository.findById(storyId)
    expect(story).toBeDefined()
    expect(story?.displayName).toBe('Novel')
    expect(story?.type).toBe('short-story')

    // Verify version records were created
    const versionRepository = new VersionRepository(database.getDb())
    const versions = versionRepository.findByStoryId(storyId)
    expect(versions.length).toBeGreaterThan(0)
    // Should have versions for draft and translation branches
    const versionBranches = versions.map(v => v.gitBranch)
    expect(versionBranches).toContain('draft')
  })
})
