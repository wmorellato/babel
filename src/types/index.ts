/**
 * Core type definitions for Babel extension
 */

export interface Story {
  id: string;
  displayName: string;
  type: StoryType;
  iconName?: string;
  currentWordCount?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Version {
  id: string;
  storyId: string;
  gitBranch: string;
  createdAt: Date;
  deletedAt?: Date;
}

export interface WordCountEntry {
  id: string;
  storyId: string;
  date: Date;
  wordCount: number;
}

export enum StoryType {
  SHORT_STORY = 'short-story',
  NOVEL = 'novel',
  NOVELLA = 'novella',
  ESSAY = 'essay',
}

export interface StoryTypeDefinition {
  type: StoryType;
  displayName: string;
  description: string;
  files: Record<string, string>; // filename -> initial content
}

export interface IconDefinition {
  name: string; // VSCode theme icon name (e.g., 'book', 'lightbulb')
  label: string; // Display label (e.g., 'Book', 'Lightbulb Idea')
  description?: string; // Optional tooltip description
  category?: string; // Icon category (e.g., 'default', 'creative', 'emotional')
}

export interface BabelConfig {
  workspaceRoot: string;
  databasePath: string;
}

export interface CommitMetadata {
  wordCount: number;
  wordDelta: number;
  timestamp: Date;
}

export interface BackupConfig {
  enabled: boolean;
  schedule: 'disabled' | 'hourly' | 'daily' | 'weekly';
  time: string; // HH:mm format
  localPath: string;
  retention: number; // Days
  autoSave: boolean;
}

export interface BackupPoint {
  id: string;
  timestamp: Date;
  type: 'full' | 'incremental';
  storageSize: number; // Bytes
  fileCount: number;
  storyCount: number;
  totalWordCount: number;
  status: 'pending' | 'verified' | 'corrupted';
  hash: string; // SHA256
}

export interface BackupData {
  databaseSnapshot: Buffer;
  storyFiles: Map<string, Buffer>; // filename -> content
  manifest: BackupManifest;
}

export interface BackupManifest {
  version: string;
  createdAt: Date;
  backupId: string;
  stories: Array<{
    id: string;
    displayName: string;
    fileCount: number;
  }>;
  metadata: {
    babelVersion: string;
    databaseVersion: string;
  };
}

/**
 * Color annotation for a text range in a story version
 */
export interface ColorAnnotation {
  id: string;          // UUID
  storyId: string;     // UUID of story
  versionId: string;   // Git branch name (e.g., 'main', 'feature/xyz')
  startPos: number;    // 0-based character offset
  endPos: number;      // 0-based character offset
  color: string;       // Color name from palette (e.g., 'red', 'blue')
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Color palette configuration
 */
export interface ColorPalette {
  [colorName: string]: string; // e.g., { red: '#FF6B6B', blue: '#0066FF' }
}

// Re-export migration types
export type {
  V1Story,
  V1Version,
  V1BabelJson,
  MigrationPlan,
  StoryStagingPlan,
  VersionStagingPlan,
  MigrationReport,
  StoryMigrationResult,
} from './migration'
export { v1BabelJsonSchema } from './migration'
