# Dropbox Cloud Backup Integration Design

**Date:** 2026-03-22
**Status:** Design Review
**Scope:** Replace Google Drive OAuth2 integration with Dropbox using PKCE flow

---

## Goal

Replace the Google Drive cloud backup with Dropbox as the cloud storage provider. Maintain the existing `IBackupProvider` abstraction and modular architecture.

---

## Architecture Overview

The system uses a provider abstraction pattern:
- `IBackupProvider` interface defines the contract (8 methods: createBackup, restoreBackup, deleteBackup, etc.)
- `LocalBackupService` implements local file backups
- `DropboxBackupService` (new) will implement cloud backups to Dropbox
- `BackupManager` orchestrates between providers
- `TokenManager` stores/refreshes OAuth2 tokens securely

---

## Components to Add/Modify

### 1. New: `src/services/dropboxBackupService.ts`

**Purpose:** Implement `IBackupProvider` for Dropbox storage

**Responsibilities:**
- Create backups (upload files to Dropbox `/Apps/Babel/backups/` directory)
- Restore backups (download files from Dropbox)
- Delete backups (remove files from Dropbox)
- List backups (query Dropbox file list)
- Verify backup integrity (check file exists/size)
- Get storage usage (call Dropbox space/usage endpoint)
- Check provider availability (validate access token)
- Cleanup old backups (delete files older than retention period)

**Dependencies:** Dropbox SDK (`dropbox` npm package), `TokenManager`, `Logger`

**Key methods:**
```
- constructor(accessToken: string, tokenManager: TokenManager)
- async createBackup(data: BackupData, type): Promise<BackupPoint>
- async restoreBackup(backupId: string): Promise<BackupData>
- async deleteBackup(backupId: string): Promise<void>
- async listBackups(): Promise<string[]>
- async verifyBackup(backupId: string): Promise<boolean>
- async getStorageUsage(): Promise<number>
- async isAvailable(): Promise<boolean>
- async cleanupOldBackups(retentionDays, metadata): Promise<string[]>
```

### 2. New: `src/core/commands/authorizeDropboxCommand.ts`

**Purpose:** Handle Dropbox OAuth2 authorization flow with PKCE

**Responsibilities:**
- Generate PKCE challenge/verifier pair
- Build Dropbox authorization URL with PKCE parameters
- Start local HTTP server on configurable port to capture callback
- Exchange authorization code for access token + refresh token
- Store tokens via `TokenManager`
- Update workspace settings with authorization status

**Key methods:**
```
- execute(clientId: string, redirectUri: string, tokenManager: TokenManager): Promise<void>
- private generatePKCEChallenge(): {codeVerifier, codeChallenge}
- private startLocalServer(port): Promise<{code, server}>
```

**Dropbox OAuth2 endpoints:**
- Authorization: `https://www.dropbox.com/oauth2/authorize`
- Token: `https://api.dropboxapi.com/oauth2/token`
- Scopes: `files.content.read`, `files.content.write`

### 3. Modify: `package.json` configuration schema

**Remove:**
```json
"babel.backup.googleDrive.enabled",
"babel.backup.googleDrive.authorized",
"babel.backup.googleDrive.clientId",
"babel.backup.googleDrive.redirectUri"
```

**Add:**
```json
"babel.backup.dropbox.enabled": {
  "type": "boolean",
  "default": false,
  "description": "Enable cloud backup to Dropbox"
},
"babel.backup.dropbox.authorized": {
  "type": "boolean",
  "default": false,
  "description": "OAuth2 authorization status for Dropbox"
},
"babel.backup.dropbox.clientId": {
  "type": "string",
  "default": "<user-provided-client-id>",
  "description": "Dropbox OAuth2 Client ID"
},
"babel.backup.dropbox.redirectUri": {
  "type": "string",
  "default": "http://localhost:54831/oauth/callback",
  "description": "OAuth2 redirect URI (must match Dropbox app settings)"
}
```

**Update menus:** Change command references and labels from "Google Drive" to "Dropbox"

### 4. Modify: `src/services/backupManager.ts`

**Changes:**
- Rename `initializeCloudBackup()` → `initializeCloudBackup()` (keep name, change implementation)
- Read from `babel.backup.dropbox.*` config instead of `babel.backup.googleDrive.*`
- Create `DropboxBackupService` instead of `GoogleDriveBackupService`
- Pass Dropbox-specific configuration

### 5. Modify: `src/core/commands/commandRegistry.ts`

