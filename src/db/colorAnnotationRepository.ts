/**
 * Repository for color annotations with CRUD operations
 */

import { IDatabase } from './database';
import { Repository } from './repository';
import { ColorAnnotation } from '../types';
import { Logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

const logger = new Logger('ColorAnnotationRepository');

export class ColorAnnotationRepository extends Repository {
  constructor(db: IDatabase) {
    super(db);
  }

  /**
   * Save a color annotation. Updates if same id exists, otherwise inserts.
   * Throws if duplicate range exists with different id.
   */
  save(annotation: ColorAnnotation): ColorAnnotation {
    try {
      const now = Date.now();
      const existing = this.queryOne<any>(
        'SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?',
        [annotation.storyId, annotation.versionId, annotation.startPos, annotation.endPos]
      );

      if (existing) {
        // If existing annotation has different id, it's a unique constraint violation
        if (existing.id !== annotation.id) {
          throw new Error(`UNIQUE constraint failed: color_annotations`);
        }

        // Update existing with same id
        this.execute(
          'UPDATE color_annotations SET color = ?, updatedAt = ? WHERE id = ?',
          [annotation.color, now, annotation.id]
        );

        return {
          ...annotation,
          updatedAt: new Date(now),
        };
      } else {
        // Insert new
        this.execute(
          'INSERT INTO color_annotations (id, storyId, versionId, startPos, endPos, color, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [
            annotation.id || uuid(),
            annotation.storyId,
            annotation.versionId,
            annotation.startPos,
            annotation.endPos,
            annotation.color,
            annotation.createdAt.getTime(),
            annotation.updatedAt.getTime(),
          ]
        );

        return annotation;
      }
    } catch (error) {
      logger.error('Failed to save color annotation', { error, annotation });
      throw error;
    }
  }

  /**
   * Find all annotations for a story and version, ordered by startPos
   */
  findByStoryAndVersion(storyId: string, versionId: string): ColorAnnotation[] {
    try {
      const rows = this.query<any>(
        'SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? ORDER BY startPos',
        [storyId, versionId]
      );

      return rows.map((row) => this.mapRowToAnnotation(row));
    } catch (error) {
      logger.error('Failed to find annotations by story and version', {
        error,
        storyId,
        versionId,
      });
      return [];
    }
  }

  /**
   * Find a specific annotation by exact range match
   */
  findByRange(
    storyId: string,
    versionId: string,
    startPos: number,
    endPos: number
  ): ColorAnnotation | undefined {
    try {
      const row = this.queryOne<any>(
        'SELECT * FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?',
        [storyId, versionId, startPos, endPos]
      );

      return row ? this.mapRowToAnnotation(row) : undefined;
    } catch (error) {
      logger.error('Failed to find annotation by range', {
        error,
        storyId,
        versionId,
        startPos,
        endPos,
      });
      return undefined;
    }
  }

  /**
   * Delete annotation by id
   */
  delete(id: string): void {
    try {
      this.execute('DELETE FROM color_annotations WHERE id = ?', [id]);
    } catch (error) {
      logger.error('Failed to delete annotation', { error, id });
      throw error;
    }
  }

  /**
   * Delete annotation by exact range match
   */
  deleteByRange(storyId: string, versionId: string, startPos: number, endPos: number): void {
    try {
      this.execute(
        'DELETE FROM color_annotations WHERE storyId = ? AND versionId = ? AND startPos = ? AND endPos = ?',
        [storyId, versionId, startPos, endPos]
      );
    } catch (error) {
      logger.error('Failed to delete annotation by range', {
        error,
        storyId,
        versionId,
        startPos,
        endPos,
      });
      throw error;
    }
  }

  /**
   * Delete all annotations for a story version
   */
  deleteByVersion(storyId: string, versionId: string): void {
    try {
      this.execute(
        'DELETE FROM color_annotations WHERE storyId = ? AND versionId = ?',
        [storyId, versionId]
      );
    } catch (error) {
      logger.error('Failed to delete annotations by version', {
        error,
        storyId,
        versionId,
      });
      throw error;
    }
  }

  /**
   * Map database row to ColorAnnotation object
   */
  private mapRowToAnnotation(row: any): ColorAnnotation {
    return {
      id: row.id,
      storyId: row.storyId,
      versionId: row.versionId,
      startPos: row.startPos,
      endPos: row.endPos,
      color: row.color,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    };
  }
}
