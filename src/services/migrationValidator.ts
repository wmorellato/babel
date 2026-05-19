import * as path from 'path'
import { v1DataLoader } from './v1DataLoader'
import { storyTypeDetector } from '../utils/storyTypeDetector'
import { migrationLogger } from '../utils/migrationLogger'
import { MigrationPlan, StoryType, VersionStagingPlan } from '../types'

export const migrationValidator = {
  /**
   * Validate v1 data and create a migration plan
   * - Skip stories with no draft files
   * - Detect story type from draft.md word count
   * - Map versions to target files and branches
   * - Collect errors without failing fast
   */
  validate(v1Directory: string): MigrationPlan {
    migrationLogger.reset()

    const babelJsonPath = path.join(v1Directory, 'babel.json')
    let v1Data

    try {
      v1Data = v1DataLoader.loadBabelJson(babelJsonPath)
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error)
      migrationLogger.error('Failed to load babel.json', { error: errorMsg })
      throw error
    }

    const globalErrors: string[] = []
    const stories = []

    for (const story of v1Data.stories) {
      // Skip stories with no versions (nothing to migrate)
      if (!story.versions || story.versions.length === 0) {
        migrationLogger.warn(
          `Story "${story.title}" has no versions, skipping`,
          { storyId: story.id }
        )
        stories.push({
          v1Id: story.id,
          title: story.title,
          type: StoryType.SHORT_STORY,
          createdAt: new Date(story.created),
          status: 'skipped' as const,
          skipReason: 'No processable files found',
          versions: [],
        })
        continue
      }

      const storyDir = path.join(v1Directory, story.id)
      const files = v1DataLoader.getStoryFiles(storyDir)

      // Map versions to files
      const versionMap = new Map(v1Data.versions.map(v => [v.id, v]))
      const versions: VersionStagingPlan[] = []

      // Detect story type from draft version's word count
      let type: StoryType = StoryType.SHORT_STORY
      const draftVersion = story.versions
        .map(id => versionMap.get(id))
        .find(v => v && v.name === 'draft')
      if (draftVersion && typeof draftVersion.wordCount === 'number') {
        if (draftVersion.wordCount > 50000) {
          type = StoryType.NOVEL
        } else if (draftVersion.wordCount >= 10000) {
          type = StoryType.NOVELLA
        }
      }

      for (const versionId of story.versions) {
        const version = versionMap.get(versionId)
        if (!version) {
          migrationLogger.warn(`Version not found in versions array`, {
            storyId: story.id,
            versionId,
          })
          continue
        }

        // Determine target file and branch based on version name
        let targetFileName = version.name + '.md'
        let targetBranch = 'draft'  // v2 default branch is 'draft' (renamed from master)
        let action: 'create-branch' | 'commit-to-current' = 'commit-to-current'

        if (version.name === 'draft') {
          targetFileName = 'draft.md'
          targetBranch = 'draft'
          action = 'commit-to-current'
        } else if (version.name === 'outline' || version.name === 'characters') {
          targetFileName = version.name + '.md'
          targetBranch = 'draft'
          action = 'commit-to-current'
        } else if (version.name.match(/^draft\d+$/)) {
          // draftX.md → create branch, write to draft.md
          targetFileName = 'draft.md'
          targetBranch = version.name
          action = 'create-branch'
        } else if (
          version.name === 'revision' ||
          version.name === 'translation'
        ) {
          // revision/translation → create branch, write to draft.md
          targetFileName = 'draft.md'
          targetBranch = version.name
          action = 'create-branch'
        } else {
          // Other files → create branch with filename as name, write filename
          targetBranch = version.name
          targetFileName = version.name + '.md'
          action = 'create-branch'
        }

        // Construct file path - trust that it exists on the version's v1 branch
        // The executor will checkout the correct v1 branch before reading
        const expectedFileName = version.name + '.md'
        const filePath = path.join(storyDir, expectedFileName)

        versions.push({
          v1VersionId: versionId,
          name: version.name,
          filePath,
          v1Branch: version.branch, // Capture the v1 branch where this version exists
          targetBranch,
          targetFileName,
          action,
        })
      }

      stories.push({
        v1Id: story.id,
        title: story.title,
        type,
        createdAt: new Date(story.created),
        status: 'valid' as const,
        versions,
      })

      migrationLogger.info(`Validated story "${story.title}"`, {
        storyId: story.id,
        type,
        versionsCount: versions.length,
      })
    }

    return {
      v1Source: v1Directory,
      stories,
      globalErrors,
    }
  },
}
