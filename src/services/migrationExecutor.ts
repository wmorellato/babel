import * as fs from 'fs'
import * as path from 'path'
import { simpleGit, SimpleGit } from 'simple-git'
import { v1DataLoader } from './v1DataLoader'
import { migrationLogger } from '../utils/migrationLogger'
import { MigrationPlan, MigrationReport, StoryMigrationResult, VersionStagingPlan } from '../types'
import { v4 as uuidv4 } from 'uuid'
import { IDatabase } from '../db/database'
import { StoryRepository } from '../db/storyRepository'
import { VersionRepository } from '../db/versionRepository'

/**
 * Check if a version name matches the standard pattern (draft*, revision*, translation*)
 */
function isStandardVersion(name: string): boolean {
  return /^(draft|revision|translation)\d*$/.test(name)
}

export const migrationExecutor = {
  /**
   * Execute Phase A: Copy non-standard versions (I, II, outline, characters, etc.)
   * to draft branch as files with their original filenames
   */
  async executePhaseA(plan: MigrationPlan, v2Directory: string, database: IDatabase): Promise<MigrationReport> {
    migrationLogger.reset()
    const results: StoryMigrationResult[] = []
    let totalVersionsMigrated = 0
    let totalCommits = 0

    for (const story of plan.stories) {
      if (story.status === 'skipped') {
        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'skipped',
          error: story.skipReason,
        })
        continue
      }

      try {
        const storyDir = path.join(v2Directory, story.v1Id)
        fs.mkdirSync(storyDir, { recursive: true })

        // Create story record in database
        const storyRepository = new StoryRepository(database)
        storyRepository.create({
          id: story.v1Id,
          displayName: story.title,
          type: story.type as any,
          createdAt: story.createdAt,
          updatedAt: new Date(),
        })

        const git: SimpleGit = simpleGit(storyDir)

        // Initialize the git repo
        await git.init()
        await git.addConfig('user.email', 'migration@babel.local')
        await git.addConfig('user.name', 'Babel Migrator')

        // Create initial commit
        const readmePath = path.join(storyDir, '.gitkeep')
        fs.writeFileSync(readmePath, '')
        await git.add('.gitkeep')
        await git.commit('initial commit')
        await git.rm('.gitkeep')
        await git.commit('remove placeholder')

        // Rename default branch from master to draft
        try {
          await git.branch(['-m', 'master', 'draft'])
        } catch (error) {
          migrationLogger.warn(`Could not rename master branch to draft`, {
            storyId: story.v1Id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        // Ensure on draft branch
        const branches = await git.branch()
        if (!branches.all.includes('draft')) {
          await git.checkoutLocalBranch('draft')
        } else {
          await git.checkout('draft')
        }

        let versionsCreated = 0
        let commitsCreated = 0

        // Process only non-standard versions (Phase A)
        for (const version of story.versions) {
          if (isStandardVersion(version.name)) {
            continue // Skip standard versions, Phase B will handle them
          }

          try {
            await this.migrateVersionPhaseA(version, story.v1Id, plan.v1Source, storyDir, git, database)
            versionsCreated++
            commitsCreated++
          } catch (error) {
            migrationLogger.error(
              `Failed to migrate version ${version.name} in Phase A for ${story.title}: ${error instanceof Error ? error.message : String(error)}`,
              {
                storyId: story.v1Id,
                versionName: version.name,
                error: error instanceof Error ? error.message : String(error),
              }
            )
          }
        }

        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: versionsCreated > 0 ? 'created' : 'skipped',
          versionsCreated,
          commitsCreated,
          branchesCreated: [],
        })

        totalVersionsMigrated += versionsCreated
        totalCommits += commitsCreated
      } catch (error) {
        migrationLogger.error(`Failed Phase A for story`, {
          storyId: story.v1Id,
          error: error instanceof Error ? error.message : String(error),
        })
        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return {
      timestamp: new Date(),
      v1Source: plan.v1Source,
      v2Destination: v2Directory,
      summary: {
        totalStories: plan.stories.length,
        storiesCreated: results.filter(r => r.status === 'created').length,
        storiesSkipped: results.filter(r => r.status === 'skipped').length,
        versionsMigrated: totalVersionsMigrated,
        gitCommits: totalCommits,
      },
      storiesProcessed: results,
      validationErrors: plan.globalErrors,
      executionErrors: migrationLogger.getAllErrors(),
    }
  },

  /**
   * Execute Phase B: Copy standard versions (draft*, revision*, translation*)
   * creating branches as needed, always writing to draft.md
   */
  async executePhaseB(plan: MigrationPlan, v2Directory: string, database: IDatabase): Promise<MigrationReport> {
    migrationLogger.reset()
    const results: StoryMigrationResult[] = []
    let totalVersionsMigrated = 0
    let totalCommits = 0
    const allBranchesCreated: Set<string> = new Set()

    for (const story of plan.stories) {
      if (story.status === 'skipped') {
        continue // Already handled in Phase A
      }

      try {
        const storyDir = path.join(v2Directory, story.v1Id)
        fs.mkdirSync(storyDir, { recursive: true })

        // Ensure story record exists (created in Phase A, but verify here)
        const storyRepository = new StoryRepository(database)
        if (!storyRepository.findById(story.v1Id)) {
          storyRepository.create({
            id: story.v1Id,
            displayName: story.title,
            type: story.type as any,
            createdAt: story.createdAt,
            updatedAt: new Date(),
          })
        }

        const git: SimpleGit = simpleGit(storyDir)

        // Initialize the git repo
        await git.init()
        await git.addConfig('user.email', 'migration@babel.local')
        await git.addConfig('user.name', 'Babel Migrator')

        // Create initial commit
        const readmePath = path.join(storyDir, '.gitkeep')
        fs.writeFileSync(readmePath, '')
        await git.add('.gitkeep')
        await git.commit('initial commit')
        await git.rm('.gitkeep')
        await git.commit('remove placeholder')

        // Rename default branch from master to draft
        try {
          await git.branch(['-m', 'master', 'draft'])
        } catch (error) {
          migrationLogger.warn(`Could not rename master branch to draft`, {
            storyId: story.v1Id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        let versionsCreated = 0
        let commitsCreated = 0
        const storyBranchesCreated: string[] = []

        // Process only standard versions (Phase B)
        for (const version of story.versions) {
          if (!isStandardVersion(version.name)) {
            continue // Phase A handled these
          }

          try {
            const branchCreated = await this.migrateVersionPhaseB(
              version,
              story.v1Id,
              story.type,
              plan.v1Source,
              storyDir,
              git,
              database
            )

            if (branchCreated) {
              allBranchesCreated.add(version.targetBranch)
              storyBranchesCreated.push(version.targetBranch)
            }

            versionsCreated++
            commitsCreated++
          } catch (error) {
            migrationLogger.error(
              `Failed to migrate version ${version.name} in Phase B for ${story.title}: ${error instanceof Error ? error.message : String(error)}`,
              {
                storyId: story.v1Id,
                versionName: version.name,
                error: error instanceof Error ? error.message : String(error),
              }
            )
          }
        }

        if (versionsCreated > 0) {
          results.push({
            v1Id: story.v1Id,
            title: story.title,
            type: story.type,
            status: 'created',
            versionsCreated,
            commitsCreated,
            branchesCreated: storyBranchesCreated,
          })
          totalVersionsMigrated += versionsCreated
          totalCommits += commitsCreated
        }
      } catch (error) {
        migrationLogger.error(`Failed Phase B for story`, {
          storyId: story.v1Id,
          error: error instanceof Error ? error.message : String(error),
        })
        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    return {
      timestamp: new Date(),
      v1Source: plan.v1Source,
      v2Destination: v2Directory,
      summary: {
        totalStories: plan.stories.length,
        storiesCreated: results.filter(r => r.status === 'created').length,
        storiesSkipped: results.filter(r => r.status === 'skipped').length,
        versionsMigrated: totalVersionsMigrated,
        gitCommits: totalCommits,
      },
      storiesProcessed: results,
      validationErrors: plan.globalErrors,
      executionErrors: migrationLogger.getAllErrors(),
    }
  },

  /**
   * Execute migration plan: create stories in database, initialize git repos,
   * process versions with branches and commits (legacy single-pass execution)
   */
  async execute(
    plan: MigrationPlan,
    v2Directory: string,
    database: any,
  ): Promise<MigrationReport> {
    migrationLogger.reset()

    const startTime = Date.now()
    const results: StoryMigrationResult[] = []

    // Initialize v2 directory
    if (!fs.existsSync(v2Directory)) {
      fs.mkdirSync(v2Directory, { recursive: true })
    }

    // Create stories subdirectory for the migrated stories
    const storiesDir = path.join(v2Directory, 'stories')
    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true })
    }

    let totalVersionsMigrated = 0
    let totalCommits = 0

    // Process each story
    for (const story of plan.stories) {
      if (story.status === 'skipped') {
        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'skipped',
          error: story.skipReason,
        })
        continue
      }

      try {
        // Create story record in database
        database.createStory({
          id: story.v1Id,
          displayName: story.title,
          type: story.type,
          createdAt: story.createdAt,
          updatedAt: story.createdAt,
        })

        // Initialize story git repo
        const storyDir = path.join(storiesDir, story.v1Id)
        fs.mkdirSync(storyDir, { recursive: true })

        const git: SimpleGit = simpleGit(storyDir)
        await git.init()

        // Configure git for commits
        await git.addConfig('user.email', 'migration@babel.local')
        await git.addConfig('user.name', 'Babel Migrator')

        // Create initial commit
        const readmePath = path.join(storyDir, '.gitkeep')
        fs.writeFileSync(readmePath, '')
        await git.add('.gitkeep')
        await git.commit('initial commit')
        await git.rm('.gitkeep')
        await git.commit('remove placeholder')

        // Rename default branch from master to draft
        try {
          await git.branch(['-m', 'master', 'draft'])
        } catch (error) {
          migrationLogger.warn(`Could not rename master branch to draft`, {
            storyId: story.v1Id,
            error: error instanceof Error ? error.message : String(error),
          })
        }

        let versionsCreated = 0
        let commitsCreated = 0
        const branchesCreated: string[] = []
        let currentBranch = 'draft'

        // Process versions
        for (const version of story.versions) {
          try {
            // Checkout the correct v1 branch if specified
            if (version.v1Branch) {
              const v1StoryDir = path.join(plan.v1Source, story.v1Id)
              const v1Git: SimpleGit = simpleGit(v1StoryDir)

              try {
                if (version.v1Branch === 'draft' && story.versions) {
                  // Check if 'outline' branch exists before merging
                  const hasOutline = story.versions.some(v => v.v1Branch === 'outline')
                  if (hasOutline) {
                    migrationLogger.info(`Merging outline branch into draft`, {
                      storyId: story.v1Id,
                    })

                    await v1Git.mergeFromTo('outline', 'draft')
                  }
                }
              } catch (error) {
                migrationLogger.warn(`Could not merge branches into draft`, {
                  storyId: story.v1Id,
                  error: error instanceof Error ? error.message : String(error),
                })
              }

              try {
                if (version.v1Branch === 'draft' && story.versions) {
                  // Check if 'characters' branch exists before merging
                  const hasCharacters = story.versions.some(v => v.v1Branch === 'characters')
                  if (hasCharacters) {
                    migrationLogger.info(`Merging characters branch into draft`, {
                      storyId: story.v1Id,
                    })

                    await v1Git.mergeFromTo('characters', 'draft')
                  }
                }
              } catch (error) {
                migrationLogger.warn(`Could not merge branches into draft`, {
                  storyId: story.v1Id,
                  error: error instanceof Error ? error.message : String(error),
                })
              }

              if (!['outline', 'characters'].includes(version.v1Branch)) {
                try {
                  await v1Git.checkout(version.v1Branch)
                } catch (error) {
                  migrationLogger.warn(`Could not checkout v1 branch ${version.v1Branch}`, {
                    storyId: story.v1Id,
                    branch: version.v1Branch,
                    error: error instanceof Error ? error.message : String(error),
                  })
                }
              } else {
                migrationLogger.info(`Skipping checkout for version ${version.v1Branch} since it's already merged into draft`, {
                  storyId: story.v1Id
                })
              }
            }

            const fileContent = v1DataLoader.readFileContent(version.filePath)

            if (version.action === 'create-branch') {
              // Create new branch
              const branchName = version.targetBranch
              try {
                await git.checkoutLocalBranch(branchName)
              } catch {
                // Branch might not exist, create from current
                await git.checkout(['-b', branchName])
              }
              currentBranch = branchName
              branchesCreated.push(branchName)
            } else if (version.targetBranch !== currentBranch) {
              // For commit-to-current, ensure we're on the correct target branch
              try {
                await git.checkout(version.targetBranch)
                currentBranch = version.targetBranch
              } catch (error) {
                migrationLogger.warn(`Could not checkout target branch ${version.targetBranch}`, {
                  storyId: story.v1Id,
                  branch: version.targetBranch,
                  error: error instanceof Error ? error.message : String(error),
                })
              }
            }

            // Write file
            const targetPath = path.join(storyDir, version.targetFileName)
            fs.writeFileSync(targetPath, fileContent)

            // Commit
            await git.add(version.targetFileName)
            const commitMessage = `migrate: import ${version.name} from v1`
            await git.commit(commitMessage)
            commitsCreated++

            // Create version record
            database.createVersion({
              id: uuidv4(),
              storyId: story.v1Id,
              gitBranch: version.targetBranch,
              createdAt: new Date(),
            })

            versionsCreated++
          } catch (error) {
            migrationLogger.error(`Failed to process version ${version.v1VersionId} ${version.name} - ${story.title}`, {
              storyId: story.v1Id,
              versionId: version.v1VersionId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        }

        // Checkout main
        try {
          await git.checkout('main')
        } catch {
          // main branch might not exist, ignore
        }

        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'created',
          versionsCreated,
          commitsCreated,
          branchesCreated,
        })

        totalVersionsMigrated += versionsCreated
        totalCommits += commitsCreated

        migrationLogger.info(`Story migrated successfully`, {
          storyId: story.v1Id,
          title: story.title,
          versionsCreated,
          branchesCreated: branchesCreated.length,
        })
      } catch (error) {
        migrationLogger.error(`Failed to migrate story`, {
          storyId: story.v1Id,
          title: story.title,
          error: error instanceof Error ? error.message : String(error),
        })

        results.push({
          v1Id: story.v1Id,
          title: story.title,
          type: story.type,
          status: 'error',
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const report: MigrationReport = {
      timestamp: new Date(),
      v1Source: plan.v1Source,
      v2Destination: v2Directory,
      summary: {
        totalStories: plan.stories.length,
        storiesCreated: results.filter(r => r.status === 'created').length,
        storiesSkipped: results.filter(r => r.status === 'skipped').length,
        versionsMigrated: totalVersionsMigrated,
        gitCommits: totalCommits,
      },
      storiesProcessed: results,
      validationErrors: plan.globalErrors,
      executionErrors: migrationLogger.getAllErrors(),
    }

    return report
  },

  /**
   * Migrate a single non-standard version (Phase A)
   */
  async migrateVersionPhaseA(
    version: VersionStagingPlan,
    storyId: string,
    v1Source: string,
    v2StoryDir: string,
    git: SimpleGit,
    database: IDatabase
  ): Promise<void> {
    // Checkout v1 branch
    const v1StoryDir = path.join(v1Source, storyId)
    const v1Git = simpleGit(v1StoryDir)

    if (version.v1Branch) {
      try {
        await v1Git.checkout(version.v1Branch)
      } catch (error) {
        migrationLogger.warn(
          `Could not checkout v1 branch ${version.v1Branch}`,
          { storyId, branch: version.v1Branch }
        )
      }
    }

    // Merge outline and characters if present
    try {
      const branches = await v1Git.branch()
      if (branches.all.includes('outline')) {
        await v1Git.merge(['outline']).catch(() => {})
      }
      if (branches.all.includes('characters')) {
        await v1Git.merge(['characters']).catch(() => {})
      }
    } catch (error) {
      // Ignore merge errors
    }

    // Read file content
    const fileContent = v1DataLoader.readFileContent(version.filePath)

    // Ensure on draft branch in v2
    await git.checkout('draft').catch(() => {})

    // Write file with original filename
    const targetPath = path.join(v2StoryDir, version.targetFileName)
    fs.writeFileSync(targetPath, fileContent)

    // Commit
    await git.add(version.targetFileName)
    await git.commit(`migrate: add ${version.targetFileName} from v1`)

    // Create version record
    const versionRepository = new VersionRepository(database)
    versionRepository.create({
      id: uuidv4(),
      storyId,
      gitBranch: version.targetBranch,
      createdAt: new Date(),
    })
  },

  /**
   * Migrate a single standard version (Phase B)
   */
  async migrateVersionPhaseB(
    version: VersionStagingPlan,
    storyId: string,
    storyType: string,
    v1Source: string,
    v2StoryDir: string,
    git: SimpleGit,
    database: IDatabase
  ): Promise<boolean> {
    // Checkout v1 branch
    const v1StoryDir = path.join(v1Source, storyId)
    const v1Git = simpleGit(v1StoryDir)

    if (version.v1Branch) {
      try {
        await v1Git.checkout(version.v1Branch)
      } catch (error) {
        migrationLogger.warn(
          `Could not checkout v1 branch ${version.v1Branch}`,
          { storyId, branch: version.v1Branch }
        )
      }
    }

    // Merge outline and characters if present
    try {
      const branches = await v1Git.branch()
      if (branches.all.includes('outline')) {
        await v1Git.merge(['outline']).catch(() => {})
      }
      if (branches.all.includes('characters')) {
        await v1Git.merge(['characters']).catch(() => {})
      }
    } catch (error) {
      // Ignore merge errors
    }

    // Read file content
    const fileContent = v1DataLoader.readFileContent(version.filePath)

    // Create/checkout target branch in v2
    const branches = await git.branch()
    let branchCreated = false

    if (!branches.all.includes(version.targetBranch)) {
      await git.checkoutLocalBranch(version.targetBranch)
      branchCreated = true
    } else {
      await git.checkout(version.targetBranch)
    }

    // Determine target filename based on story type
    // SHORT_STORY and ESSAY use story.md; others use draft.md for standard versions
    const targetFileName = (storyType === 'short-story' || storyType === 'essay') ? 'story.md' : 'draft.md'
    const targetPath = path.join(v2StoryDir, targetFileName)
    fs.writeFileSync(targetPath, fileContent)

    // Commit
    await git.add(targetFileName)
    await git.commit(`migrate: add ${targetFileName} from v1`)

    // Create version record
    const versionRepository = new VersionRepository(database)
    versionRepository.create({
      id: uuidv4(),
      storyId,
      gitBranch: version.targetBranch,
      createdAt: new Date(),
    })

    return branchCreated
  },
}
