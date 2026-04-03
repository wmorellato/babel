/**
 * Migration v5: Add soft delete support to stories
 */

import { Migration } from '../migrations';

export const migrateV5: Migration = {
  name: 'v5-add-soft-delete-to-stories',

  up: (db) => {
    db.exec(`
      ALTER TABLE stories ADD COLUMN deleted_at TEXT
    `);
  },

  down: (db) => {
    // Note: SQLite doesn't support DROP COLUMN well, so we'd need to recreate the table
    // For now, this is a one-way migration
    // In production, you'd recreate the table without the column
  },
};
