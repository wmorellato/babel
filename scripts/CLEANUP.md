# Cleanup Script for Dangling Entries

This script removes orphaned stories, versions, and activity entries from `babel.json` that no longer have corresponding files or directories on disk.

## When to Use This Script

Use this script if:
- You manually deleted story directories or version files outside of the Babel extension
- You have database inconsistencies from previous bugs or issues
- You want to clean up your workspace after moving or reorganizing files
- You migrated from file-based to git-based versioning and had issues

## What It Does

The script scans your workspace and removes:

1. **Dangling Stories**: Stories that exist in `babel.json` but don't have a directory on disk
2. **Dangling Versions**: Versions that exist in `babel.json` but don't have:
   - A `.md` file (for file-based stories), or
   - A git branch (for git-based stories)
3. **Dangling Activity Entries**: Activity log entries that reference stories that no longer exist

## Usage

### Basic Command

```bash
node scripts/cleanup-dangling.js <workspace-path> [options]
```

### Options

- `--dry-run` - Preview what would be removed without making any changes
- `--backup` - Create a timestamped backup of `babel.json` before cleanup
- `--help` - Show help message

### Examples

```bash
# Preview what would be cleaned up (recommended first step)
node scripts/cleanup-dangling.js ~/Documents/babel-workspace --dry-run

# Cleanup with automatic backup (safest option)
node scripts/cleanup-dangling.js ~/Documents/babel-workspace --backup

# Cleanup without backup
node scripts/cleanup-dangling.js ~/Documents/babel-workspace
```

## How It Works

### For Each Story

1. Checks if the story directory exists: `workspace/<story-id>/`
2. If the directory doesn't exist, marks the story and all its versions for removal
3. If the directory exists, checks each version

### For Each Version

1. **File-based stories**: Checks if `<normalized-version-name>.md` exists
2. **Git-based stories**: Checks if the git branch exists in the repository
3. If the version doesn't exist, marks it for removal

### Database Updates

- Uses the same database methods as the extension (`deleteStory`, `deleteVersion`)
- Properly removes versions from story's `versions` array
- Properly removes all versions when a story is deleted
- Removes activity entries that reference deleted stories
- If all activity entries for a day are removed, the entire day entry is deleted
- Changes are written to `babel.json` immediately

## Output

The script provides:
- Real-time progress updates with emoji indicators (📝 🔍 ✅ ⚠️ ❌)
- Count of stories and versions checked
- Count of dangling entries found
- Detailed list of what was removed (or would be removed in dry-run mode)
- Summary statistics at the end

### Example Output

```
============================================================
DANGLING ENTRIES CLEANUP SCRIPT
============================================================
Workspace: /home/user/Documents/babel-workspace
Mode: LIVE
============================================================

📝 Creating backup at: babel.json.backup-2024-01-15T10-30-00-000Z
✅ Backup created successfully

📝 Scanning for dangling entries...
🔍 Found dangling story: "Old Story" (ID: abc123)
  🔍 Found dangling version: "draft 2" in story "My Story"

📝 Scanning activity entries for dangling references...
  🔍 Found dangling activity entry for non-existent story: xyz789 on 2024-01-10

⚠️  Found 1 dangling stories, 1 dangling versions, and 1 dangling activity entries

⚠️  WARNING: This will permanently remove entries from babel.json.
Press Ctrl+C to cancel, or wait 5 seconds to continue...

📝 Removing 1 dangling stories...
  ✅ Removed story: "Old Story" (ID: abc123)

📝 Removing 1 dangling versions...
  ✅ Removed version: "draft 2" from story "My Story"

📝 Removing 1 dangling activity entries...
  ✅ Removed 1 activity entries from 2024-01-10

============================================================
CLEANUP SUMMARY
============================================================
Total stories checked:           10
Dangling stories found:          1
Total versions checked:          25
Dangling versions found:         1
Total activity entries checked:  50
Dangling activity entries found: 1

Stories removed:                 1
Versions removed:                1
Activity entries removed:        1

✅ Cleanup completed successfully!
============================================================
```

