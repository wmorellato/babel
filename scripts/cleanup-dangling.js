#!/usr/bin/env node

/**
 * Cleanup script to remove dangling stories and versions from babel.json
 *
 * This script finds and removes:
 * - Stories that exist in babel.json but don't have a directory on disk
 * - Versions that exist in babel.json but don't have a corresponding file or git branch
 *
 * Usage:
 *   node scripts/cleanup-dangling.js [workspace-path] [options]
 *
 * Options:
 *   --dry-run          Show what would be removed without making changes
 *   --backup           Create a backup of babel.json before cleanup
 *
 * Examples:
 *   node scripts/cleanup-dangling.js ~/Documents/babel-workspace --dry-run
 *   node scripts/cleanup-dangling.js ~/Documents/babel-workspace --backup
 */

const fs = require('fs');
const path = require('path');

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

class CleanupScript {
  constructor(workspaceDirectory, options = {}) {
    this.workspaceDirectory = workspaceDirectory;
    this.dryRun = options.dryRun || false;
    this.createBackup = options.backup || false;
    this.db = new BabelDb(workspaceDirectory);
    this.stats = {
      totalStories: 0,
      danglingStories: 0,
      totalVersions: 0,
      danglingVersions: 0,
      removedStories: [],
      removedVersions: [],
    };
  }

  log(message, level = 'info') {
    const prefix = this.dryRun ? '[DRY RUN] ' : '';
    const levelPrefix = {
      info: '📝',
      success: '✅',
      warning: '⚠️',
      error: '❌',
      found: '🔍',
    }[level] || '•';

    console.log(`${prefix}${levelPrefix} ${message}`);
  }

