import * as vscode from 'vscode';
import { BabelDatabase } from '../db/database';
import { GitRepository } from '../git/gitRepository';
import { StoryRepository } from '../db/storyRepository';
import { VersionRepository } from '../db/versionRepository';
import { WordCountRepository } from '../db/wordCountRepository';
import { BackupRepository } from '../db/backupRepository';
import { ColorAnnotationRepository } from '../db/colorAnnotationRepository';
import { VSCodeSecretStorage } from '../services/credentialStorage';
import { TokenManager } from '../services/tokenManager';
import { BackupDataCollector } from '../services/backupDataCollector';
import { BabelStoriesTreeDataProvider } from '../views/storyTreeDataProvider';
import { ListenerCoordinator } from './listenerCoordinator';
import { Logger } from '../utils/logger';

/**
 * Shared dependencies passed to all feature initialization functions.
 * Centralizes shared state and eliminates redundant instance creation across features.
 */
export interface ExtensionDependencies {
  // VSCode context for registering commands, subscriptions, etc.
  context: vscode.ExtensionContext;

  // Core infrastructure
  database: BabelDatabase;
  workspacePath: string;
  gitRepository: GitRepository;

  // Data access repositories (created once, reused by all features)
  storyRepository: StoryRepository;
  versionRepository: VersionRepository;
  wordCountRepository: WordCountRepository;
  backupRepository: BackupRepository;
  colorAnnotationRepository: ColorAnnotationRepository;

  // Services for credentials, cloud integration, etc.
  credentialStorage: VSCodeSecretStorage;
  tokenManager: TokenManager;

  // Shared data collector used by word count and backup features
  backupDataCollector: BackupDataCollector;

  // UI provider created during feature initialization (optional, set after tree provider init)
  treeDataProvider?: BabelStoriesTreeDataProvider;

  // Listener coordination
  coordinator: ListenerCoordinator;

  // Logging
  logger: Logger;
}
