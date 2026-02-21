import type Database from 'better-sqlite3'

interface Migration {
  version: number
  up: (db: Database.Database) => void
}

const migrations: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE notes (
          id            TEXT PRIMARY KEY,
          title         TEXT NOT NULL DEFAULT '',
          body          TEXT NOT NULL DEFAULT '',
          tags          TEXT NOT NULL DEFAULT '[]',
          created_at    INTEGER NOT NULL,
          updated_at    INTEGER NOT NULL,
          last_synced_at INTEGER,
          is_deleted    INTEGER NOT NULL DEFAULT 0
        );

        CREATE VIRTUAL TABLE notes_fts USING fts5(
          title, tags, body,
          content='notes',
          content_rowid='rowid'
        );

        -- Keep FTS index in sync with notes table
        CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
          INSERT INTO notes_fts(rowid, title, tags, body)
          VALUES (new.rowid, new.title, new.tags, new.body);
        END;

        CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, tags, body)
          VALUES ('delete', old.rowid, old.title, old.tags, old.body);
        END;

        CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
          INSERT INTO notes_fts(notes_fts, rowid, title, tags, body)
          VALUES ('delete', old.rowid, old.title, old.tags, old.body);
          INSERT INTO notes_fts(rowid, title, tags, body)
          VALUES (new.rowid, new.title, new.tags, new.body);
        END;

        CREATE TABLE sync_queue (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL,
          entity_id   TEXT NOT NULL,
          action      TEXT NOT NULL,
          payload     TEXT,
          retries     INTEGER NOT NULL DEFAULT 0,
          created_at  INTEGER NOT NULL,
          status      TEXT NOT NULL DEFAULT 'pending'
        );

        CREATE INDEX idx_sync_queue_status ON sync_queue(status);

        CREATE TABLE app_meta (
          key   TEXT PRIMARY KEY,
          value TEXT
        );
      `)
    }
  }
]

export function runMigrations(db: Database.Database): void {
  db.pragma('journal_mode = WAL')

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )
  `)

  const currentVersion =
    (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null })?.v ??
    0

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
      })()
    }
  }
}