  /**
   * Create a backup of babel.json
   */
  createDatabaseBackup() {
    const dbPath = path.join(this.workspaceDirectory, 'babel.json');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = path.join(this.workspaceDirectory, `babel.json.backup-${timestamp}`);

    this.log(`Creating backup at: ${backupPath}`, 'info');

    if (!this.dryRun) {
      try {
        fs.copyFileSync(dbPath, backupPath);
        this.log(`Backup created successfully`, 'success');
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
   * Check if a story directory exists on disk
   */
  storyDirectoryExists(storyId) {
    const storyDir = path.join(this.workspaceDirectory, storyId);
    return fs.existsSync(storyDir) && fs.statSync(storyDir).isDirectory();
  }

  /**
   * Check if a version exists on disk (as file or git branch)
   */
  versionExists(story, version) {
    const storyDir = path.join(this.workspaceDirectory, story.id);
    const normalizedName = normalizeFilename(version.name);

    // Check versioning mode
    if (story.versioningMode === VersioningMode.GIT) {
      // Git-based: check if branch exists
      if (!gitUtils.isGitRepo(storyDir)) {
        // Story should be git-based but doesn't have a git repo
        return false;
      }

      const branches = gitUtils.getAllBranches(storyDir);
      return version.branch ? branches.includes(version.branch) : branches.includes(normalizedName);
    } else {
      // File-based: check if file exists
      const versionFile = path.join(storyDir, normalizedName + '.md');
      return fs.existsSync(versionFile);
    }
  }

  /**
   * Find all dangling stories and versions
   */
  findDanglingEntries() {
    this.log('\nScanning for dangling entries...', 'info');

    const allStories = this.db.getAllStories();
    this.stats.totalStories = allStories.length;

    const danglingStories = [];
    const danglingVersions = [];

    for (const story of allStories) {
      // Check if story directory exists
      if (!this.storyDirectoryExists(story.id)) {
        this.log(`Found dangling story: "${story.title}" (ID: ${story.id})`, 'found');
        danglingStories.push(story);
        this.stats.danglingStories++;

        // All versions of this story are also dangling
        const versions = this.db.getVersionsByStory(story.id);
        this.stats.totalVersions += versions.length;
        this.stats.danglingVersions += versions.length;
        continue;
      }

      // Story exists, check its versions
      const versions = this.db.getVersionsByStory(story.id);
      this.stats.totalVersions += versions.length;

      for (const version of versions) {
        if (!this.versionExists(story, version)) {
          this.log(`  Found dangling version: "${version.name}" in story "${story.title}"`, 'found');
          danglingVersions.push({
            story: story,
            version: version,
          });
          this.stats.danglingVersions++;
        }
      }
    }

    return { danglingStories, danglingVersions };
  }

  /**
   * Remove dangling stories from database
   */
  removeDanglingStories(stories) {
    if (stories.length === 0) {
      return;
    }

    this.log(`\n${this.dryRun ? 'Would remove' : 'Removing'} ${stories.length} dangling stories...`, 'info');

    for (const story of stories) {
      if (this.dryRun) {
        this.log(`  Would remove story: "${story.title}" (ID: ${story.id})`, 'info');
      } else {
        try {
          this.db.deleteStory(story.id);
          this.log(`  Removed story: "${story.title}" (ID: ${story.id})`, 'success');
          this.stats.removedStories.push(story);
        } catch (error) {
          this.log(`  Failed to remove story "${story.title}": ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * Remove dangling versions from database
   */
  removeDanglingVersions(versions) {
    if (versions.length === 0) {
      return;
    }

    this.log(`\n${this.dryRun ? 'Would remove' : 'Removing'} ${versions.length} dangling versions...`, 'info');

    for (const { story, version } of versions) {
      if (this.dryRun) {
        this.log(`  Would remove version: "${version.name}" from story "${story.title}"`, 'info');
      } else {
        try {
          this.db.deleteVersion(story.id, version.id);
          this.log(`  Removed version: "${version.name}" from story "${story.title}"`, 'success');
          this.stats.removedVersions.push(version);
        } catch (error) {
          this.log(`  Failed to remove version "${version.name}": ${error.message}`, 'error');
        }
      }
    }
  }

  /**
   * Print cleanup statistics
   */
  printStats() {
    console.log('\n' + '='.repeat(60));
    console.log('CLEANUP SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total stories checked:       ${this.stats.totalStories}`);
    console.log(`Dangling stories found:      ${this.stats.danglingStories}`);
    console.log(`Total versions checked:      ${this.stats.totalVersions}`);
    console.log(`Dangling versions found:     ${this.stats.danglingVersions}`);

    if (!this.dryRun) {
      console.log(`\nStories removed:             ${this.stats.removedStories.length}`);
      console.log(`Versions removed:            ${this.stats.removedVersions.length}`);
    }

    if (this.stats.danglingStories === 0 && this.stats.danglingVersions === 0) {
      console.log('\n✨ Database is clean! No dangling entries found.');
    } else if (this.dryRun) {
      console.log('\n⚠️  This was a dry run. Run without --dry-run to remove dangling entries.');
    } else {
      console.log('\n✅ Cleanup completed successfully!');
    }

    console.log('='.repeat(60) + '\n');
  }

  /**
   * Run the cleanup
   */
  async run() {
    console.log('\n' + '='.repeat(60));
    console.log('DANGLING ENTRIES CLEANUP SCRIPT');
    console.log('='.repeat(60));
    console.log(`Workspace: ${this.workspaceDirectory}`);
    console.log(`Mode: ${this.dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`);
    console.log('='.repeat(60) + '\n');

    // Create backup if requested
    if (this.createBackup && !this.dryRun) {
      try {
        this.createDatabaseBackup();
      } catch (error) {
        this.log('Backup failed. Aborting cleanup for safety.', 'error');
        return;
      }
    }

    // Find dangling entries
    const { danglingStories, danglingVersions } = this.findDanglingEntries();

    if (danglingStories.length === 0 && danglingVersions.length === 0) {
      this.log('\n✨ No dangling entries found! Database is clean.', 'success');
      this.printStats();
      return;
    }

    // Show what was found
    this.log(`\nFound ${danglingStories.length} dangling stories and ${danglingVersions.length} dangling versions`, 'warning');

    // Confirm before proceeding (unless dry run)
    if (!this.dryRun && (danglingStories.length > 0 || danglingVersions.length > 0)) {
      console.log('\n⚠️  WARNING: This will permanently remove entries from babel.json.');
      console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Remove dangling entries
    this.removeDanglingStories(danglingStories);
    this.removeDanglingVersions(danglingVersions);

    // Print statistics
    this.printStats();

    // Final message
    if (this.dryRun) {
      console.log('This was a dry run. No changes were made.');
      console.log('Run without --dry-run to perform the actual cleanup.\n');
    } else if (this.createBackup) {
      console.log('A backup of babel.json was created before cleanup.');
      console.log('You can restore it if needed.\n');
    }
  }
}

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    dryRun: false,
    backup: false,
  };

  let workspacePath = null;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--backup') {
      options.backup = true;
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
Dangling Entries Cleanup Script

This script removes stories and versions from babel.json that don't have
corresponding files or directories on disk.

Usage:
  node scripts/cleanup-dangling.js [workspace-path] [options]

Arguments:
  workspace-path     Path to your Babel workspace directory

Options:
  --dry-run          Show what would be removed without making changes
  --backup           Create a backup of babel.json before cleanup
  --help, -h         Show this help message

Examples:
  # Dry run to see what would be removed
  node scripts/cleanup-dangling.js ~/Documents/babel-workspace --dry-run

  # Cleanup with backup (recommended)
  node scripts/cleanup-dangling.js ~/Documents/babel-workspace --backup

  # Cleanup without backup
  node scripts/cleanup-dangling.js ~/Documents/babel-workspace

What gets removed:
  - Stories that exist in babel.json but don't have a directory on disk
  - Versions that exist in babel.json but don't have a file or git branch
  - All versions of stories that no longer exist

Note:
  It's recommended to use --backup for safety, especially if you're not
  sure about the state of your workspace.
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

  // Run cleanup
  const cleanup = new CleanupScript(absolutePath, options);
  await cleanup.run();
}

// Handle errors gracefully
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  process.exit(1);
});

// Run the script
if (require.main === module) {
  main().catch(error => {
    console.error('\n❌ Cleanup failed:', error);
    process.exit(1);
  });
}

module.exports = { CleanupScript };
