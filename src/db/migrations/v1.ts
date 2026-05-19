/**
 * Migration v1: Initial database schema
 */

import { Migration } from '../migrations';

export const v1: Migration = {
  name: 'v1-initial-schema',

  up: (db) => {
    // Stories table
    db.exec(`
      CREATE TABLE IF NOT EXISTS stories (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `);

    // Create index on type for filtering
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_stories_type ON stories(type)
    `);

    // Versions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        git_branch TEXT NOT NULL,
        created_at TEXT NOT NULL,
        deleted_at TEXT,
        FOREIGN KEY (story_id) REFERENCES stories(id)
      )
    `);

    // Create indexes for version queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_versions_story_id ON versions(story_id)
    `);

    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_branch ON versions(story_id, git_branch)
    `);

    // Word count history table
    db.exec(`
      CREATE TABLE IF NOT EXISTS word_count_history (
        id TEXT PRIMARY KEY,
        story_id TEXT NOT NULL,
        date TEXT NOT NULL,
        word_count INTEGER NOT NULL,
        FOREIGN KEY (story_id) REFERENCES stories(id),
        UNIQUE(story_id, date)
      )
    `);

    // Create index for date range queries
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_word_count_date ON word_count_history(story_id, date)
    `);
  },

  down: (db) => {
    // Drop in reverse order
    db.exec('DROP INDEX IF EXISTS idx_word_count_date');
    db.exec('DROP TABLE IF EXISTS word_count_history');
    db.exec('DROP INDEX IF EXISTS idx_versions_branch');
    db.exec('DROP INDEX IF EXISTS idx_versions_story_id');
    db.exec('DROP TABLE IF EXISTS versions');
    db.exec('DROP INDEX IF EXISTS idx_stories_type');
    db.exec('DROP TABLE IF EXISTS stories');
  },
};
