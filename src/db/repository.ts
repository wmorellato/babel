/**
 * Base repository class for data access patterns
 */

import { IDatabase, RunResult } from './database';
import { DatabaseError } from '../utils/errorHandler';

export abstract class Repository {
  protected db: IDatabase;

  constructor(db: IDatabase) {
    this.db = db;
  }

  protected execute(sql: string, params: unknown[] = []): RunResult {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.run(...params);
    } catch (error) {
      throw new DatabaseError(`Database execute failed: ${error} - SQL: ${sql} - Params: ${JSON.stringify(params)}`);
    }
  }

  protected query<T>(sql: string, params: unknown[] = []): T[] {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.all(...params) as T[];
    } catch (error) {
      throw new DatabaseError(`Database query failed: ${error}`);
    }
  }

  protected queryOne<T>(sql: string, params: unknown[] = []): T | undefined {
    try {
      const stmt = this.db.prepare(sql);
      return stmt.get(...params) as T | undefined;
    } catch (error) {
      throw new DatabaseError(`Database query failed: ${error}`);
    }
  }

  protected transaction<T>(fn: () => T): T {
    const transaction = this.db.transaction(fn);
    return transaction();
  }
}
