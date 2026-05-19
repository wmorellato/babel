/**
 * Migration v4: Add backups table for backup history tracking
 */

import { Migration } from '../migrations';

export const migrateV4: Migration = {
  name: 'v4-add-backups-table',

  up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        type TEXT NOT NULL,
        storage_size INTEGER NOT NULL,
        file_count INTEGER NOT NULL,
        story_count INTEGER NOT NULL,
        total_word_count INTEGER NOT NULL,
        status TEXT NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.exec(`CREATE INDEX IF NOT EXISTS idx_backups_timestamp ON backups(timestamp DESC)`);
  },

  down: (db) => {
    db.exec(`DROP TABLE IF EXISTS backups`);
  },
};
