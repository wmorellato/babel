// src/utils/migrationLogger.ts

export interface MigrationLogEntry {
  level: 'info' | 'warn' | 'error'
  message: string
  context?: Record<string, unknown>
}

export const migrationLogger = {
  entries: [] as MigrationLogEntry[],

  reset(): void {
    this.entries = []
  },

  info(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'info', message, context })
    console.log(`[INFO] ${message}`, context || '')
  },

  warn(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'warn', message, context })
    console.warn(`[WARN] ${message}`, context || '')
  },

  error(message: string, context?: Record<string, unknown>): void {
    this.entries.push({ level: 'error', message, context })
    console.error(`[ERROR] ${message}`, context || '')
  },

  getAll(): MigrationLogEntry[] {
    return [...this.entries]
  },

  getAllErrors(): string[] {
    return this.entries.filter(e => e.level === 'error').map(e => e.message)
  },

  getAllWarnings(): string[] {
    return this.entries.filter(e => e.level === 'warn').map(e => e.message)
  },
}
