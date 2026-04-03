# Design: Compressed Cloud Backups

**Date:** 2026-03-22
**Status:** Design Phase
**Author:** Claude Code

## Executive Summary

Replace JSON-based cloud backups with compressed tar.gz archives. Each backup creates:
- One `.tar.gz` per story folder
- One `.tar.gz` for the database
- One `.json` manifest with metadata

This approach is simpler than tracking incremental changes, more storage-efficient than JSON serialization, and supports full restore workflows.

---

## Problem Statement

Current implementation stores backups as JSON files with base64-encoded file contents:
- **Inefficient serialization**: Story files encoded as base64 increase size by ~33%
- **Monolithic JSON**: All data in one file makes it hard to reason about what's being backed up
- **Not incremental**: Always uploads everything, even unchanged stories
- **Not human-inspectable**: Can't see backup contents without parsing JSON

**Solution:** Use compressed tar archives organized per-story with a separate manifest for metadata.

---

## Architecture

### File Organization in Dropbox

All backups stored under `/Apps/Babel/backups/`:

```
backup-{timestamp}-story-{storyId}.tar.gz    (story folder + git history)
backup-{timestamp}-story-{storyId}.tar.gz    (another story)
backup-{timestamp}-database.tar.gz           (babel.db)
backup-{timestamp}-manifest.json             (metadata)
```

**Naming convention:** `backup-{ISO8601-timestamp}-{type}-{id}.{ext}`
- Timestamp ensures chronological ordering
- Type distinguishes stories, database, manifest
- ID identifies which story (for stories)
- Extension indicates format

**Example:**
```
backup-1711234567890-story-abc123.tar.gz
backup-1711234567890-story-def456.tar.gz
backup-1711234567890-database.tar.gz
backup-1711234567890-manifest.json
```

### Manifest Structure

Stored in Dropbox AND local database:

```json
{
  "backupId": "1711234567890",
  "timestamp": "2026-03-22T16:45:30.000Z",
  "type": "full",
  "stories": [
    {
      "id": "abc123",
      "displayName": "My Story",
      "fileCount": 3
    },
    {
      "id": "def456",
      "displayName": "My Essay",
      "fileCount": 2
    }
  ],
  "database": {
    "size": 102400
  },
  "totalSize": 1048576,
  "status": "completed"
}
```

### Data Flow

```
Backup Creation:
  BackupDataCollector
    ↓
  Compress each story folder → tar.gz
  Compress database → tar.gz
  Generate manifest → json
    ↓
  DropboxBackupService.createBackup()
    ↓
  Upload all files to Dropbox
  Store manifest locally + in Dropbox
    ↓
  Return BackupPoint with status "completed"

Restore Flow:
  User selects backup from tree view
    ↓
  Download manifest.json
    ↓
  Download all story-*.tar.gz files
  Download database.tar.gz
    ↓
  Extract to workspace
  Reload extension state
    ↓
  Show success message
```

---

## Backup Creation

**Trigger:** User clicks "Backup Now" or scheduled backup fires

**Process:**

1. **Collect backup data** (BackupDataCollector)
   - Read all story folders from `{workspacePath}`
   - Read database from `{globalStoragePath}/babel.db`
   - Generate backup ID (ISO8601 timestamp)

2. **Compress stories**
   - For each story in workspace:
     - Create tar.gz: `backup-{id}-story-{storyId}.tar.gz`
     - Contents: entire story folder (story.md/essay.md + git history)
     - Upload to Dropbox with autorename=true
   - Track compression success/failure per story

3. **Compress database**
   - Create tar.gz: `backup-{id}-database.tar.gz`
   - Contents: single babel.db file
   - Upload to Dropbox

4. **Generate & store manifest**
   - Create manifest JSON with:
     - Story list (id, displayName, fileCount)
     - Database size
     - Total backup size (sum of all tar.gz files)
     - Timestamp, type, status
   - Upload to Dropbox as `backup-{id}-manifest.json`
   - Save to local BackupRepository

5. **Return BackupPoint**
   - status: "verified" (all files uploaded successfully)
   - fileCount: sum of all story files
   - storyCount: number of stories backed up
   - storageSize: sum of all compressed file sizes

**Error handling:**
- If any tar.gz upload fails → mark backup "failed", don't upload manifest
- If manifest upload fails → mark backup "failed"
- Incomplete backups (without manifest) won't appear in tree view
- User sees error message with option to retry

---

## Restore

**Trigger:** User selects a backup from tree view and clicks "Restore"

**Process:**

1. **Fetch manifest** from Dropbox
   - Download `backup-{id}-manifest.json`
   - Parse to get story list and metadata
   - Show confirmation dialog: "Restore X stories + database?"

2. **Download all files**
   - Download all `backup-{id}-story-*.tar.gz` files
   - Download `backup-{id}-database.tar.gz`
   - Stream directly to temp directory
   - Retry up to 3 times on network failure

3. **Extract to workspace**
   - Extract each story tar.gz to `{workspacePath}/{storyId}/`
   - Extract database tar.gz to `{globalStoragePath}/babel.db`
   - Overwrite existing files (ensures exact backup state)
   - Delete temp files

