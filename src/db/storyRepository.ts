/**
 * Story repository - data access layer for stories
 */

import { IDatabase } from './database';
import { Repository } from './repository';
import { Story, StoryType } from '../types';
import { ValidationError } from '../utils/errorHandler';

interface StoryRow {
  id: string;
  display_name: string;
  type: string;
  icon_name?: string;
  current_word_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string | null;
}

export class StoryRepository extends Repository {
  constructor(db: IDatabase) {
    super(db);
  }

  create(story: Story): void {
    if (!story.id || !story.displayName || !story.type) {
      throw new ValidationError('Story must have id, displayName, and type');
    }

    this.execute(
      `INSERT INTO stories (id, display_name, type, icon_name, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        story.id,
        story.displayName,
        story.type,
        story.iconName || null,
        story.createdAt.toISOString(),
        story.updatedAt.toISOString(),
      ]
    );
  }

  findById(id: string, includeDeleted: boolean = false): Story | undefined {
    const whereClause = includeDeleted ? `id = ?` : `id = ? AND deleted_at IS NULL`;
    const row = this.queryOne<StoryRow>(
      `SELECT * FROM stories WHERE ${whereClause}`,
      [id]
    );

    return row ? this.mapRowToStory(row) : undefined;
  }

  findAll(includeDeleted: boolean = false): Story[] {
    const whereClause = includeDeleted ? '' : ' WHERE deleted_at IS NULL';
    const rows = this.query<StoryRow>(`SELECT * FROM stories${whereClause}`);
    return rows.map((row) => this.mapRowToStory(row));
  }

  findByType(type: StoryType, includeDeleted: boolean = false): Story[] {
    const whereClause = includeDeleted
      ? ` WHERE type = ?`
      : ` WHERE type = ? AND deleted_at IS NULL`;
    const rows = this.query<StoryRow>(`SELECT * FROM stories${whereClause}`, [type]);
    return rows.map((row) => this.mapRowToStory(row));
  }

  findByDisplayName(displayName: string, includeDeleted: boolean = false): Story | undefined {
    const whereClause = includeDeleted
      ? `display_name = ?`
      : `display_name = ? AND deleted_at IS NULL`;
    const row = this.queryOne<StoryRow>(
      `SELECT * FROM stories WHERE ${whereClause}`,
      [displayName]
    );

    return row ? this.mapRowToStory(row) : undefined;
  }

  update(story: Story): void {
    const updated = this.execute(
      `UPDATE stories SET display_name = ?, type = ?, updated_at = ?
       WHERE id = ?`,
      [
        story.displayName,
        story.type,
        story.updatedAt.toISOString(),
        story.id,
      ]
    );

    if (updated.changes === 0) {
      throw new ValidationError(`Story with id ${story.id} not found`);
    }
  }

  /**
   * Soft delete - mark story as deleted without removing from database
   */
  delete(id: string): void {
    this.execute(
      `UPDATE stories SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [new Date().toISOString(), id]
    );
  }

  /**
   * Hard delete - completely remove story from database (use with caution)
   */
  hardDelete(id: string): void {
    this.execute(`DELETE FROM stories WHERE id = ?`, [id]);
  }

  /**
   * Restore a soft-deleted story
   */
  restore(id: string): void {
    this.execute(
      `UPDATE stories SET deleted_at = NULL WHERE id = ? AND deleted_at IS NOT NULL`,
      [id]
    );
  }

  /**
   * Find deleted stories
   */
  findDeleted(): Story[] {
    const rows = this.query<StoryRow>(`SELECT * FROM stories WHERE deleted_at IS NOT NULL`);
    return rows.map((row) => this.mapRowToStory(row));
  }

  updateIcon(id: string, iconName: string): void {
    const updated = this.execute(
      `UPDATE stories SET icon_name = ?, updated_at = ? WHERE id = ?`,
      [
        iconName,
        new Date().toISOString(),
        id,
      ]
    );

    if (updated.changes === 0) {
      throw new ValidationError(`Story with id ${id} not found`);
    }
  }

  updateWordCount(id: string, wordCount: number): void {
    const updated = this.execute(
      `UPDATE stories SET current_word_count = ?, updated_at = ? WHERE id = ?`,
      [
        wordCount,
        new Date().toISOString(),
        id,
      ]
    );

    if (updated.changes === 0) {
      throw new ValidationError(`Story with id ${id} not found`);
    }
  }

  private mapRowToStory(row: StoryRow): Story {
    return {
      id: row.id,
      displayName: row.display_name,
      type: row.type as StoryType,
      iconName: row.icon_name,
      currentWordCount: row.current_word_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
