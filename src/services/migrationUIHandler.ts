import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'

export class MigrationUIHandler {
  /**
   * Show initial migration dialog (migrate/use v1)
   */
  async showInitialDialog(): Promise<'migrate' | 'use-v1'> {
    const choice = await vscode.window.showInformationMessage(
      'Found Babel v1 data (babel.json). Migrate to v2? v2 uses a new database format and will create separate git repos for each story.',
      'Migrate Now',
      'Use v1'
    )

    if (choice === 'Migrate Now') {
      return 'migrate'
    } else if (choice === 'Use v1') {
      return 'use-v1'
    } else {
      return 'use-v1' // Cancel defaults to use v1
    }
  }

  /**
   * Show downgrade message when user chooses v1
   */
  async showDowngradeMessage(): Promise<void> {
    await vscode.window.showWarningMessage(
      'To use Babel v1, downgrade the extension from the VSCode marketplace.'
    )
  }

  /**
   * Show backup creation progress
   */
  async showBackupProgress(backupPath: string): Promise<void> {
    await vscode.window.showInformationMessage(
      `Backup created at ${backupPath}`
    )
  }

  /**
   * Show preview dialog (open/proceed/cancel)
   */
  async showPreviewDialog(previewPath: string): Promise<'open' | 'proceed' | 'cancel'> {
    const choice = await vscode.window.showInformationMessage(
      'Review the migration plan. File created at .babel/migration-preview.md',
      'Open',
      'Proceed',
      'Cancel'
    )

    if (choice === 'Open') {
      // Open preview in editor
      const doc = await vscode.workspace.openTextDocument(previewPath)
      await vscode.window.showTextDocument(doc)
      return 'open'
    } else if (choice === 'Proceed') {
      return 'proceed'
    } else {
      return 'cancel'
    }
  }

  /**
   * Show migration progress (updated per story)
   */
  async showMigrationProgress(storyTitle: string, current: number, total: number): Promise<void> {
    const message = `Migrating stories... Story ${current}/${total}: "${storyTitle}"`
    // Using setStatusBarMessage for non-blocking progress
    vscode.window.setStatusBarMessage(message)
  }

  /**
   * Show results summary dialog
   */
  async showResultsDialog(
    created: number,
    skipped: number,
    failed: number,
    reportPath: string
  ): Promise<'view-report' | 'close'> {
    const summary = `Migration Complete: ${created} created, ${skipped} skipped${failed > 0 ? `, ${failed} failed` : ''}`
    const choice = await vscode.window.showInformationMessage(summary, 'View Report', 'Close')

    if (choice === 'View Report') {
      const doc = await vscode.workspace.openTextDocument(reportPath)
      await vscode.window.showTextDocument(doc)
      return 'view-report'
    }

    return 'close'
  }

  /**
   * Show error recovery dialog
   */
  async showErrorRecoveryDialog(
    failedVersions: string[]
  ): Promise<'retry' | 'keep' | 'rollback'> {
    const message = `Migration encountered ${failedVersions.length} error(s). What would you like to do?`
    const choice = await vscode.window.showInformationMessage(
      message,
      'Retry',
      'Keep v2 as-is',
      'Rollback to v1'
    )

    if (choice === 'Retry') {
      return 'retry'
    } else if (choice === 'Keep v2 as-is') {
      return 'keep'
    } else {
      return 'rollback'
    }
  }
}
