// src/services/migrationReporter.ts

import * as fs from 'fs'
import * as path from 'path'
import { MigrationReport } from '../types'

export const migrationReporter = {
  /**
   * Generate a markdown report file from migration results
   */
  async generateReport(report: MigrationReport, workspaceRoot: string): Promise<string> {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, -5)

    const reportPath = path.join(
      workspaceRoot,
      '.babel',
      `migration-report-${timestamp}.md`
    )

    const lines: string[] = []

    lines.push('# Babel V1 → V2 Migration Report')
    lines.push('')
    lines.push(`**Timestamp:** ${report.timestamp.toISOString()}`)
    lines.push(`**Source:** ${report.v1Source}`)
    lines.push(`**Destination:** ${report.v2Destination}`)
    lines.push('')

    // Summary
    lines.push('## Summary')
    lines.push(`- Stories created: ${report.summary.storiesCreated}`)
    lines.push(`- Stories skipped: ${report.summary.storiesSkipped}`)
    lines.push(`- Total versions migrated: ${report.summary.versionsMigrated}`)
    lines.push(`- Git commits created: ${report.summary.gitCommits}`)
    lines.push('')

    // Stories
    lines.push('## Stories Processed')
    for (const result of report.storiesProcessed) {
      if (result.status === 'created') {
        lines.push(`- ✓ **${result.title}** (${result.v1Id})`)
        lines.push(`  - Versions: ${result.versionsCreated}`)
        lines.push(`  - Branches: ${result.branchesCreated?.join(', ') || 'draft'}`)
      } else if (result.status === 'skipped') {
        lines.push(`- ⊘ **${result.title}** (${result.v1Id})`)
        lines.push(`  - Reason: ${result.error}`)
      } else if (result.status === 'error') {
        lines.push(`- ✗ **${result.title}** (${result.v1Id})`)
        lines.push(`  - Error: ${result.error}`)
      }
    }
    lines.push('')

    // Errors
    if (report.executionErrors.length > 0) {
      lines.push('## Errors')
      for (const error of report.executionErrors) {
        lines.push(`- ${error}`)
      }
      lines.push('')
    }

    // Backup info
    lines.push('## Recovery')
    lines.push('If you need to rollback:')
    lines.push('1. Check `.babel/backups/` for the backup directory')
    lines.push('2. Contact support if you need help restoring from backup')
    lines.push('')

    fs.writeFileSync(reportPath, lines.join('\n'))
    return reportPath
  },
  /**
   * Format report for console output
   */
  formatConsoleReport(report: MigrationReport): string {
    const lines: string[] = []

    lines.push('Babel v1 → v2 Migration Report')
    lines.push('==============================')
    lines.push('')
    lines.push(`Source:       ${report.v1Source}`)
    lines.push(`Destination:  ${report.v2Destination}`)
    lines.push(`Timestamp:    ${report.timestamp.toISOString()}`)
    lines.push('')

    lines.push('Summary')
    lines.push('-------')
    lines.push(`Total Stories:      ${report.summary.totalStories}`)
    lines.push(`Stories Created:    ${report.summary.storiesCreated}`)
    lines.push(`Stories Skipped:    ${report.summary.storiesSkipped}`)
    lines.push(`Versions Migrated:  ${report.summary.versionsMigrated}`)
    lines.push(`Git Commits:        ${report.summary.gitCommits}`)
    lines.push('')

    lines.push('Details')
    lines.push('-------')
    for (const story of report.storiesProcessed) {
      if (story.status === 'created') {
        lines.push(`✓ "${story.title}" (${story.v1Id.substring(0, 8)}...)`)
        lines.push(`  Type: ${story.type}`)
        lines.push(`  Versions: ${story.versionsCreated}`)
        lines.push(`  Commits: ${story.commitsCreated}`)
        if (story.branchesCreated && story.branchesCreated.length > 0) {
          lines.push(`  Branches: ${story.branchesCreated.join(', ')}`)
        }
      } else if (story.status === 'skipped') {
        lines.push(`✗ "${story.title}" (${story.v1Id.substring(0, 8)}...)`)
        lines.push(`  Status: SKIPPED`)
        lines.push(`  Reason: ${story.error}`)
      } else if (story.status === 'error') {
        lines.push(`✗ "${story.title}" (${story.v1Id.substring(0, 8)}...)`)
        lines.push(`  Status: ERROR`)
        lines.push(`  Error: ${story.error}`)
      }
      lines.push('')
    }

    if (report.validationErrors.length > 0) {
      lines.push('Validation Errors')
      lines.push('-----------------')
      report.validationErrors.forEach(error => {
        lines.push(`  • ${error}`)
      })
      lines.push('')
    }

    if (report.executionErrors.length > 0) {
      lines.push('Execution Errors')
      lines.push('----------------')
      report.executionErrors.forEach(error => {
        lines.push(`  • ${error}`)
      })
      lines.push('')
    }

    return lines.join('\n')
  },

  /**
   * Convert report to JSON string
   */
  toJson(report: MigrationReport): string {
    return JSON.stringify(report, null, 2)
  },

  /**
   * Save report to file
   */
  saveToFile(report: MigrationReport, filePath: string): void {
    fs.writeFileSync(filePath, this.toJson(report), 'utf-8')
  },

  /**
   * Print report to console and optionally save to file
   */
  print(report: MigrationReport, outputFile?: string): void {
    const consoleOutput = this.formatConsoleReport(report)
    console.log(consoleOutput)

    if (outputFile) {
      this.saveToFile(report, outputFile)
      console.log(`\nReport saved to: ${outputFile}`)
    }
  },
}
