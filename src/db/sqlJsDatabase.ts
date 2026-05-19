/**
 * SqlJsDatabase - File-persisted SQLite Database using sql.js
 * Pure JavaScript SQLite with zero native dependencies
 * Persists data to disk via file operations
 */

import initSqlJs, { Database } from 'sql.js';
import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/errorHandler';
import { IDatabase, IStatement, DatabaseConfig, RunResult } from './database';
import * as fs from 'fs';
import * as path from 'path';

const logger = new Logger('SqlJsDatabase');

/**
 * Format error message preserving stack trace information
 */
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

/**
 * SqlJsDatabase - File-persisted SQLite using sql.js
 */
export class SqlJsDatabase implements IDatabase {
  private db: Database | null = null;
  private config: DatabaseConfig;
  private SQL: any = null;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database and create tables
   */
  async initialize(): Promise<void> {
    // Guard against double initialization
    if (this.db !== null) {
      logger.warn('Database already initialized, skipping re-initialization');
      return;
    }

    try {
      // Initialize sql.js (loads WASM module)
      this.SQL = await initSqlJs();

      // Ensure directory exists
      const dir = path.dirname(this.config.path);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Load existing database from file or create new
      let buffer: Buffer | undefined;
      if (fs.existsSync(this.config.path)) {
        buffer = fs.readFileSync(this.config.path);
      }

      this.db = buffer ? new this.SQL.Database(new Uint8Array(buffer)) : new this.SQL.Database();

      if (!this.db) {
        throw new DatabaseError('Failed to create database instance');
      }

      // Enable foreign keys
      this.db.run('PRAGMA foreign_keys = ON');

      // Create tables
      this.createTables();

      // Persist to disk
      this.persist();

      logger.info('Database initialized', { path: this.config.path });
    } catch (error) {
      this.db = null;
      throw new DatabaseError(`Failed to initialize database: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Execute raw SQL statements (for CREATE TABLE, etc.)
   */
  exec(sql: string): void {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }

    try {
      this.db.run(sql);
      this.persist();
    } catch (error) {
      logger.error(`Failed to execute SQL: ${getErrorMessage(error)}`);
      throw new DatabaseError(`SQL execution failed: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Prepare a SQL statement
   */
  prepare(sql: string): IStatement {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }

    try {
      const stmt = this.db.prepare(sql);
      return new SqlJsStatement(stmt, this.db, this.config.path);
    } catch (error) {
      throw new DatabaseError(`Failed to prepare statement: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create a transaction function
   */
  transaction<T>(fn: () => T): () => T {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }

    return () => {
      try {
        this.db!.run('BEGIN TRANSACTION');
        const result = fn();
        this.db!.run('COMMIT');
        this.persist();
        return result;
      } catch (error) {
        this.db!.run('ROLLBACK');
        throw error;
      }
    };
  }

  /**
   * Close database connection
   */
  close(): void {
    if (this.db) {
      try {
        this.persist();
        this.db.close();
        this.db = null;
        logger.info('Database closed');
      } catch (error) {
        logger.error(`Error closing database: ${getErrorMessage(error)}`);
        throw new DatabaseError(`Failed to close database: ${getErrorMessage(error)}`);
      }
    }
  }

  /**
   * Persist database to disk
   */
  private persist(): void {
    if (!this.db) {
      return;
    }

    try {
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.config.path, buffer);
    } catch (error) {
      logger.error(`Failed to persist database: ${getErrorMessage(error)}`);
      throw new DatabaseError(`Failed to persist database: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Create database tables
   */
  private createTables(): void {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }

    try {
      // Stories table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS stories (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          type TEXT NOT NULL,
          icon_name TEXT DEFAULT 'book',
          current_word_count INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `);

      // Versions table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS versions (
          id TEXT PRIMARY KEY,
          story_id TEXT NOT NULL,
          git_branch TEXT NOT NULL,
          created_at TEXT NOT NULL,
          deleted_at TEXT,
          FOREIGN KEY (story_id) REFERENCES stories(id)
        )
      `);

      // Word count history table
      this.db.run(`
        CREATE TABLE IF NOT EXISTS word_count_history (
          id TEXT PRIMARY KEY,
          story_id TEXT NOT NULL,
          date TEXT NOT NULL,
          word_count INTEGER NOT NULL,
          FOREIGN KEY (story_id) REFERENCES stories(id),
          UNIQUE(story_id, date)
        )
      `);

      // Create indexes for performance
      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_stories_type ON stories(type)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_stories_icon_name ON stories(icon_name)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_versions_story_id ON versions(story_id)
      `);

      this.db.run(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_versions_branch ON versions(story_id, git_branch)
      `);

      this.db.run(`
        CREATE INDEX IF NOT EXISTS idx_word_count_date ON word_count_history(story_id, date)
      `);

      logger.debug('Database tables created');
    } catch (error) {
      throw new DatabaseError(`Failed to create tables: ${getErrorMessage(error)}`);
    }
  }
}

/**
 * Statement wrapper for sql.js
 */
class SqlJsStatement implements IStatement {
  constructor(private stmt: any, private db: Database, private dbPath: string) {}

  /**
   * Execute statement and return changes
   */
  run(...params: unknown[]): RunResult {
    try {
      this.stmt.bind(params);
      this.stmt.step();
      const changes = this.db.getRowsModified();
      this.stmt.free();

      // Persist after modifications
      const data = this.db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(this.dbPath, buffer);

      return { changes };
    } catch (error) {
      throw new DatabaseError(`Failed to run statement: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get all rows matching query
   */
  all(...params: unknown[]): unknown[] {
    try {
      this.stmt.bind(params);
      const results: unknown[] = [];

      while (this.stmt.step()) {
        const row = this.stmt.getAsObject();
        results.push(row);
      }

      this.stmt.reset();
      return results;
    } catch (error) {
      throw new DatabaseError(`Failed to execute query: ${getErrorMessage(error)}`);
    }
  }

  /**
   * Get single row matching query
   */
  get(...params: unknown[]): unknown {
    try {
      this.stmt.bind(params);

      if (this.stmt.step()) {
        const row = this.stmt.getAsObject();
        this.stmt.reset();
        return row;
      }

      this.stmt.reset();
      return undefined;
    } catch (error) {
      throw new DatabaseError(`Failed to execute query: ${getErrorMessage(error)}`);
    }
  }
}
