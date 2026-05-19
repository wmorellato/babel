/**
 * In-Memory Database Mock for Testing
 */

import { IDatabase, IStatement, RunResult } from '../../src/db/database';

class InMemoryStatement implements IStatement {
  private data: Map<string, unknown[]> = new Map();
  private lastInsertId = 0;

  constructor(private sql: string, private db: InMemoryDatabase) {}

  run(...params: unknown[]): RunResult {
    return this.db.exec(this.sql, params);
  }

  all(...params: unknown[]): unknown[] {
    return this.db.query(this.sql, params);
  }

  get(...params: unknown[]): unknown {
    const results = this.db.query(this.sql, params);
    return results[0];
  }
}

export class InMemoryDatabase implements IDatabase {
  private tables: Map<string, unknown[][]> = new Map();
  private transactions: (() => unknown)[] = [];

  exec(sql: string): void {
    // Parse CREATE TABLE and handle basic DDL
    if (sql.includes('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/);
      if (match) {
        const tableName = match[1];
        if (!this.tables.has(tableName)) {
          this.tables.set(tableName, []);
        }
      }
    }
    // Handle CREATE INDEX
    if (sql.includes('CREATE INDEX')) {
      // No-op for in-memory
    }
    // Handle DROP TABLE
    if (sql.includes('DROP TABLE')) {
      const match = sql.match(/DROP TABLE IF EXISTS (\w+)/);
      if (match) {
        this.tables.delete(match[1]);
      }
    }
  }

  prepare(sql: string): IStatement {
    return new InMemoryStatement(sql, this);
  }

  transaction<T>(fn: () => T): () => T {
    return () => {
      // Simple transaction mock - just execute the function
      return fn();
    };
  }

  close(): void {
    this.tables.clear();
  }

  // Test helper methods
  exec(sql: string, params: unknown[] = []): RunResult {
    // Simple INSERT simulation
    if (sql.includes('INSERT')) {
      return { changes: 1 };
    }
    // Simple UPDATE simulation
    if (sql.includes('UPDATE')) {
      return { changes: 1 };
    }
    // Simple DELETE simulation
    if (sql.includes('DELETE')) {
      return { changes: 1 };
    }
    return { changes: 0 };
  }

  query(sql: string, params: unknown[] = []): unknown[] {
    // Simple SELECT simulation
    if (sql.includes('SELECT')) {
      return [];
    }
    return [];
  }
}
