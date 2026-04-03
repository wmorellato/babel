# Send to Kindle Feature Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:writing-plans to create the implementation plan after this design is approved.

**Goal:** Enable writers to send their stories directly to Kindle devices via email with a single VSCode command.

**Architecture:** Service-oriented design with `SendToKindleCommand` orchestrating `PandocExportService` (existing) and new `EmailService`. Credentials stored securely in VSCode SecretStorage. Supports Gmail and Yahoo with plugin-ready structure for future providers.

**Tech Stack:** nodemailer for SMTP, VSCode credentials API, existing PandocExportService for DOCX export, native VSCode settings system.

---

## 1. System Architecture

### Components

**SendToKindleCommand** (`src/core/commands/sendToKindleCommand.ts`)
- Entry point for `babel.sendToKindle` VSCode command
- Orchestrates complete workflow: story selection → export → validation → email → cleanup
- Handles user-facing errors and success notifications
- Validates settings before attempting send

**EmailService** (`src/services/email/emailService.ts`)
- Manages SMTP connections for Gmail and Yahoo
- Handles credential retrieval from VSCode SecretStorage
- Prompts user for password if not stored
- Sends emails with DOCX attachments
- Returns detailed success/failure responses
- Provider-agnostic: uses `IEmailProvider` interface

**EmailProvider Interface** (`src/services/email/emailProvider.ts`)
- `IEmailProvider` defines SMTP host, port, TLS requirement
- `GmailProvider` implementation (smtp.gmail.com:587)
- `YahooProvider` implementation (smtp.mail.yahoo.com:587)
- Structure allows adding additional providers (Outlook, etc.) without modifying EmailService

### Data Flow

```
1. User triggers "Send to Kindle" command
2. SendToKindleCommand validates settings exist:
   - babel.sendToKindle.emailService (gmail|yahoo)
   - babel.sendToKindle.senderEmail
   - babel.sendToKindle.recipientEmail
3. User selects story from quickpick
4. Validate pandoc + templates (reuse export checks)
5. Export story to temp DOCX via PandocExportService
6. EmailService.sendEmail():
   - Retrieve password from VSCode SecretStorage
   - If missing, prompt user → store it
   - Get provider config (Gmail/Yahoo)
   - Connect to SMTP
   - Send email with DOCX attachment
7. Delete temp DOCX file
8. Show success notification: "Story sent to Kindle!"
```

---

## 2. Settings & Configuration

Three new settings in `package.json` under `babel.sendToKindle.*`:

```json
"babel.sendToKindle.emailService": {
  "type": "string",
  "enum": ["gmail", "yahoo"],
  "default": "",
  "description": "Email service provider for sending to Kindle (gmail or yahoo)"
},
"babel.sendToKindle.senderEmail": {
  "type": "string",
  "default": "",
  "description": "Email address that will send the story to Kindle (must have app-specific password configured)"
},
"babel.sendToKindle.recipientEmail": {
  "type": "string",
  "default": "",
  "description": "Kindle-enabled email address to receive the story (usually yourname@kindle.com)"
}
```

**User Setup:**
1. Open VSCode Settings → search "Babel Send to Kindle"
2. Configure email service (gmail or yahoo)
3. Enter sender email (the account that will send the file)
4. Enter recipient email (Kindle-registered email address)
5. First send: prompted for app-specific password (required for security) → saved to VSCode SecretStorage
6. Subsequent sends: password used automatically

---

## 3. Credential Management

**Storage:**
- Key: `kindle-email-password`
- Backend: VSCode SecretStorage (OS-native encryption—Keychain on Mac, Credential Manager on Windows, Secret Service on Linux)
- Scope: Global to the extension

**Retrieval Flow:**
```
EmailService.sendEmail():
  1. Try credentialStorage.retrieve('kindle-email-password')
  2. If null:
     - Show input dialog: "App-specific password for [senderEmail]:"
     - Store via credentialStorage.store()
  3. Use password for SMTP authentication
```

**Error Recovery:**
- If authentication fails (wrong password), user can immediately retry
- Command can be re-run; if password is wrong, error message guides them to verify credentials
- Manual password update: User manually updates in settings or re-enters via prompt on next failed attempt

**Security Notes:**
- App-specific passwords required (not account password) to minimize risk
- Stored in VSCode SecretStorage, not configuration files
- No passwords logged or displayed in UI

