import * as fs from 'fs'
import * as path from 'path'
import { MigrationBackup } from '../migrationBackup'
import { ValidationError, BackupError } from '../../utils/errorHandler'

describe('MigrationBackup', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = path.join(__dirname, '../../..', 'test-workspace-' + Date.now())
    fs.mkdirSync(tempDir, { recursive: true })
  })

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  test('moveToBackup moves babel.json and story folders to backup', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'babel.json'), '{"test": true}')

    // Create a story folder
    const storyDir = path.join(sourceDir, 'story-uuid-123')
    fs.mkdirSync(storyDir)
    fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')

    const backup = new MigrationBackup(sourceDir)
    const backupPath = backup.moveToBackup()

    // Verify backup exists and contains moved files
    expect(backupPath).toContain('.babel/backups/babel-backup-')
    expect(fs.existsSync(backupPath)).toBe(true)
    expect(fs.existsSync(path.join(backupPath, 'babel.json'))).toBe(true)
    expect(fs.existsSync(path.join(backupPath, 'story-uuid-123'))).toBe(true)

    // Verify files moved (not copied) - original location should be empty
    expect(fs.existsSync(path.join(sourceDir, 'babel.json'))).toBe(false)
    expect(fs.existsSync(path.join(sourceDir, 'story-uuid-123'))).toBe(false)
  })

  test('restoreFromBackup restores files to original location', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'babel.json'), '{"test": true}')

    const storyDir = path.join(sourceDir, 'story-uuid-123')
    fs.mkdirSync(storyDir)
    fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')

    const backup = new MigrationBackup(sourceDir)
    const backupPath = backup.moveToBackup()

    // Verify files are in backup
    expect(fs.existsSync(path.join(backupPath, 'babel.json'))).toBe(true)

    // Restore
    backup.restoreFromBackup(backupPath)

    // Verify files are back in source
    expect(fs.existsSync(path.join(sourceDir, 'babel.json'))).toBe(true)
    expect(fs.existsSync(path.join(sourceDir, 'story-uuid-123'))).toBe(true)

    // Verify backup is now empty (only .babel dir might exist)
    const backupEntries = fs.readdirSync(backupPath).filter(name => name !== '.babel')
    expect(backupEntries).toHaveLength(0)
  })

  test('deleteBackup removes backup directory', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'babel.json'), '{"test": true}')

    const backup = new MigrationBackup(sourceDir)
    const backupPath = backup.moveToBackup()

    expect(fs.existsSync(backupPath)).toBe(true)
    backup.deleteBackup(backupPath)
    expect(fs.existsSync(backupPath)).toBe(false)
  })

  test('moveToBackup skips hidden directories and non-directories', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'babel.json'), '{"test": true}')
    fs.writeFileSync(path.join(sourceDir, 'regular-file.txt'), 'should be skipped')

    // Create hidden directory
    fs.mkdirSync(path.join(sourceDir, '.hidden'))
    fs.writeFileSync(path.join(sourceDir, '.hidden', 'file.txt'), 'hidden')

    // Create .babel directory
    fs.mkdirSync(path.join(sourceDir, '.babel'))
    fs.writeFileSync(path.join(sourceDir, '.babel', 'config.json'), '{}')

    // Create a story folder
    const storyDir = path.join(sourceDir, 'story-uuid-123')
    fs.mkdirSync(storyDir)
    fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')

    const backup = new MigrationBackup(sourceDir)
    const backupPath = backup.moveToBackup()

    // Verify only story folder was moved
    expect(fs.existsSync(path.join(backupPath, 'story-uuid-123'))).toBe(true)
    expect(fs.existsSync(path.join(backupPath, 'regular-file.txt'))).toBe(false)
    expect(fs.existsSync(path.join(backupPath, '.hidden'))).toBe(false)

    // Verify original location still has non-moved items
    expect(fs.existsSync(path.join(sourceDir, '.hidden'))).toBe(true)
    expect(fs.existsSync(path.join(sourceDir, '.babel'))).toBe(true)
    expect(fs.existsSync(path.join(sourceDir, 'regular-file.txt'))).toBe(true)
  })

  test('restoreFromBackup skips .babel directory', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    fs.writeFileSync(path.join(sourceDir, 'babel.json'), '{"test": true}')

    const storyDir = path.join(sourceDir, 'story-uuid-123')
    fs.mkdirSync(storyDir)
    fs.writeFileSync(path.join(storyDir, 'draft.md'), 'content')

    const backup = new MigrationBackup(sourceDir)
    const backupPath = backup.moveToBackup()

    // Add .babel dir to backup (would exist from backups metadata)
    fs.mkdirSync(path.join(backupPath, '.babel'), { recursive: true })
    fs.writeFileSync(path.join(backupPath, '.babel', 'restore-test.json'), '{}')

    // Restore
    backup.restoreFromBackup(backupPath)

    // Verify .babel was not restored
    expect(fs.existsSync(path.join(sourceDir, 'story-uuid-123'))).toBe(true)
    expect(fs.existsSync(path.join(backupPath, '.babel'))).toBe(true)
  })

  test('constructor validates sourceDir is a non-empty string', () => {
    expect(() => new MigrationBackup('')).toThrow(ValidationError)
    expect(() => new MigrationBackup('')).toThrow('sourceDir must be a non-empty string')
  })

  test('constructor validates sourceDir exists', () => {
    const nonexistentDir = path.join(tempDir, 'nonexistent')
    expect(() => new MigrationBackup(nonexistentDir)).toThrow(ValidationError)
    expect(() => new MigrationBackup(nonexistentDir)).toThrow('does not exist')
  })

  test('constructor validates sourceDir is a directory', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)
    const filePath = path.join(sourceDir, 'test.txt')
    fs.writeFileSync(filePath, 'test')

    expect(() => new MigrationBackup(filePath)).toThrow(ValidationError)
    expect(() => new MigrationBackup(filePath)).toThrow('must be a directory')
  })

  test('restoreFromBackup validates backupPath is a non-empty string', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)

    const backup = new MigrationBackup(sourceDir)
    expect(() => backup.restoreFromBackup('')).toThrow(ValidationError)
    expect(() => backup.restoreFromBackup('')).toThrow('backupPath must be a non-empty string')
  })

  test('restoreFromBackup throws BackupError when backup not found', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)

    const backup = new MigrationBackup(sourceDir)
    const nonexistentBackup = path.join(tempDir, 'nonexistent-backup')

    expect(() => backup.restoreFromBackup(nonexistentBackup)).toThrow(BackupError)
    expect(() => backup.restoreFromBackup(nonexistentBackup)).toThrow('Backup not found')
  })

  test('restoreFromBackup validates backupPath is a directory', () => {
    const sourceDir = path.join(tempDir, 'source')
    fs.mkdirSync(sourceDir)

    const filePath = path.join(tempDir, 'backup-file.txt')
    fs.writeFileSync(filePath, 'test')

    const backup = new MigrationBackup(sourceDir)
    expect(() => backup.restoreFromBackup(filePath)).toThrow(BackupError)
    expect(() => backup.restoreFromBackup(filePath)).toThrow('must be a directory')
  })
})
