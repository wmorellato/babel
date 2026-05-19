/**
 * Database migration framework
 */

import { IDatabase } from './database';
import { Logger } from '../utils/logger';
import { DatabaseError } from '../utils/errorHandler';

const logger = new Logger('Migrations');

export interface Migration {
  name: string;
  up: (db: IDatabase) => void;
  down: (db: IDatabase) => void;
}

export class MigrationRunner {
  private db: IDatabase;
  private initialized = false;

  constructor(db: IDatabase) {
    this.db = db;
  }

  initialize(): void {
    if (this.initialized) {
      return;
    }

    try {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS migrations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          applied_at TEXT NOT NULL
        )
      `);
      this.initialized = true;
      logger.info('Migrations table initialized');
    } catch (error) {
      throw new DatabaseError(`Failed to initialize migrations table: ${error}`);
    }
  }

  runMigration(migration: Migration): void {
    if (!this.initialized) {
      throw new DatabaseError('MigrationRunner not initialized. Call initialize() first.');
    }

    // Check if already applied
    const applied = this.getAppliedMigrations();
    if (applied.includes(migration.name)) {
      logger.debug(`Migration ${migration.name} already applied, skipping`);
      return;
    }

    try {
      logger.info(`Running migration: ${migration.name}`);
      migration.up(this.db);

      // Record migration
      const id = `${migration.name}-${Date.now()}`;
      this.db
        .prepare(
          `INSERT INTO migrations (id, name, applied_at) VALUES (?, ?, ?)`
        )
        .run(id, migration.name, new Date().toISOString());

      logger.info(`Migration ${migration.name} applied successfully`);
    } catch (error) {
      throw new DatabaseError(`Migration ${migration.name} failed: ${error}`);
    }
  }

  runMigrations(migrations: Migration[]): void {
    if (!this.initialized) {
      throw new DatabaseError('MigrationRunner not initialized. Call initialize() first.');
    }

    for (const migration of migrations) {
      this.runMigration(migration);
    }
  }

  rollbackMigration(migrationName: string): void {
    if (!this.initialized) {
      throw new DatabaseError('MigrationRunner not initialized. Call initialize() first.');
    }

    const applied = this.getAppliedMigrations();
    if (!applied.includes(migrationName)) {
      throw new DatabaseError(`Migration ${migrationName} not found in applied migrations`);
    }

    // Rollback requires storing Migration objects with down() methods
    // This is not yet implemented and will be completed in a future phase
    throw new DatabaseError(
      `Rollback for migration ${migrationName} is not yet implemented. ` +
      `To implement rollback, migrations must be stored as objects with down() methods.`
    );
  }

  getAppliedMigrations(): string[] {
    if (!this.initialized) {
      return [];
    }

    const rows = this.db.prepare(`SELECT name FROM migrations ORDER BY applied_at ASC`).all();
    return (rows as Array<{ name: string }>).map((row) => row.name);
  }
}
