#!/usr/bin/env node

/**
 * Migration script to convert file-based stories to git-based versioning
 *
 * Usage:
 *   node scripts/migrate-to-git.js [workspace-path] [options]
 *
 * Options:
 *   --dry-run          Show what would be migrated without making changes
 *   --story-id <id>    Migrate only a specific story by ID
 *   --backup           Create a backup before migration (recommended)
 *
 * Examples:
 *   node scripts/migrate-to-git.js ~/Documents/babel-workspace --dry-run
 *   node scripts/migrate-to-git.js ~/Documents/babel-workspace --backup
 *   node scripts/migrate-to-git.js ~/Documents/babel-workspace --story-id abc123
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Import from parent directory
const gitUtils = require('../src/git-utils');
const { BabelDb } = require('../src/database');

// Utility function (standalone version to avoid vscode dependency)
function normalizeFilename(filename) {
  if (typeof filename !== 'string') {
    throw new Error('Not a valid path');
  }
  return filename.toLowerCase().replace(/\s/g, '_');
}

const VersioningMode = {
  GIT: 'git',
  FILE: 'file',
};

class MigrationScript {
  constructor(workspaceDirectory, options = {}) {
    this.workspaceDirectory = workspaceDirectory;
    this.dryRun = options.dryRun || false;
    this.targetStoryId = options.storyId || null;
    this.createBackup = options.backup || false;
    this.db = new BabelDb(workspaceDirectory);
    this.stats = {
      totalStories: 0,
      migratedStories: 0,
      skippedStories: 0,
      totalVersions: 0,
      migratedVersions: 0,
      errors: [],
    };
  }

  log(message, level = 'info') {
    const prefix = this.dryRun ? '[DRY RUN] ' : '';
    const levelPrefix = {
      info: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      skip: '⏭️',
    }[level] || '•';

    console.log(`${prefix}${levelPrefix} ${message}`);
  }

  /**
   * Create a backup of the workspace
   */
  async createWorkspaceBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${this.workspaceDirectory}_backup_${timestamp}`;

    this.log(`Creating backup at: ${backupPath}`, 'info');

    if (!this.dryRun) {
      try {
        // Copy the entire workspace directory
        execSync(`cp -r "${this.workspaceDirectory}" "${backupPath}"`, { stdio: 'inherit' });
        this.log(`Backup created successfully at: ${backupPath}`, 'success');
        return backupPath;
      } catch (error) {
        this.log(`Failed to create backup: ${error.message}`, 'error');
        throw error;
      }
    } else {
      this.log(`Would create backup at: ${backupPath}`, 'info');
      return backupPath;
    }
  }

  /**
   * Check if git is available
   */
  checkGitAvailability() {
    if (!gitUtils.isGitAvailable()) {
      this.log('Git is not installed or not available in PATH', 'error');
      this.log('Please install git before running this migration', 'error');
      return false;
    }
    this.log('Git is available', 'success');
    return true;
  }

  /**
   * Get all stories that need migration
   */
  getStoriesToMigrate() {
    const allStories = this.db.getAllStories();
    this.stats.totalStories = allStories.length;

    const storiesToMigrate = allStories.filter(story => {
      // Filter by specific story ID if provided
      if (this.targetStoryId && story.id !== this.targetStoryId) {
        return false;
      }

      // Migrate stories that don't have versioningMode or are file-based
      return !story.versioningMode || story.versioningMode === VersioningMode.FILE;
    });

    this.log(`Found ${allStories.length} total stories`, 'info');
    this.log(`${storiesToMigrate.length} stories need migration`, 'info');

    return storiesToMigrate;
  }

  /**
   * Migrate a single story to git-based versioning
   */
  async migrateStory(story) {
    const storyDir = path.join(this.workspaceDirectory, story.id);

    this.log(`\nMigrating story: "${story.title}" (ID: ${story.id})`, 'info');

    // Check if story directory exists
    if (!fs.existsSync(storyDir)) {
      this.log(`Story directory not found: ${storyDir}`, 'error');
      this.stats.errors.push({
        storyId: story.id,
        error: 'Directory not found',
      });
      this.stats.skippedStories++;
      return false;
    }

    // Check if already a git repo
    if (gitUtils.isGitRepo(storyDir)) {
      this.log(`Story directory is already a git repository, skipping`, 'skip');
      this.stats.skippedStories++;
      return false;
    }

    // Get all versions for this story
    const versions = this.db.getVersionsByStory(story.id);
    if (!versions || versions.length === 0) {
      this.log(`No versions found for this story, skipping`, 'skip');
      this.stats.skippedStories++;
      return false;
    }

    this.log(`Found ${versions.length} versions to migrate`, 'info');
    this.stats.totalVersions += versions.length;

    if (this.dryRun) {
      this.log('Would initialize git repository', 'info');
      versions.forEach(version => {
        const normalizedName = normalizeFilename(version.name);
        this.log(`  Would create branch: ${normalizedName}`, 'info');
      });
      this.stats.migratedStories++;
      this.stats.migratedVersions += versions.length;
      return true;
    }

    try {
      // Initialize git repository with the first version's branch
      const firstVersion = versions[0];
      const firstBranch = normalizeFilename(firstVersion.name);

      this.log(`Initializing git repository with branch: ${firstBranch}`, 'info');
      gitUtils.initGitRepo(storyDir, firstBranch);

      // Migrate each version
      for (const version of versions) {
        const success = await this.migrateVersion(story.id, storyDir, version, version === firstVersion);
        if (success) {
          this.stats.migratedVersions++;
        }
      }

      // Update story metadata
      this.log('Updating story metadata to git mode', 'info');
      const updateInfo = {
        id: story.id,
        versioningMode: VersioningMode.GIT,
      };
      this.db.updateStoryInfo(updateInfo);

      this.stats.migratedStories++;
      this.log(`Successfully migrated story: "${story.title}"`, 'success');
      return true;

    } catch (error) {
      this.log(`Failed to migrate story: ${error.message}`, 'error');
      this.stats.errors.push({
        storyId: story.id,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Migrate a single version to a git branch
   */
  async migrateVersion(storyId, storyDir, version, isFirst = false) {
    const normalizedName = normalizeFilename(version.name);
    const versionFile = path.join(storyDir, normalizedName + '.md');

    this.log(`  Migrating version: ${version.name} -> branch: ${normalizedName}`, 'info');

    // Check if version file exists
    if (!fs.existsSync(versionFile)) {
      this.log(`    Version file not found: ${versionFile}`, 'warning');
      // Still create the branch with empty content
    }

    try {
      // Read existing content
      const content = fs.existsSync(versionFile) ? fs.readFileSync(versionFile, 'utf8') : '';

      if (!isFirst) {
        // For non-first versions, create a new branch from the first branch
        gitUtils.createBranch(storyDir, normalizedName);
      }

      // Commit the existing content
      // For the first version, the file was already created by initGitRepo
      // We need to update it with the actual content
      if (isFirst) {
        const draftFile = path.join(storyDir, 'draft.md');
        // If this is the first version and it's named 'draft', update draft.md
        // Otherwise, we need to handle the file correctly
        if (normalizedName === 'draft') {
          fs.writeFileSync(draftFile, content);
        } else {
          // Rename draft.md to the correct filename
          const correctFile = path.join(storyDir, normalizedName + '.md');
          fs.renameSync(draftFile, correctFile);
          fs.writeFileSync(correctFile, content);
        }
      } else {
        // For subsequent versions, write the file
        fs.writeFileSync(versionFile, content);
      }

      // Commit the content
      gitUtils.commit(storyDir, `Migrated version: ${version.name}`);

      // Update version metadata with branch name
      const updateInfo = {
        id: version.id,
        branch: normalizedName,
      };
      this.db.updateVersionInfo(updateInfo);

      this.log(`    ✓ Created branch and committed content`, 'success');
      return true;

    } catch (error) {
      this.log(`    Failed to migrate version: ${error.message}`, 'error');
      this.stats.errors.push({
        storyId: storyId,
        versionId: version.id,
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Print migration statistics
   */
  printStats() {
    console.log('\n' + '='.repeat(60));
    console.log('MIGRATION SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total stories found:     ${this.stats.totalStories}`);
    console.log(`Stories migrated:        ${this.stats.migratedStories}`);
    console.log(`Stories skipped:         ${this.stats.skippedStories}`);
    console.log(`Total versions:          ${this.stats.totalVersions}`);
    console.log(`Versions migrated:       ${this.stats.migratedVersions}`);

    if (this.stats.errors.length > 0) {
      console.log(`\nErrors encountered:      ${this.stats.errors.length}`);
      console.log('\nError details:');
      this.stats.errors.forEach((err, idx) => {
        console.log(`  ${idx + 1}. Story: ${err.storyId}${err.versionId ? `, Version: ${err.versionId}` : ''}`);
        console.log(`     Error: ${err.error}`);
      });
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Run the migration
   */
  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('GIT-BASED VERSIONING MIGRATION SCRIPT');
    console.log('='.repeat(60));
    console.log(`Workspace: ${this.workspaceDirectory}`);
    console.log(`Mode: ${this.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    if (this.targetStoryId) {
      console.log(`Target: Story ID ${this.targetStoryId}`);
    }
    console.log('='.repeat(60) + '\n');

    // Check git availability
    if (!this.checkGitAvailability()) {
      return;
    }

    // Create backup if requested
    if (this.createBackup && !this.dryRun) {
      try {
        await this.createWorkspaceBackup();
      } catch (error) {
        this.log('Backup failed. Aborting migration for safety.', 'error');
        return;
      }
    }

    // Get stories to migrate
    const storiesToMigrate = this.getStoriesToMigrate();

    if (storiesToMigrate.length === 0) {
      this.log('No stories need migration!', 'success');
      return;
    }

    // Confirm before proceeding (unless dry run)
    if (!this.dryRun) {
      console.log('\n⚠️  WARNING: This will modify your stories to use git-based versioning.');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Migrate each story
    for (const story of storiesToMigrate) {
      await this.migrateStory(story);
    }

    // Print statistics
    this.printStats();

    // Final message
    if (this.dryRun) {
      console.log('This was a dry run. No changes were made.');
      console.log('Run without --dry-run to perform the actual migration.\n');
    } else {
      console.log('Migration completed!');
      console.log('Your stories are now using git-based versioning.\n');
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    storyId: null,
    backup: false,
  };

  let workspacePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--backup') {
      options.backup = true;
    } else if (arg === '--story-id') {
      options.storyId = args[++i];
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('--')) {
      workspacePath = arg;
    }
  }

  return { workspacePath, options };
}

function printHelp() {
  console.log(`
Git-Based Versioning Migration Script

Usage:
  node scripts/migrate-to-git.js [workspace-path] [options]

Arguments:
  workspace-path     Path to your Babel workspace directory

Options:
  --dry-run          Show what would be migrated without making changes
  --story-id <id>    Migrate only a specific story by ID
  --backup           Create a backup before migration (recommended)
  --help, -h         Show this help message

Examples:
  # Dry run to see what would happen
  node scripts/migrate-to-git.js ~/Documents/babel-workspace --dry-run

  # Migrate with backup (recommended)
  node scripts/migrate-to-git.js ~/Documents/babel-workspace --backup

  # Migrate a specific story
  node scripts/migrate-to-git.js ~/Documents/babel-workspace --story-id abc123

  # Full migration without backup (use with caution)
  node scripts/migrate-to-git.js ~/Documents/babel-workspace

Notes:
  - Git must be installed and available in your PATH
  - It's recommended to use --backup for safety
  - Use --dry-run first to preview the migration
  - File-based stories will be converted to git branches
  - Existing git-based stories will be skipped
`);
}

// Main execution
async function main() {
  const { workspacePath, options } = parseArgs();

  if (!workspacePath) {
    console.error('Error: Workspace path is required\n');
    printHelp();
    process.exit(1);
  }

  // Resolve absolute path
  const absolutePath = path.resolve(workspacePath);

  // Check if workspace exists
  if (!fs.existsSync(absolutePath)) {
    console.error(`Error: Workspace directory not found: ${absolutePath}`);
    process.exit(1);
  }

  // Check if babel.json exists
  const dbPath = path.join(absolutePath, 'babel.json');
  if (!fs.existsSync(dbPath)) {
    console.error(`Error: babel.json not found in workspace: ${absolutePath}`);
    console.error('This does not appear to be a valid Babel workspace.');
    process.exit(1);
  }

  // Run migration
  const migration = new MigrationScript(absolutePath, options);
  await migration.run();
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  });
}

module.exports = { MigrationScript };
