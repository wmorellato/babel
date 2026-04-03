/**
 * Database migrations tests
 */

import { MigrationRunner, Migration } from '../../../src/db/migrations';
import { IDatabase } from '../../../src/db/database';
import { createTestDatabase } from '../../helpers/database';

describe('MigrationRunner', () => {
  let db: IDatabase;
  let runner: MigrationRunner;

  beforeEach(() => {
    db = createTestDatabase();
    runner = new MigrationRunner(db);
  });

  afterEach(() => {
    db.close();
  });

  describe('initialization', () => {
    it('should create migrations table on init', () => {
      runner.initialize();

      // Verify migrations table exists by being able to query it
      const testMigration: Migration = {
        name: 'test-init',
        up: (db) => {},
        down: (db) => {},
      };

      expect(() => runner.runMigration(testMigration)).not.toThrow();
      expect(runner.getAppliedMigrations()).toContain('test-init');
    });

    it('should handle already initialized database', () => {
      runner.initialize();
      expect(() => runner.initialize()).not.toThrow();
    });
  });

  describe('migration execution', () => {
    beforeEach(() => {
      runner.initialize();
    });

    it('should execute migration and record it', () => {
      const testMigration: Migration = {
        name: 'test-migration-001',
        up: (db) => {
          db.exec('CREATE TABLE test_table (id TEXT PRIMARY KEY)');
        },
        down: (db) => {
          db.exec('DROP TABLE test_table');
        },
      };

      runner.runMigration(testMigration);

      // Verify migration was recorded
      const migrations = runner.getAppliedMigrations();
      expect(migrations).toContain('test-migration-001');
    });

    it('should not re-run already applied migrations', () => {
      const testMigration: Migration = {
        name: 'test-idempotent',
        up: (db) => {
          db.exec('CREATE TABLE idempotent_test (id TEXT PRIMARY KEY)');
        },
        down: (db) => {},
      };

      runner.runMigration(testMigration);
      expect(() => runner.runMigration(testMigration)).not.toThrow();
    });

    it('should handle migration errors gracefully', () => {
      const badMigration: Migration = {
        name: 'bad-migration',
        up: (db) => {
          throw new Error('Migration failed');
        },
        down: (db) => {},
      };

      expect(() => runner.runMigration(badMigration)).toThrow('Migration failed');
    });
  });

  describe('migration rollback', () => {
    beforeEach(() => {
      runner.initialize();
    });

    it('should throw error for rollback (not yet implemented)', () => {
      const migration: Migration = {
        name: 'rollback-test',
        up: (db) => {
          db.exec('CREATE TABLE rollback_test (id TEXT PRIMARY KEY)');
        },
        down: (db) => {
          db.exec('DROP TABLE rollback_test');
        },
      };

      runner.runMigration(migration);
      expect(runner.getAppliedMigrations()).toContain('rollback-test');

      // Rollback is not yet implemented - should throw
      expect(() => runner.rollbackMigration('rollback-test')).toThrow(
        'not yet implemented'
      );
    });

    it('should prevent rollback of non-existent migration', () => {
      expect(() => runner.rollbackMigration('nonexistent')).toThrow();
    });
  });

  describe('batch migrations', () => {
    beforeEach(() => {
      runner.initialize();
    });

    it('should run multiple migrations in order', () => {
      const migrations: Migration[] = [
        {
          name: 'migration-001',
          up: (db) => {},
          down: (db) => {},
        },
        {
          name: 'migration-002',
          up: (db) => {},
          down: (db) => {},
        },
      ];

      runner.runMigrations(migrations);

      const applied = runner.getAppliedMigrations();
      expect(applied).toContain('migration-001');
      expect(applied).toContain('migration-002');
    });

    it('should stop on first migration error', () => {
      const migrations: Migration[] = [
        {
          name: 'ok-migration',
          up: (db) => {},
          down: (db) => {},
        },
        {
          name: 'bad-migration',
          up: (db) => {
            throw new Error('Failed');
          },
          down: (db) => {},
        },
        {
          name: 'never-run',
          up: (db) => {},
          down: (db) => {},
        },
      ];

      expect(() => runner.runMigrations(migrations)).toThrow();

      const applied = runner.getAppliedMigrations();
      expect(applied).toContain('ok-migration');
      expect(applied).not.toContain('bad-migration');
      expect(applied).not.toContain('never-run');
    });
  });
});
