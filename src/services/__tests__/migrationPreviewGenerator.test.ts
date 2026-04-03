import { MigrationPreviewGenerator } from '../migrationPreviewGenerator'
import { MigrationPlan, StoryType } from '../../types'

describe('MigrationPreviewGenerator', () => {
  test('generatePreview creates markdown with story breakdown', () => {
    const plan: MigrationPlan = {
      v1Source: '/v1',
      stories: [
        {
          v1Id: 'story-1',
          title: 'Draft Novel',
          type: StoryType.NOVEL,
          createdAt: new Date(),
          status: 'valid',
          versions: [
            {
              v1VersionId: 'v1',
              name: 'draft',
              filePath: '/v1/story-1/draft.md',
              v1Branch: 'draft1',
              targetBranch: 'draft',
              targetFileName: 'draft.md',
              action: 'commit-to-current',
            },
            {
              v1VersionId: 'v2',
              name: 'outline',
              filePath: '/v1/story-1/outline.md',
              v1Branch: 'outline',
              targetBranch: 'draft',
              targetFileName: 'outline.md',
              action: 'commit-to-current',
            },
          ],
        },
        {
          v1Id: 'story-2',
          title: 'Empty Story',
          type: StoryType.SHORT_STORY,
          createdAt: new Date(),
          status: 'skipped',
          skipReason: 'No files',
          versions: [],
        },
      ],
      globalErrors: [],
    }

    const generator = new MigrationPreviewGenerator(plan, '/backup/path')
    const markdown = generator.generatePreview()

    expect(markdown).toContain('# Babel V1 → V2 Migration Preview')
    expect(markdown).toContain('Draft Novel')
    expect(markdown).toContain('draft (v1: draft1) → v2: draft.md on \'draft\' branch')
    expect(markdown).toContain('outline (v1: outline) → v2: outline.md on \'draft\' branch')
    expect(markdown).toContain('Empty Story')
    expect(markdown).toContain('SKIPPED: No files')
    expect(markdown).toContain('Total: 2 stories')
    expect(markdown).toContain('Backup location: /backup/path')
  })
})
