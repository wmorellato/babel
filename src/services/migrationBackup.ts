import * as fs from 'fs'
import * as path from 'path'
import { BackupError, ValidationError } from '../utils/errorHandler'
import { Logger } from '../utils/logger'

const logger = new Logger('MigrationBackup')

export class MigrationBackup {
  constructor(private sourceDir: string) {
    this.validateSourceDir()
  }

  private validateSourceDir(): void {
    if (!this.sourceDir || typeof this.sourceDir !== 'string') {
      throw new ValidationError('sourceDir must be a non-empty string')
    }

    if (!fs.existsSync(this.sourceDir)) {
      throw new ValidationError(`Source directory does not exist: ${this.sourceDir}`)
    }

    const stats = fs.statSync(this.sourceDir)
    if (!stats.isDirectory()) {
      throw new ValidationError(`sourceDir must be a directory: ${this.sourceDir}`)
    }
  }

  /**
   * Move v1 data to backup directory
   * Returns the backup path
   */
  moveToBackup(): string {
    const backupDir = path.join(this.sourceDir, '.babel', 'backups')
    const backupPath = path.join(backupDir, `babel-v1-backup`)

    if (fs.existsSync(backupPath)) {
      logger.info(`Backup already exists at ${backupPath}, skipping move`)
      return backupPath
    }

    fs.mkdirSync(backupDir, { recursive: true })
    fs.mkdirSync(backupPath, { recursive: true })

    // Move babel.json to backup
    const babelJsonSource = path.join(this.sourceDir, 'babel.json')
    const babelJsonDest = path.join(backupPath, 'babel.json')
    if (fs.existsSync(babelJsonSource)) {
      fs.renameSync(babelJsonSource, babelJsonDest)
      logger.info(`Moved babel.json to backup`)
    }

    // Move all story folders (UUID-named directories) to backup
    const entries = fs.readdirSync(this.sourceDir, { withFileTypes: true })
    for (const entry of entries) {
      // Skip hidden directories and .babel
      if (entry.name.startsWith('.')) {
        continue
      }
      if (!entry.isDirectory()) {
        continue
      }

      const sourcePath = path.join(this.sourceDir, entry.name)
      const destPath = path.join(backupPath, entry.name)
      fs.renameSync(sourcePath, destPath)
      logger.info(`Moved story folder ${entry.name} to backup`)
    }

    return backupPath
  }

  /**
   * Restore from backup (move back to original location)
   */
  restoreFromBackup(backupPath: string): void {
    this.validateBackupPath(backupPath)

    const sourceDir = this.sourceDir

    // Restore babel.json
    const babelJsonSource = path.join(backupPath, 'babel.json')
    const babelJsonDest = path.join(sourceDir, 'babel.json')
    if (fs.existsSync(babelJsonSource)) {
      fs.renameSync(babelJsonSource, babelJsonDest)
      logger.info(`Restored babel.json from backup`)
    }

    // Restore all story folders
    const entries = fs.readdirSync(backupPath, { withFileTypes: true })
    for (const entry of entries) {
      // Skip .babel directory
      if (entry.name === '.babel') {
        continue
      }
      if (!entry.isDirectory()) {
        continue
      }

      const sourcePath = path.join(backupPath, entry.name)
      const destPath = path.join(sourceDir, entry.name)
      fs.renameSync(sourcePath, destPath)
      logger.info(`Restored story folder ${entry.name} from backup`)
    }
  }

  private validateBackupPath(backupPath: string): void {
    if (!backupPath || typeof backupPath !== 'string') {
      throw new ValidationError('backupPath must be a non-empty string')
    }

    if (!fs.existsSync(backupPath)) {
      throw new BackupError(`Backup not found: ${backupPath}`)
    }

    const stats = fs.statSync(backupPath)
    if (!stats.isDirectory()) {
      throw new BackupError(`backupPath must be a directory: ${backupPath}`)
    }
  }

  /**
   * Delete backup directory
   */
  deleteBackup(backupPath: string): void {
    if (fs.existsSync(backupPath)) {
      fs.rmSync(backupPath, { recursive: true })
      logger.info(`Deleted backup directory: ${backupPath}`)
    }
  }
}