**Changes:**
- Replace `registerAuthorizeGoogleDrive()` with `registerAuthorizeDropbox()`
- Register new `authorizeDropboxCommand`
- Update command ID from `babel.authorizeGoogleDrive` to `babel.authorizeDropbox`

### 6. Modify: Command registration

**Update:**
- `src/core/commands/backupToggleCommands.ts` - Update references from Google Drive to Dropbox
- Command names remain same (`babel.enableBackup`, `babel.disableBackup`) - still generic
- Update when clauses to reference `babel.backup.dropbox.*`

### 7. Update: UI references

**Tree view:**
- "Cloud Backups" label stays same (generic)
- "Authorize Google Drive" → "Authorize Dropbox"

**Error/success messages:**
- Update from "Google Drive" to "Dropbox"

### 8. Update: Tests

**Remove:**
- Tests in `test/unit/core/commands/authorizeGoogleDriveCommand.test.ts`

**Add:**
- `test/unit/services/dropboxBackupService.test.ts`
- `test/unit/core/commands/authorizeDropboxCommand.test.ts`

**Modify:**
- `test/unit/services/backupManager.test.ts` - Update cloud provider initialization tests
- `test/unit/views/backupTreeDataProvider.test.ts` - Update provider names in snapshots

---

## Data Flow

### Authorization Flow
```
1. User clicks "Authorize Dropbox" button in tree view
2. authorizeDropboxCommand generates PKCE challenge
3. Opens browser to Dropbox authorization URL (includes challenge)
4. User logs in and grants permissions
5. Dropbox redirects to localhost:54831/oauth/callback?code=...
6. Local server captures code
7. Command exchanges code + code_verifier for tokens
8. Tokens stored via TokenManager
9. babel.backup.dropbox.authorized set to true
10. Tree view refreshes showing Dropbox as authorized
```

### Backup Flow
```
1. BackupManager.createBackup() called
2. Gets access token from TokenManager (refreshes if needed)
3. Creates DropboxBackupService with token
4. Calls service.createBackup(data, type)
5. Service uploads file to Dropbox /Apps/Babel/backups/
6. Returns BackupPoint with Dropbox file metadata
7. BackupRepository stores metadata
```

### Restore Flow
```
1. User selects backup to restore
2. BackupManager.restoreBackup(backupId) called
3. DropboxBackupService.restoreBackup() downloads file from Dropbox
4. Returns BackupData (file contents)
5. BackupManager writes to workspace
```

---

## Error Handling

**Authorization errors:**
- Invalid client_id → Display error on browser page
- User denies permissions → Capture error from Dropbox
- Token exchange fails → Show detailed error in VSCode notification

**Backup errors:**
- Token expired → TokenManager auto-refreshes
- Dropbox API errors (rate limit, quota) → Log and show user-friendly message
- Network errors → Retry with exponential backoff

**Invalid configuration:**
- Missing clientId → Skip cloud backup, log debug message
- Invalid redirect URI → Authorization will fail with clear error

---

## Configuration Requirements

**User must provide:**
1. Create Dropbox app at https://www.dropbox.com/developers/apps
2. Choose: Scoped access, Full Dropbox or App folder
3. Generate OAuth2 credentials (client_id)
4. Set redirect URI to match extension setting
5. Add client_id to VSCode settings
6. Click "Authorize Dropbox" button

---

## Testing Strategy

**Unit tests:**
- DropboxBackupService CRUD operations (mocked Dropbox SDK)
- PKCE challenge generation
- Token exchange flow
- Configuration validation

**Integration tests:**
- Full authorization flow with local server
- File upload/download roundtrip
- Token refresh handling

**Manual testing:**
- Create Dropbox dev app
- Configure extension with client_id
- Test authorization flow
- Test backup create/restore/delete

---

## Success Criteria

- ✅ All 802 tests passing (plus new Dropbox tests)
- ✅ Authorization flow completes successfully with PKCE
- ✅ Backups can be created, restored, and deleted via Dropbox
- ✅ Tokens are securely stored and refreshed
- ✅ Error handling covers common failure scenarios
- ✅ Configuration is intuitive for users
- ✅ No Google Drive references remain in code

---

## Implementation Notes

- Reuse `AuthorizeDropboxCommand` structure from existing Google Drive implementation
- Use Dropbox official SDK (`dropbox` npm package) for API calls
- PKCE flow same as Google - generate challenge, include in auth request, prove verifier on token exchange
- Dropbox OAuth2 is well-documented and widely supported
- No server-side secrets needed (PKCE handles security)

