/**
 * Word count history repository - tracks daily word counts per story
 */

import { IDatabase } from './database';
import { Repository } from './repository';
import { WordCountEntry } from '../types';
import { ValidationError } from '../utils/errorHandler';

interface WordCountRow {
  id: string;
  story_id: string;
  date: string;
  word_count: number;
}

export class WordCountRepository extends Repository {
  constructor(db: IDatabase) {
    super(db);
  }

  create(entry: WordCountEntry): void {
    if (!entry.id || !entry.storyId || !entry.date || entry.wordCount < 0) {
      throw new ValidationError('WordCountEntry must have valid id, storyId, date, and wordCount');
    }

    this.execute(
      `INSERT OR REPLACE INTO word_count_history (id, story_id, date, word_count)
       VALUES (?, ?, ?, ?)`,
      [entry.id, entry.storyId, entry.date.toISOString().split('T')[0], entry.wordCount]
    );
  }

  findByStoryId(storyId: string): WordCountEntry[] {
    const rows = this.query<WordCountRow>(
      `SELECT * FROM word_count_history WHERE story_id = ? ORDER BY date ASC`,
      [storyId]
    );

    return rows.map((row) => this.mapRowToEntry(row));
  }

  findByStoryAndDate(storyId: string, date: Date): WordCountEntry | undefined {
    const dateStr = date.toISOString().split('T')[0];
    const row = this.queryOne<WordCountRow>(
      `SELECT * FROM word_count_history WHERE story_id = ? AND date = ?`,
      [storyId, dateStr]
    );

    return row ? this.mapRowToEntry(row) : undefined;
  }

  getLatest(storyId: string): WordCountEntry | undefined {
    const row = this.queryOne<WordCountRow>(
      `SELECT * FROM word_count_history WHERE story_id = ? ORDER BY date DESC LIMIT 1`,
      [storyId]
    );

    return row ? this.mapRowToEntry(row) : undefined;
  }

  private mapRowToEntry(row: WordCountRow): WordCountEntry {
    return {
      id: row.id,
      storyId: row.story_id,
      date: new Date(row.date),
      wordCount: row.word_count,
    };
  }
}
