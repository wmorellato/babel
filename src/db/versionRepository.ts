/**
 * Version repository - data access layer for story versions
 */

import { IDatabase } from './database';
import { Repository } from './repository';
import { Version } from '../types';
import { ValidationError } from '../utils/errorHandler';

interface VersionRow {
  id: string;
  story_id: string;
  git_branch: string;
  created_at: string;
  deleted_at: string | null;
}

export class VersionRepository extends Repository {
  constructor(db: IDatabase) {
    super(db);
  }

  create(version: Version): void {
    if (!version.id || !version.storyId || !version.gitBranch) {
      throw new ValidationError('Version must have id, storyId, and gitBranch');
    }

    this.execute(
      `INSERT INTO versions (id, story_id, git_branch, created_at, deleted_at)
       VALUES (?, ?, ?, ?, NULL)`,
      [version.id, version.storyId, version.gitBranch, version.createdAt.toISOString()]
    );
  }

  findById(id: string): Version | undefined {
    const row = this.queryOne<VersionRow>(
      `SELECT * FROM versions WHERE id = ?`,
      [id]
    );

    return row ? this.mapRowToVersion(row) : undefined;
  }

  findByStoryId(storyId: string): Version[] {
    const rows = this.query<VersionRow>(
      `SELECT * FROM versions WHERE story_id = ? AND deleted_at IS NULL`,
      [storyId]
    );

    return rows.map((row) => this.mapRowToVersion(row));
  }

  findByGitBranch(storyId: string, gitBranch: string): Version | undefined {
    const row = this.queryOne<VersionRow>(
      `SELECT * FROM versions WHERE story_id = ? AND git_branch = ?`,
      [storyId, gitBranch]
    );

    return row ? this.mapRowToVersion(row) : undefined;
  }

  softDelete(id: string): void {
    const updated = this.execute(
      `UPDATE versions SET deleted_at = ? WHERE id = ?`,
      [new Date().toISOString(), id]
    );

    if (updated.changes === 0) {
      throw new ValidationError(`Version with id ${id} not found`);
    }
  }

  private mapRowToVersion(row: VersionRow): Version {
    return {
      id: row.id,
      storyId: row.story_id,
      gitBranch: row.git_branch,
      createdAt: new Date(row.created_at),
      deletedAt: row.deleted_at ? new Date(row.deleted_at) : undefined,
    };
  }
}
