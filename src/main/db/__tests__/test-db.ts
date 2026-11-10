import Database from 'better-sqlite3'
import { runMigrations } from '../migrations'

// An in-memory database for main-process tests. better-sqlite3 is an N-API
// addon, so the build postinstall makes for Electron loads in vitest's Node too.

export function openMemoryDb(): Database.Database {
  return new Database(':memory:')
}

/** A fresh database at the current schema. */
export function openMigratedDb(): Database.Database {
  const db = openMemoryDb()
  runMigrations(db)
  return db
}
