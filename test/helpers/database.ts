/**
 * Database test helpers - Simplified in-memory implementation
 */

import { IDatabase, IStatement, RunResult } from '../../src/db/database';
import { StoryType } from '../../src/types';

export function createTestDatabase(): IDatabase {
  const data: Map<string, Record<string, unknown>[]> = new Map();

  const db: IDatabase = {
    exec(sql: string): void {
      if (sql.includes('CREATE TABLE')) {
        const match = sql.match(/CREATE TABLE\s+IF\s+NOT\s+EXISTS\s+(\w+)/i);
        if (match) {
          const table = match[1];
          if (!data.has(table)) {
            data.set(table, []);
          }
        }
      }
    },

    prepare(sql: string): IStatement {
      return {
        run(...params: unknown[]): RunResult {
          // INSERT
          if (sql.includes('INSERT')) {
            const tableMatch = sql.match(/INTO\s+(\w+)/i);
            const table = tableMatch?.[1];
            if (!table) return { changes: 0 };

            const columnsMatch = sql.match(/\(([^)]+)\)\s+VALUES/i);
            if (!columnsMatch) return { changes: 0 };

            const columns = columnsMatch[1].split(',').map((c) => c.trim());
            const row: Record<string, unknown> = {};

            columns.forEach((col, idx) => {
              row[col] = params[idx];
            });

            // INSERT OR REPLACE - check for duplicate based on unique constraint
            const rows = data.get(table) || [];
            if (sql.includes('OR REPLACE')) {
              // For word_count_history: unique on (story_id, date)
              if (table === 'word_count_history') {
                const filtered = rows.filter(
                  (r) => !(r['story_id'] === row['story_id'] && r['date'] === row['date'])
                );
                filtered.push(row);
                data.set(table, filtered);
                return { changes: 1 };
              }
              // For other tables: unique on id
              if (row['id']) {
                const filtered = rows.filter((r) => r['id'] !== row['id']);
                filtered.push(row);
                data.set(table, filtered);
                return { changes: 1 };
              }
            }

            // Check unique constraints
            // For color_annotations: unique on (storyId, versionId, startPos, endPos)
            if (table === 'color_annotations') {
              const duplicate = rows.find(
                (r) =>
                  r['storyId'] === row['storyId'] &&
                  r['versionId'] === row['versionId'] &&
                  r['startPos'] === row['startPos'] &&
                  r['endPos'] === row['endPos']
              );
              if (duplicate) {
                throw new Error(`UNIQUE constraint failed: color_annotations`);
              }
            }

            rows.push(row);
            data.set(table, rows);
            return { changes: 1 };
          }

          // UPDATE
          if (sql.includes('UPDATE')) {
            const tableMatch = sql.match(/UPDATE\s+(\w+)/i);
            const table = tableMatch?.[1];
            if (!table) return { changes: 0 };

            const rows = data.get(table) || [];
            const whereMatch = sql.match(/WHERE\s+(\w+)\s*=\s*\?/i);
            if (!whereMatch) return { changes: 0 };

            const whereCol = whereMatch[1];
            const whereVal = params[params.length - 1];

            const setMatch = sql.match(/SET\s+(.+?)\s+WHERE/i);
            if (!setMatch) return { changes: 0 };

            const setClauses = setMatch[1].split(',').map((s) => s.trim());
            let changes = 0;

            for (const row of rows) {
              if (row[whereCol] === whereVal) {
                let paramIdx = 0;
                for (const clause of setClauses) {
                  const match = clause.match(/(\w+)\s*=\s*\?/);
                  if (match) {
                    row[match[1]] = params[paramIdx++];
                    changes++;
                  }
                }
              }
            }

            return { changes: changes > 0 ? 1 : 0 };
          }

          // DELETE
          if (sql.includes('DELETE')) {
            const tableMatch = sql.match(/FROM\s+(\w+)/i);
            const table = tableMatch?.[1];
            if (!table) return { changes: 0 };

            const rows = data.get(table) || [];
            const whereMatch = sql.match(/WHERE\s+(.+?)$/i);

            if (whereMatch) {
              const whereClause = whereMatch[1];

              // Handle multiple AND conditions
              if (whereClause.includes('AND')) {
                const conditions = whereClause.split(/\s+AND\s+/i);
                let paramIdx = 0;
                const before = rows.length;

                const filtered = rows.filter((r) => {
                  for (const condition of conditions) {
                    const eqMatch = condition.match(/(\w+)\s*=\s*\?/);
                    if (eqMatch) {
                      const col = eqMatch[1];
                      if (r[col] !== params[paramIdx++]) {
                        return true; // Keep this row
                      }
                    }
                  }
                  return false; // Remove this row (all conditions matched)
                });

                data.set(table, filtered);
                return { changes: before - filtered.length };
              }
              // Single condition
              else {
                const eqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
                if (eqMatch) {
                  const whereCol = eqMatch[1];
                  const whereVal = params[0];
                  const before = rows.length;
                  const filtered = rows.filter((r) => r[whereCol] !== whereVal);
                  data.set(table, filtered);
                  return { changes: before - filtered.length };
                }
              }
            }

            data.set(table, []);
            return { changes: rows.length };
          }

          return { changes: 0 };
        },

        all(...params: unknown[]): unknown[] {
          const tableMatch = sql.match(/FROM\s+(\w+)/i);
          const table = tableMatch?.[1];
          if (!table) return [];

          let rows = [...(data.get(table) || [])];

          // WHERE clause
          const whereMatch = sql.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+LIMIT|$)/i);
          if (whereMatch) {
            const whereClause = whereMatch[1];

            // Handle AND conditions (e.g., "id = ? AND deleted_at IS NULL")
            if (whereClause.includes('AND')) {
              const conditions = whereClause.split(/\s+AND\s+/i);
              let paramIdx = 0;

              for (const condition of conditions) {
                if (condition.includes('IS NULL')) {
                  const colMatch = condition.match(/(\w+)\s+IS\s+NULL/i);
                  if (colMatch) {
                    const col = colMatch[1];
                    rows = rows.filter((r) => r[col] === null || r[col] === undefined);
                  }
                } else if (condition.includes('IS NOT NULL')) {
                  const colMatch = condition.match(/(\w+)\s+IS\s+NOT\s+NULL/i);
                  if (colMatch) {
                    const col = colMatch[1];
                    rows = rows.filter((r) => r[col] !== null && r[col] !== undefined);
                  }
                } else if (condition.includes('=')) {
                  const eqMatch = condition.match(/(\w+)\s*=\s*\?/);
                  if (eqMatch) {
                    const col = eqMatch[1];
                    rows = rows.filter((r) => r[col] === params[paramIdx]);
                    paramIdx++;
                  }
                }
              }
            }
            // IS NULL check
            else if (whereClause.includes('IS NULL')) {
              const colMatch = whereClause.match(/(\w+)\s+IS\s+NULL/i);
              if (colMatch) {
                const col = colMatch[1];
                rows = rows.filter((r) => r[col] === null || r[col] === undefined);
              }
            }
            // Equality check
            else {
              const eqMatch = whereClause.match(/(\w+)\s*=\s*\?/);
              if (eqMatch) {
                const col = eqMatch[1];
                rows = rows.filter((r) => r[col] === params[0]);
              }
            }
          }

          // ORDER BY
          const orderMatch = sql.match(/ORDER\s+BY\s+(\w+)(?:\s+(ASC|DESC))?/i);
          if (orderMatch) {
            const col = orderMatch[1];
            const dir = (orderMatch[2] || 'ASC').toUpperCase();
            rows.sort((a, b) => {
              const aVal = a[col] as never;
              const bVal = b[col] as never;
              if (aVal < bVal) return dir === 'ASC' ? -1 : 1;
              if (aVal > bVal) return dir === 'ASC' ? 1 : -1;
              return 0;
            });
          }

          // LIMIT
          const limitMatch = sql.match(/LIMIT\s+(\d+)/i);
          if (limitMatch) {
            rows = rows.slice(0, parseInt(limitMatch[1], 10));
          }

          return rows;
        },

        get(...params: unknown[]): unknown {
          const all = this.all(...params);
          return all[0];
        },
      };
    },

    transaction<T>(fn: () => T): () => T {
      return () => fn();
    },

    close(): void {
      data.clear();
    },
  };

  return db;
}

export function seedTestStory(
  db: IDatabase,
  overrides: { id?: string; displayName?: string; type?: StoryType } = {}
) {
  const id = overrides.id || 'test-story-1';
  const displayName = overrides.displayName || 'Test Story';
  const type = overrides.type || StoryType.SHORT_STORY;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO stories (id, display_name, type, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  ).run(id, displayName, type, now, now);

  return { id, displayName, type, createdAt: now, updatedAt: now };
}
