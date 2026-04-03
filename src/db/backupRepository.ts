/**
 * Backup Repository
 * Tracks backup history and metadata
 */

import { IDatabase } from './database';
import { Repository } from './repository';
import { BackupPoint } from '../types';
import { ValidationError } from '../utils/errorHandler';

interface BackupRow {
  id: string;
  timestamp: string;
  type: string;
  storage_size: number;
  file_count: number;
  story_count: number;
  total_word_count: number;
  status: string;
  hash: string;
}

export class BackupRepository extends Repository {
  constructor(db: IDatabase) {
    super(db);
  }

  /**
   * Create a new backup record
   */
  create(backup: BackupPoint): void {
    if (!backup.id || !backup.timestamp || !backup.hash) {
      throw new ValidationError('BackupPoint must have id, timestamp, and hash');
    }

    this.execute(
      `INSERT OR REPLACE INTO backups (id, timestamp, type, storage_size, file_count, story_count, total_word_count, status, hash)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        backup.id,
        backup.timestamp.toISOString(),
        backup.type,
        backup.storageSize,
        backup.fileCount,
        backup.storyCount,
        backup.totalWordCount,
        backup.status,
        backup.hash,
      ]
    );
  }

  /**
   * Get all backups, ordered by timestamp descending
   */
  findAll(): BackupPoint[] {
    const rows = this.query<BackupRow>(`SELECT * FROM backups ORDER BY timestamp DESC`);
    return rows.map((row) => this.mapRowToBackup(row));
  }

  /**
   * Get the most recent backup
   */
  getLatest(): BackupPoint | undefined {
    const row = this.queryOne<BackupRow>(
      `SELECT * FROM backups ORDER BY timestamp DESC LIMIT 1`
    );
    return row ? this.mapRowToBackup(row) : undefined;
  }

  /**
   * Get backups created after a given timestamp
   */
  findAfter(timestamp: Date): BackupPoint[] {
    const rows = this.query<BackupRow>(
      `SELECT * FROM backups WHERE timestamp > ? ORDER BY timestamp DESC`,
      [timestamp.toISOString()]
    );
    return rows.map((row) => this.mapRowToBackup(row));
  }

  /**
   * Get backup by ID
   */
  findById(id: string): BackupPoint | undefined {
    const row = this.queryOne<BackupRow>(`SELECT * FROM backups WHERE id = ?`, [id]);
    return row ? this.mapRowToBackup(row) : undefined;
  }

  /**
   * Delete a specific backup by ID
   */
  delete(id: string): void {
    this.execute(`DELETE FROM backups WHERE id = ?`, [id]);
  }

  /**
   * Delete old backups
   */
  deleteOlderThan(timestamp: Date): number {
    const result = this.execute(`DELETE FROM backups WHERE timestamp < ?`, [
      timestamp.toISOString(),
    ]);
    return result.changes || 0;
  }

  /**
   * Update backup status
   */
  updateStatus(id: string, status: 'pending' | 'verified' | 'corrupted'): void {
    this.execute(`UPDATE backups SET status = ? WHERE id = ?`, [status, id]);
  }

  /**
   * Get total backup storage size
   */
  getTotalSize(): number {
    const result = this.queryOne<{ total: number }>(
      `SELECT SUM(storage_size) as total FROM backups`
    );
    return result?.total ?? 0;
  }

  /**
   * Count backups
   */
  count(): number {
    const result = this.queryOne<{ count: number }>(`SELECT COUNT(*) as count FROM backups`);
    return result?.count ?? 0;
  }

  private mapRowToBackup(row: BackupRow): BackupPoint {
    return {
      id: row.id,
      timestamp: new Date(row.timestamp),
      type: row.type as 'full' | 'incremental',
      storageSize: row.storage_size,
      fileCount: row.file_count,
      storyCount: row.story_count,
      totalWordCount: row.total_word_count,
      status: row.status as 'pending' | 'verified' | 'corrupted',
      hash: row.hash,
    };
  }
}
