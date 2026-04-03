/**
 * SqlJsDatabase Tests
 * Tests for file-persisted SQLite database using sql.js
 */

import { SqlJsDatabase } from '../../../src/db/sqlJsDatabase';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';

describe('SqlJsDatabase', () => {
  let testDbPath: string;
  let database: SqlJsDatabase | null = null;

  beforeEach(() => {
    // Create temporary test database file
    const timestamp = Date.now();
    const testId = uuidv4();
    testDbPath = path.join('/tmp', `babel-sql-js-test-${timestamp}-${testId}.db`);
  });

  afterEach(async () => {
    // Clean up database
    if (database) {
      database.close();
      database = null;
    }
    // Remove test database file
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('initialization', () => {
    it('should create database file', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should implement IDatabase interface', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      // Verify interface methods exist
      expect(typeof database.exec).toBe('function');
      expect(typeof database.prepare).toBe('function');
      expect(typeof database.transaction).toBe('function');
      expect(typeof database.close).toBe('function');
    });

    it('should handle database initialization gracefully', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await expect(database.initialize()).resolves.not.toThrow();
    });

    it('should create database in specified directory', async () => {
      const dir = path.dirname(testDbPath);
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      expect(fs.existsSync(dir)).toBe(true);
      expect(fs.existsSync(testDbPath)).toBe(true);
    });

    it('should guard against double initialization', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      // Initialize again - should not throw, just return early
      await expect(database.initialize()).resolves.not.toThrow();
    });
  });

  describe('persistence', () => {
    it('should persist data across database instances', async () => {
      // Create and insert
      let db1 = new SqlJsDatabase({ path: testDbPath });
      await db1.initialize();

      db1.exec('CREATE TABLE test_data (id INTEGER PRIMARY KEY, value TEXT)');
      const insertStmt = db1.prepare('INSERT INTO test_data (value) VALUES (?)');
      insertStmt.run('test value');

      db1.close();

      // Reopen and verify
      const db2 = new SqlJsDatabase({ path: testDbPath });
      await db2.initialize();

      const selectStmt = db2.prepare('SELECT * FROM test_data WHERE id = ?');
      const result = selectStmt.get(1) as any;

      expect(result).toBeDefined();
      expect(result.value).toBe('test value');

      db2.close();
    });
  });

  describe('interface methods', () => {
    beforeEach(async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();
    });

    it('should have exec method', () => {
      expect(database).toHaveProperty('exec');
      expect(typeof database!.exec).toBe('function');
    });

    it('should have prepare method', () => {
      expect(database).toHaveProperty('prepare');
      expect(typeof database!.prepare).toBe('function');
    });

    it('should have transaction method', () => {
      expect(database).toHaveProperty('transaction');
      expect(typeof database!.transaction).toBe('function');
    });

    it('should have close method', () => {
      expect(database).toHaveProperty('close');
      expect(typeof database!.close).toBe('function');
    });
  });

  describe('close', () => {
    it('should close database without errors', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      expect(() => {
        database!.close();
      }).not.toThrow();
    });

    it('should allow multiple close calls', async () => {
      database = new SqlJsDatabase({ path: testDbPath });
      await database.initialize();

      expect(() => {
        database!.close();
        database!.close();
      }).not.toThrow();
    });
  });
});