4. **Reload extension state**
   - Reload story repository from new database
   - Refresh story tree view
   - Refresh status bars
   - Show success message

**Error handling:**
- Missing manifest → "This backup is incomplete"
- Missing story tar.gz → "Backup is corrupted (missing story X)"
- Download timeout → "Network error, please retry"
- Extraction failure → "Failed to extract files, please retry"
- **Never partially restore** — all or nothing

---

## Compression Details

**Library:** Node.js `tar` package (already in dependencies) + native gzip

**What to compress:**
- Story folders: Include all files (markdown, git history, configs)
- Exclude: Nothing (keep .git for full history recovery)
- Database: Single file (babel.db)

**Why tar.gz:**
- Text files (markdown) compress extremely well (80-90% reduction)
- Git objects are already somewhat compressed but benefit from gzip
- Industry standard, widely supported
- Preserves file permissions and symlinks (for future compatibility)

**Size estimates:**
- Single story folder: 50-500 KB compressed (varies by content)
- Database: ~100 KB compressed
- 10 stories + database: ~1-6 MB per backup
- **Dropbox storage:** 100 full backups ≈ 100-600 MB (easily affordable)

---

## Local Manifest Caching

**Why:** Users can see backup history even without internet (Dropbox sync)

**Implementation:**
- BackupRepository stores manifest entries locally
- On successful cloud backup → write manifest to local database
- On restore → fetch manifest from Dropbox (source of truth)
- Periodically refresh local cache from Dropbox (weekly sync)

---

## Data Integrity

**Verification:**
- After upload: Check file exists in Dropbox via `filesGetMetadata()`
- After download: Verify tar.gz is readable before extracting
- After extraction: Count extracted files vs manifest.fileCount

**Manifest consistency:**
- If manifest upload fails → backup marked "failed"
- If manifest differs from actual files in Dropbox → log warning, use manifest as source of truth
- Cleanup task: Periodically remove orphaned files (tar.gz without corresponding manifest)

---

## Error Handling & Edge Cases

| Scenario | Behavior |
|----------|----------|
| Network timeout during upload | Retry 3x, then fail and mark backup "failed" |
| One story tar.gz fails to upload | Fail entire backup, don't upload manifest |
| Manifest upload fails | Fail entire backup, orphaned tar.gz files cleaned up weekly |
| Dropbox API rate limit hit | Exponential backoff (1s, 2s, 4s), retry up to 3x |
| User has < 1MB free space | Warn user before backing up |
| Restore: manifest missing | Show error "This backup is incomplete" |
| Restore: one story tar.gz missing | Show error "Backup is corrupted (missing story X)" |
| Restore: tar.gz corrupted | Extraction fails, show error, preserve local files |
| User restores over newer local changes | Old local changes are lost (expected behavior) |

---

## Testing Strategy

### Unit Tests

- **Compression:**
  - Tar.gz creation for mock story folder structure
  - Gzip compression ratio validation
  - File permission preservation

- **Manifest generation:**
  - Correct story list with file counts
  - Accurate timestamp and size calculations
  - Manifest JSON schema validation

- **Dropbox API mocking:**
  - filesUpload() called with correct paths/content
  - filesDownload() returns expected binary data
  - Error scenarios (404, timeout, rate limit)

### Integration Tests

- **Full backup flow:**
  - Create mock workspace with 2-3 stories + database
  - Run backup, verify all tar.gz files created
  - Verify manifest uploaded with correct metadata
  - Verify local manifest stored in database

- **Full restore flow:**
  - Download all files (with mocked Dropbox)
  - Extract to clean workspace
  - Verify file structure matches original
  - Verify database is readable

- **Error cases:**
  - Network failure during upload → backup marked failed
  - Missing tar.gz during restore → error shown, no extraction
  - Corrupted tar.gz → extraction fails gracefully

### Manual Testing

- Create story, make changes, backup to Dropbox
- Verify files appear in Dropbox app
- Delete local story, restore from backup
- Verify story restored with all content
- Switch between multiple backups, restore each

---

## Migration Path (Future)

Current JSON backups will be orphaned (not displayed). No migration needed:
- Old backups in Dropbox remain readable (historical record)
- New backups use tar.gz format
- Tree view only shows tar.gz backups (newer style)

If user needs to recover old JSON backup:
- Manual JSON parsing + base64 decoding required
- Document this in release notes

---

## Success Criteria

✅ Each backup creates separate tar.gz files (one per story + database)
✅ Manifest tracks what's in each backup
✅ Restore downloads all files and extracts to workspace
✅ No data loss during backup/restore cycle
✅ Storage efficient (gzip compression works well)
✅ All tests passing (unit + integration)
✅ Manual testing: create, backup, restore, verify

---

## Out of Scope (Future Enhancements)

- **Incremental backups:** Track changed stories, upload only those
- **Selective restore:** Download + restore only specific stories
- **Backup rotation:** Automatically delete old backups after N days
- **Multiple cloud providers:** Support AWS S3, Google Drive, etc.
- **Encryption:** Encrypt backups before uploading to Dropbox

