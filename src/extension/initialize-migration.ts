import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Logger } from '../utils/logger'
import { MigrationBackup } from '../services/migrationBackup'
import { MigrationPreviewGenerator } from '../services/migrationPreviewGenerator'
import { MigrationUIHandler } from '../services/migrationUIHandler'
import { migrationValidator } from '../services/migrationValidator'
import { migrationExecutor } from '../services/migrationExecutor'
import { migrationReporter } from '../services/migrationReporter'
import { BabelDatabase } from '../db/database'

const logger = new Logger('MigrationInitializer')

export class MigrationInitializer {
  constructor(
    private workspacePath: string,
    private dbPath: string
  ) {}

  /**
   * Check if migration is needed and run it if user confirms
   */
  async checkAndRunMigration(): Promise<boolean> {
    // Check if already initialized
    if (fs.existsSync(this.dbPath)) {
      return true // Already v2, no migration needed
    }

    // Check for v1 babel.json
    const babelJsonPath = path.join(this.workspacePath, 'babel.json')
    if (!fs.existsSync(babelJsonPath)) {
      return true // Fresh workspace, no migration needed
    }

    // Found v1 data, show dialog
    const uiHandler = new MigrationUIHandler()
    const choice = await uiHandler.showInitialDialog()

    if (choice === 'use-v1') {
      await uiHandler.showDowngradeMessage()
      return false // User chose to use v1
    }

    // User chose to migrate
    try {
      return await this.executeMigration()
    } catch (error) {
      logger.error('Migration failed', error)
      await vscode.window.showErrorMessage(
        `Migration failed: ${error instanceof Error ? error.message : String(error)}`
      )
      return false
    }
  }

  /**
   * Execute the full migration flow with progress indicators
   */
  private async executeMigration(): Promise<boolean> {
    const backup = new MigrationBackup(this.workspacePath)
    const uiHandler = new MigrationUIHandler()
    let backupPath: string | null = null

    // Initialize database
    const database = new BabelDatabase({ path: this.dbPath })
    await database.initialize()

    return vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Babel Migration',
        cancellable: false,
      },
      async (progress) => {
        try {
          // Phase 1: Backup - Move v1 data to backup
          progress.report({ message: 'Creating backup (moving v1 data)...', increment: 0 })
          logger.info('Starting migration backup (moving v1 data)...')
          backupPath = await this.moveToBackupAsync(backup)
          await uiHandler.showBackupProgress(backupPath)
          progress.report({ increment: 15 })

          // Phase 2: Validate - Now read from backup
          progress.report({ message: 'Validating v1 data...', increment: 0 })
          logger.info('Validating v1 data...')
          const plan = migrationValidator.validate(backupPath)
          progress.report({ increment: 10 })

          // Phase 3: Preview
          progress.report({ message: 'Generating preview...', increment: 0 })
          logger.info('Generating preview...')
          const previewGenerator = new MigrationPreviewGenerator(plan, backupPath)
          const previewMarkdown = previewGenerator.generatePreview()
          const previewPath = path.join(this.workspacePath, '.babel', 'migration-preview.md')
          fs.mkdirSync(path.dirname(previewPath), { recursive: true })
          fs.writeFileSync(previewPath, previewMarkdown)

          const previewChoice = await uiHandler.showPreviewDialog(previewPath)
          if (previewChoice === 'cancel') {
            logger.info('User cancelled migration after preview')
            await this.deleteBackupAsync(backup, backupPath)
            database.close()
            return false
          }

          if (previewChoice === 'open') {
            // User opened preview, ask again after closing editor
            const retryChoice = await uiHandler.showPreviewDialog(previewPath)
            if (retryChoice !== 'proceed') {
              await this.deleteBackupAsync(backup, backupPath)
              database.close()
              return false
            }
          }

          progress.report({ increment: 5 })

          // Phase 4A: Execute Phase A
          progress.report({ message: 'Migrating non-standard versions...', increment: 0 })
          logger.info('Executing Phase A (non-standard versions)...')
          const phaseAReport = await migrationExecutor.executePhaseA(plan, this.workspacePath, database.getDb())
          progress.report({ increment: 35 })

          // Phase 4B: Execute Phase B
          progress.report({ message: 'Migrating standard versions...', increment: 0 })
          logger.info('Executing Phase B (standard versions)...')
          const phaseBReport = await migrationExecutor.executePhaseB(plan, this.workspacePath, database.getDb())
          progress.report({ increment: 35 })

          // Combine reports
          const finalReport = {
            ...phaseBReport,
            storiesProcessed: [
              ...phaseAReport.storiesProcessed,
              ...phaseBReport.storiesProcessed,
            ],
          }

          // Phase 5: Generate results report
          progress.report({ message: 'Generating migration report...', increment: 0 })
          logger.info('Generating migration report...')
          const reportPath = path.join(this.workspacePath, '.babel', 'migration-report.json')
          fs.mkdirSync(path.dirname(reportPath), { recursive: true })
          migrationReporter.saveToFile(finalReport, reportPath)
          progress.report({ increment: 10 })

          // Phase 6: Show results
          const created = finalReport.summary.storiesCreated
          const skipped = finalReport.summary.storiesSkipped
          const failed = finalReport.storiesProcessed.filter(s => s.status === 'error').length

          progress.report({ message: 'Migration complete!', increment: 0 })
          await uiHandler.showResultsDialog(created, skipped, failed, reportPath)

          logger.info('Migration completed successfully')
          database.close()
          return true
        } catch (error) {
          logger.error('Migration error occurred', error)
          progress.report({ message: 'Migration error occurred', increment: 0 })
          database.close()

          if (backupPath) {
            const recovery = await uiHandler.showErrorRecoveryDialog([])

            if (recovery === 'rollback') {
              progress.report({ message: 'Rolling back to v1...', increment: 0 })
              logger.info('Rolling back to v1...')
              await this.restoreFromBackupAsync(backup, backupPath)
              await vscode.window.showInformationMessage('Rolled back to v1 data')
              return false
            } else if (recovery === 'keep') {
              logger.info('Keeping partial v2 migration')
              return true
            } else {
              // retry - just return false to let user try again
              return false
            }
          }

          throw error
        }
      }
    )
  }

  /**
   * Wrapper around backup.moveToBackup() to make it async-compatible
   */
  private moveToBackupAsync(backup: MigrationBackup): Promise<string> {
    return Promise.resolve(backup.moveToBackup())
  }

  /**
   * Wrapper around backup.deleteBackup() to make it async-compatible
   */
  private deleteBackupAsync(backup: MigrationBackup, backupPath: string): Promise<void> {
    return Promise.resolve(backup.deleteBackup(backupPath))
  }

  /**
   * Wrapper around backup.restoreFromBackup() to make it async-compatible
   */
  private restoreFromBackupAsync(backup: MigrationBackup, backupPath: string): Promise<void> {
    return Promise.resolve(backup.restoreFromBackup(backupPath))
  }
}