## Safety Features

1. **Dry-run mode**: Preview changes before making them
2. **Backup creation**: Optional automatic backup of `babel.json`
3. **Confirmation delay**: 5-second warning before making changes (in live mode)
4. **Error handling**: Continues processing even if individual deletions fail

## Best Practices

1. **Always use `--dry-run` first** to see what would be removed:
   ```bash
   node scripts/cleanup-dangling.js ~/Documents/babel-workspace --dry-run
   ```

2. **Create a backup** before cleanup:
   ```bash
   node scripts/cleanup-dangling.js ~/Documents/babel-workspace --backup
   ```

3. **Manual backup** as an extra precaution:
   ```bash
   cp ~/Documents/babel-workspace/babel.json ~/Documents/babel-workspace/babel.json.manual-backup
   ```

## Restoring from Backup

If you need to restore from a backup:

```bash
# Find the backup file
ls -lt ~/Documents/babel-workspace/babel.json.backup-*

# Restore it
cp ~/Documents/babel-workspace/babel.json.backup-2024-01-15T10-30-00-000Z \
   ~/Documents/babel-workspace/babel.json
```

## Common Scenarios

### Scenario 1: Manually Deleted Story Directory

If you deleted a story directory directly from the file system:
```bash
rm -rf ~/Documents/babel-workspace/story-id/
```

The story entry remains in `babel.json`. Run the cleanup script to remove it:
```bash
node scripts/cleanup-dangling.js ~/Documents/babel-workspace --backup
```

### Scenario 2: Manually Deleted Version File

If you deleted a version file:
```bash
rm ~/Documents/babel-workspace/story-id/revision_1.md
```

The version entry remains in `babel.json`. Run the cleanup script to remove it.

### Scenario 3: Git Repository Corruption

If a git-based story's repository was corrupted or deleted:
1. The script will detect that branches no longer exist
2. It will remove the dangling version entries
3. If the entire `.git` directory is missing, it may remove all versions

### Scenario 4: Migration Issues

After migrating from file-based to git-based versioning, if some versions weren't properly migrated:
1. Run the cleanup script to remove entries that don't have corresponding branches
2. Then re-create those versions if needed through the extension

## Technical Details

### Version Existence Check

**File-based stories**:
- Normalizes version name: `"Draft 1"` → `"draft_1"`
- Checks for file: `workspace/<story-id>/draft_1.md`

**Git-based stories**:
- Checks if directory is a git repository
- Lists all branches using `git branch`
- Checks if version's branch exists
- Falls back to normalized name if `version.branch` is not set

### Database Operations

The script uses the same database methods as the extension:
- `db.deleteStory(storyId)` - Removes story and all its versions
- `db.deleteVersion(storyId, versionId)` - Removes single version

These methods properly update both the story's `versions` array and the `versions` collection.

## Troubleshooting

### "No dangling entries found"

Good news! Your database is in sync with your file system.

### "Failed to remove story/version"

Check the error message. Common causes:
- `babel.json` is read-only
- Database is locked by the extension
- File system permissions issue

### Script Errors

If the script crashes:
1. Check that the workspace path is correct
2. Verify `babel.json` exists and is valid JSON
3. Ensure you have read/write permissions
4. Check that the `src/database.js` module is accessible

## Related Scripts

- **migrate-to-git.js**: Converts file-based stories to git-based versioning
- See `MIGRATION.md` for migration documentation

## Note on Database Integrity

The Babel extension's database methods (`deleteVersion` and `deleteStory`) properly remove entries from `babel.json`. This cleanup script is designed for edge cases where:
- Files were deleted manually outside the extension
- Database got out of sync due to bugs (fixed in current version)
- Workspace was manually reorganized or restored from partial backup
