/**
 * Mock for better-sqlite3 - allows tests to run without native compilation
 */

interface RunResult {
  changes: number;
}

interface Statement {
  run(...params: unknown[]): RunResult;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface Database {
  pragma(pragma: string): void;
  exec(sql: string): void;
  prepare(sql: string): Statement;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

/**
 * In-memory mock database for testing.
 * This is not a full implementation - it's specifically for test isolation.
 */
class MockDatabase {
  private data: Map<string, unknown[]> = new Map();

  pragma(): void {
    // No-op
  }

  exec(sql: string): void {
    // Simple table creation tracking
    if (sql.includes('CREATE TABLE')) {
      const match = sql.match(/CREATE TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
      if (match) {
        const tableName = match[1];
        if (!this.data.has(tableName)) {
          this.data.set(tableName, []);
        }
      }
    }
  }

  prepare(sql: string): Statement {
    return new MockStatement(sql, this.data);
  }

  transaction<T>(fn: () => T): () => T {
    return () => fn();
  }

  close(): void {
    this.data.clear();
  }
}

class MockStatement {
  constructor(private sql: string, private data: Map<string, unknown[]>) {}

  run(...params: unknown[]): RunResult {
    // Extract table name from SQL
    const tableMatch = this.sql.match(/(?:INSERT|UPDATE|DELETE)\s+(?:OR\s+\w+\s+)?(?:INTO\s+)?(\w+)/i);
    const tableName = tableMatch?.[1] || '';

    // For INSERT
    if (this.sql.includes('INSERT')) {
      const table = this.data.get(tableName) || [];
      const row: Record<string, unknown> = {};
      const columnsMatch = this.sql.match(/\((.*?)\)\s+VALUES/i);
      if (columnsMatch) {
        const columns = columnsMatch[1].split(',').map((c) => c.trim());
        columns.forEach((col, idx) => {
          row[col] = params[idx];
        });
      }
      table.push(row);
      this.data.set(tableName, table);
      return { changes: 1 };
    }

    // For UPDATE
    if (this.sql.includes('UPDATE')) {
      const table = this.data.get(tableName) || [];
      return { changes: table.length > 0 ? 1 : 0 };
    }

    // For DELETE
    if (this.sql.includes('DELETE')) {
      return { changes: 1 };
    }

    return { changes: 0 };
  }

  all(...params: unknown[]): unknown[] {
    const tableMatch = this.sql.match(/FROM\s+(\w+)/i);
    const tableName = tableMatch?.[1] || '';
    const table = this.data.get(tableName) || [];
    return table;
  }

  get(...params: unknown[]): unknown {
    const table = this.all(...params);
    return table.length > 0 ? table[0] : undefined;
  }
}

export default function createDatabase(): Database {
  return new MockDatabase() as unknown as Database;
}
