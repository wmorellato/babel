/**
 * Database initialization and management
 */

import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/errorHandler';
import { SqlJsDatabase } from './sqlJsDatabase';
import { MigrationRunner } from './migrations';
import { v1 } from './migrations/v1';
import { migrateV2 } from './migrations/v2';
import { migrateV3 } from './migrations/v3';
import { migrateV4 } from './migrations/v4';
import { migrateV5 } from './migrations/v5';
import { migrateV6 } from './migrations/v6-color-annotations';

const logger = new Logger('Database');

export interface DatabaseConfig {
  path: string;
}

export interface IDatabase {
  exec(sql: string): void;
  prepare(sql: string): IStatement;
  transaction<T>(fn: () => T): () => T;
  close(): void;
}

export interface IStatement {
  run(...params: unknown[]): RunResult;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

export interface RunResult {
  changes: number;
}

export class BabelDatabase {
  private db: IDatabase | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    try {
      // Use sql.js for file persistence (zero native dependencies)
      const sqlJsDb = new SqlJsDatabase(this.config);
      await sqlJsDb.initialize();
      this.db = sqlJsDb;
      logger.info('Database initialized with sql.js', { path: this.config.path });

      // Run migrations
      const migrationRunner = new MigrationRunner(this.db);
      migrationRunner.initialize();
      migrationRunner.runMigrations([v1, migrateV2, migrateV3, migrateV4, migrateV5, migrateV6]);
      logger.info('Migrations completed');
    } catch (error) {
      throw new DatabaseError(`Failed to initialize database: ${error}`);
    }
  }

  getDb(): IDatabase {
    if (!this.db) {
      throw new DatabaseError('Database not initialized');
    }
    return this.db;
  }

  getPath(): string {
    return this.config.path;
  }

  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      logger.info('Database closed');
    }
  }

  isInitialized(): boolean {
    return this.db !== null;
  }
}
