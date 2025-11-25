# Migration Guide: File-Based to Git-Based Versioning

This guide explains how to migrate your existing file-based stories to the new git-based versioning system.

## Overview

The new git-based versioning system offers:
- Complete edit history for each version (every save creates a commit)
- Branch-based version management (each version is a git branch)
- Standard git tools compatibility
- Automatic fallback to file-based mode if git is unavailable

## Prerequisites

1. **Git must be installed** on your system
   ```bash
   git --version
   ```
   If git is not installed, download it from [git-scm.com](https://git-scm.com/)

2. **Backup your workspace** (strongly recommended)
   ```bash
   cp -r ~/Documents/babel-workspace ~/Documents/babel-workspace-backup
   ```

## Migration Script

The migration script is located at `scripts/migrate-to-git.js`

### Basic Usage

```bash
# Dry run - see what would happen without making changes
node scripts/migrate-to-git.js ~/Documents/babel-workspace --dry-run

# Migrate with automatic backup (recommended)
node scripts/migrate-to-git.js ~/Documents/babel-workspace --backup

# Migrate without backup (use with caution)
node scripts/migrate-to-git.js ~/Documents/babel-workspace
```

### Options

- `--dry-run` - Preview the migration without making any changes
- `--backup` - Create a timestamped backup before migration
- `--story-id <id>` - Migrate only a specific story by its ID
- `--help` - Show help message

### Examples

```bash
# Preview what would be migrated
node scripts/migrate-to-git.js ~/Documents/babel-workspace --dry-run

# Migrate all stories with backup
node scripts/migrate-to-git.js ~/Documents/babel-workspace --backup

# Migrate a specific story
node scripts/migrate-to-git.js ~/Documents/babel-workspace --story-id "abc123"
```

## What the Migration Does

For each file-based story, the script:

1. **Creates a git repository** in the story directory
2. **Creates a branch for each version** (using the normalized version name)
3. **Commits the existing content** to each branch
4. **Updates the database** to mark the story as git-based and add branch names to versions
5. **Preserves all content** - no data is lost

## Migration Process Details

### Story Selection

The script migrates:
- Stories without a `versioningMode` field (old stories)
- Stories with `versioningMode: 'file'`

The script skips:
- Stories already using git (`versioningMode: 'git'`)
- Story directories that are already git repositories

### Branch Naming

Version names are normalized to create valid branch names:
- `"Draft 1"` → branch: `draft_1`
- `"Revision 2"` → branch: `revision_2`
- `"Translation"` → branch: `translation`

### First Version Handling

The first version in each story becomes the initial branch:
- If the first version is named "draft", it creates the `draft` branch
- Otherwise, it creates a branch with the normalized name of the first version
- The `.gitignore` file is created in the initial commit

## After Migration

### New Stories

After migration, all **new stories** will automatically:
- Use git-based versioning (if git is available)
- Start with a `draft1` branch
- Auto-commit on every save
- Create new branches when you create new versions

### Existing Migrated Stories

For migrated stories:
- Each version is now a git branch
- You can switch between versions in the Story Explorer
- Changes are auto-committed when you save
- You can use git commands directly in the story directory if needed

### Using Git Directly (Advanced)

You can navigate to a story directory and use git commands:

```bash
cd ~/Documents/babel-workspace/story-id/

# View all branches (versions)
git branch

# View commit history for current version
git log

# View differences between commits
git diff HEAD~1

# View specific commit
git show <commit-hash>
```

**Note:** Be careful when using git commands directly. The extension expects branches to match version names in the database.

## Rollback

If you need to rollback the migration:

1. **If you used `--backup`:**
   ```bash
   # Remove the migrated workspace
   rm -rf ~/Documents/babel-workspace

   # Restore from backup
   cp -r ~/Documents/babel-workspace-backup ~/Documents/babel-workspace
   ```

2. **Manual rollback for a single story:**
   - Delete the `.git` directory in the story folder
   - Update `babel.json` to set the story's `versioningMode` to `"file"`
   - Remove `branch` fields from version objects in `babel.json`

## Troubleshooting

### "Git is not installed or not available"

Install git from [git-scm.com](https://git-scm.com/) and ensure it's in your PATH.

### "Story directory not found"

The story exists in the database but its directory is missing. You may need to:
- Delete the story from the database manually
- Or create the missing directory

### "Failed to create branch"

Possible causes:
- Branch name already exists
- Git repository is in an inconsistent state
- File permission issues

Check the error message for details and consider migrating that story individually with `--story-id`.

### Migration stopped with errors

The script continues even if individual stories fail. Check the error summary at the end to see which stories had issues. You can:
- Fix the issues manually
- Re-run the script with `--story-id` for specific stories

## Best Practices

1. **Always test with `--dry-run` first**
   ```bash
   node scripts/migrate-to-git.js ~/Documents/babel-workspace --dry-run
   ```

2. **Create a backup before migration**
   ```bash
   node scripts/migrate-to-git.js ~/Documents/babel-workspace --backup
   ```

3. **Migrate one story at a time** if you have concerns
   ```bash
   node scripts/migrate-to-git.js ~/Documents/babel-workspace --story-id "story-id-here"
   ```

4. **Keep the backup** for a while after migration to ensure everything works correctly

## Support

If you encounter issues:
1. Check the error messages in the migration summary
2. Try migrating a single story with `--story-id` to isolate the problem
3. Review the `babel.json` file to check the database state
4. Check the git repository in the story directory (`git status`)

## Technical Details

### Database Changes

For each migrated story:
- Story object: Adds `versioningMode: 'git'`
- Version objects: Adds `branch: '<branch-name>'`

### File System Changes

For each migrated story directory:
- Adds `.git/` directory (git repository)
- Adds `.gitignore` file
- Keeps all existing `.md` files

### Compatibility

- File-based stories continue to work unchanged
- Both versioning modes can coexist in the same workspace
- New stories automatically use git if available, otherwise fall back to file-based
