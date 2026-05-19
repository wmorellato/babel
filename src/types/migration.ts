import { z } from 'zod'
import { StoryType } from './index'

/**
 * V1 babel.json data structures
 */
export interface V1Story {
  id: string
  title: string
  created: number
  versions: string[] // array of version IDs
  versioningMode?: string
}

export interface V1Version {
  id: string
  name: string
  storyId: string
  wordCount: number
  created: number
  branch?: string
}

export interface V1BabelJson {
  stories: V1Story[]
  versions: V1Version[]
  backups?: Array<unknown> // ignore for migration
  activity?: Array<unknown> // ignore for migration
}

/**
 * Migration planning structures
 */
export interface MigrationPlan {
  v1Source: string
  stories: StoryStagingPlan[]
  globalErrors: string[]
}

export interface StoryStagingPlan {
  v1Id: string
  title: string
  type: StoryType
  createdAt: Date
  status: 'valid' | 'skipped'
  skipReason?: string
  versions: VersionStagingPlan[]
}

export interface VersionStagingPlan {
  v1VersionId: string
  name: string
  filePath: string
  v1Branch?: string // Branch in v1 repository where this version exists
  targetBranch: string
  targetFileName: string
  action: 'create-branch' | 'commit-to-current'
}

/**
 * Migration execution results
 */
export interface MigrationReport {
  timestamp: Date
  v1Source: string
  v2Destination: string
  summary: {
    totalStories: number
    storiesCreated: number
    storiesSkipped: number
    versionsMigrated: number
    gitCommits: number
  }
  storiesProcessed: StoryMigrationResult[]
  validationErrors: string[]
  executionErrors: string[]
}

export interface StoryMigrationResult {
  v1Id: string
  title: string
  type: StoryType
  status: 'created' | 'skipped' | 'error'
  versionsCreated?: number
  commitsCreated?: number
  branchesCreated?: string[]
  error?: string
}

/**
 * Zod schema for v1 babel.json validation
 */
export const v1BabelJsonSchema = z.object({
  stories: z.array(
    z.object({
      id: z.string().uuid(),
      title: z.string(),
      created: z.number(),
      versions: z.array(z.string()),
      versioningMode: z.string().optional(),
    })
  ),
  versions: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      storyId: z.string().uuid(),
      wordCount: z.number(),
      created: z.number(),
      branch: z.string().optional(),
    })
  ),
  backups: z.array(z.unknown()).optional(),
  activity: z.array(z.unknown()).optional(),
})
