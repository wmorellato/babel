// src/commands/migrationCommand.ts

import * as path from 'path'
import * as fs from 'fs'
import { migrationValidator } from '../services/migrationValidator'
import { migrationExecutor } from '../services/migrationExecutor'
import { migrationReporter } from '../services/migrationReporter'
import { BabelDatabase } from '../db/database'
import { StoryRepository } from '../db/storyRepository'
import { VersionRepository } from '../db/versionRepository'

export interface MigrationOptions {
  v2Directory?: string
  dryRun?: boolean
  verbose?: boolean
  reportFile?: string
}

export const migrationCommand = {
  async run(v1Directory: string, options: MigrationOptions = {}): Promise<number> {
    try {
      const v2Directory = options.v2Directory || process.cwd()

      console.log(`\nBabel v1 → v2 Migration`)
      console.log(`Source:      ${v1Directory}`)
      console.log(`Destination: ${v2Directory}`)
      console.log('')

      // Phase 1: Validate
      console.log('Phase 1: Validating v1 data...')
      let plan

      try {
        plan = migrationValidator.validate(v1Directory)
      } catch (error) {
        console.error(`Validation failed: ${error instanceof Error ? error.message : String(error)}`)
        return 1
      }

      const validStories = plan.stories.filter(s => s.status === 'valid').length
      console.log(`✓ Validation complete: ${validStories} stories ready, ${plan.stories.length - validStories} skipped`)
      console.log('')

      if (validStories === 0) {
        console.log('No stories to migrate.')
        return 0
      }

      // Check for dry-run
      if (options.dryRun) {
        console.log('[DRY RUN] Would migrate the above stories. No changes written.')
        return 0
      }

      // Phase 2: Execute
      console.log('Phase 2: Executing migration...')

      // Initialize real database at v2Directory/.babel/babel.db
      const babelDir = path.join(v2Directory, '.babel')
      if (!fs.existsSync(babelDir)) {
        fs.mkdirSync(babelDir, { recursive: true })
      }

      const databasePath = path.join(babelDir, 'babel.db')
      const database = new BabelDatabase({ path: databasePath })
      await database.initialize()

      // Create repositories for story and version persistence
      const db = database.getDb()
      const storyRepository = new StoryRepository(db)
      const versionRepository = new VersionRepository(db)

      // Create database adapter that implements createStory/createVersion
      const databaseAdapter = {
        createStory: (story: any) => {
          storyRepository.create({
            id: story.id,
            displayName: story.displayName,
            type: story.type,
            iconName: story.iconName,
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

      const report = await migrationExecutor.execute(plan, v2Directory, databaseAdapter)

      // Close database connection
      database.close()

      // Report
      console.log('')
      migrationReporter.print(report, options.reportFile || 'migration-report.json')

      // Determine exit code
      if (report.summary.storiesCreated === 0 && report.summary.storiesSkipped === plan.stories.length) {
        return 0 // All skipped is OK
      }

      if (report.summary.storiesCreated > 0) {
        return 0 // At least some success
      }

      return 1 // No stories created
    } catch (error) {
      console.error(`Fatal error: ${error instanceof Error ? error.message : String(error)}`)
      return 1
    }
  },
}
