import { MigrationPlan } from '../types'

export class MigrationPreviewGenerator {
  constructor(private plan: MigrationPlan, private backupPath: string) {}

  generatePreview(): string {
    const lines: string[] = []

    lines.push('# Babel V1 → V2 Migration Preview')
    lines.push('')

    for (const story of this.plan.stories) {
      lines.push(`## Story: "${story.title}"`)

      if (story.status === 'skipped') {
        lines.push(`- SKIPPED: ${story.skipReason}`)
      } else {
        for (const version of story.versions) {
          let mapping = ''
          if (
            version.name.match(/^draft\d*$/) ||
            version.name.match(/^revision\d*$/) ||
            version.name.match(/^translation\d*$/)
          ) {
            // Standard versions write to draft.md on their branch
            mapping = `- ${version.name} (v1: ${version.v1Branch}) → v2: draft.md on '${version.targetBranch}' branch`
          } else {
            // Non-standard versions write with original filename to draft branch
            mapping = `- ${version.name} (v1: ${version.v1Branch}) → v2: ${version.targetFileName} on 'draft' branch`
          }
          lines.push(mapping)
        }
      }

      lines.push('')
    }

    const totalStories = this.plan.stories.length
    const createdStories = this.plan.stories.filter(s => s.status === 'valid').length
    const totalVersions = this.plan.stories.reduce((sum, s) => sum + s.versions.length, 0)
    const totalBranches = new Set(
      this.plan.stories
        .flatMap(s => s.versions)
        .filter(v => v.name.match(/^(draft|revision|translation)/))
        .map(v => v.targetBranch)
    ).size

    lines.push('## Summary')
    lines.push(`- Total: ${totalStories} stories (${createdStories} will be created, ${totalStories - createdStories} skipped)`)
    lines.push(`- Files to migrate: ${totalVersions}`)
    lines.push(`- Branches to create: ${totalBranches}`)
    lines.push(`- Backup location: ${this.backupPath}`)

    return lines.join('\n')
  }
}
