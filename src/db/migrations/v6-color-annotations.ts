/**
 * Migration v6: Add color annotations support
 */

import { Migration } from '../migrations';

export const migrateV6: Migration = {
  name: 'v6-add-color-annotations',

  up: (db) => {
    db.exec(`
      CREATE TABLE color_annotations (
        id TEXT PRIMARY KEY,
        storyId TEXT NOT NULL,
        versionId TEXT NOT NULL,
        startPos INTEGER NOT NULL,
        endPos INTEGER NOT NULL,
        color TEXT NOT NULL,
        createdAt INTEGER NOT NULL,
        updatedAt INTEGER NOT NULL,
        UNIQUE(storyId, versionId, startPos, endPos),
        FOREIGN KEY(storyId) REFERENCES stories(id)
      );

      CREATE INDEX idx_color_annotations_story_version
        ON color_annotations(storyId, versionId);
    `);
  },

  down: (db) => {
    db.exec('DROP TABLE color_annotations;');
  }
};