---

## 4. Error Handling

**Pre-Send Validation Errors:**

| Condition | Error Message | Action |
|-----------|---------------|--------|
| Settings missing | "Configure babel.sendToKindle in settings" | Direct user to settings |
| Pandoc not installed | "Pandoc not installed. Install from https://pandoc.org" | Reuse export error |
| Pandoc templates not configured | "Set babel.export.pandocTemplatesPath in settings" | Reuse export error |
| User cancels story selection | "Send cancelled" | Silent return, no notification |

**Email Send Errors:**

| Error Cause | Message | Temp File | Recovery |
|------------|---------|-----------|----------|
| User cancels password prompt | "Password required to send to Kindle" | Deleted | Retry command, try again |
| Invalid credentials (wrong password) | "Authentication failed. Check email/password in settings" | Deleted | Fix password, retry |
| Network/SMTP connection failure | "Network error connecting to email provider" | Deleted | Check internet, retry |
| File > 25MB (Kindle limit) | "File too large for Kindle (X MB). Kindle accepts up to 25MB" | Deleted | User must edit story |
| Malformed email config | "Invalid email configuration in settings" | Deleted | Fix settings |
| Generic SMTP error | "Failed to send: [nodemailer error]" | Deleted | Check logs, retry |

**Successful Send:**
- Show notification: "Story sent to Kindle!"
- Temp file auto-deleted
- Return to normal state

**Logging:**
- Errors logged to Logger service (debug level for SMTP details, error level for user-facing failures)
- No sensitive data (passwords, full emails) logged

---

## 5. Implementation Files

**New Files:**
- `src/services/email/emailService.ts` — Main email service
- `src/services/email/emailProvider.ts` — Provider interface and implementations
- `src/core/commands/sendToKindleCommand.ts` — Command orchestration
- `test/unit/services/email/emailService.test.ts` — Unit tests for email service
- `test/unit/commands/sendToKindleCommand.test.ts` — Command tests

**Modified Files:**
- `package.json` — Add settings, add nodemailer dependency
- `extension.ts` — Register command and inject dependencies
- `src/extension.ts` — Wire SendToKindleCommand into activation

**Reused Components:**
- `PandocExportService` — Generate DOCX files
- `credentialStorage.ts` — Secure password storage
- `CommandHandler` — Base class for command pattern
- `StoryRepository` — Query stories by ID
- `Logger` — Logging infrastructure

---

## 6. Testing Strategy

**Unit Tests (EmailService):**
- Mock SMTP connection (nodemailer)
- Test credential retrieval (found, not found, prompt flow)
- Test success case: email sent
- Test error cases: invalid password, network failure, file too large
- Test provider selection (Gmail vs Yahoo produces correct config)

**Unit Tests (SendToKindleCommand):**
- Mock story selection, export, email service
- Test full workflow success
- Test validation errors (missing settings, no pandoc)
- Test user cancellation at each step
- Test error propagation from EmailService

**Integration Tests:**
- Mock SMTP but use real credential storage
- Test end-to-end: select story → export → email → cleanup
- Verify temp file cleanup on success and failure

**Coverage Target:** 80%+

---

## 7. Extensibility Notes

**Adding More Email Providers:**

To add a provider (e.g., Outlook):

1. Create `OutlookProvider` in `emailProvider.ts` implementing `IEmailProvider`
2. Add to enum in `EmailService.getProvider()`
3. Add to settings enum: `"outlook"` in `babel.sendToKindle.emailService`
4. Add test case for new provider

No changes needed to `SendToKindleCommand` or credential storage.

**Future Enhancements:**
- OAuth2 flow instead of app-specific passwords (more complex, better UX)
- Multiple recipient addresses (currently single address only)
- Custom email subject/body templates
- Send history logging
- Batch send to multiple stories

---

## 8. Success Criteria

✅ User can send a story to Kindle with one command
✅ Settings allow configuration of email service, sender, recipient
✅ Password stored securely in VSCode SecretStorage
✅ User prompted for password on first use only
✅ DOCX file generated using existing pandoc export
✅ Clear error messages for configuration/authentication failures
✅ Temp files cleaned up on success and failure
✅ Success notification shown to user
✅ Code structured for adding more email providers
✅ 80%+ test coverage
