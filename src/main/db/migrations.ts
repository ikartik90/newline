import type Database from 'better-sqlite3'

/** The version a new database is made at. */
const SCHEMA_VERSION = 7

/**
 * What a new database holds. A note's `body` is its MDX; `plain_text` is the
 * words in it, which is what search indexes, so the MDX's own signs never
 * match a query.
 */
function createSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE notes (
      id             TEXT PRIMARY KEY,
      title          TEXT NOT NULL DEFAULT '',
      body           TEXT NOT NULL DEFAULT '',
      plain_text     TEXT NOT NULL DEFAULT '',
      tags           TEXT NOT NULL DEFAULT '[]',
      created_at     INTEGER NOT NULL,
      updated_at     INTEGER NOT NULL,
      last_synced_at INTEGER,
      is_deleted     INTEGER NOT NULL DEFAULT 0
    );

    CREATE VIRTUAL TABLE notes_fts USING fts5(
      title, tags, plain_text,
      content='notes',
      content_rowid='rowid'
    );

    CREATE TRIGGER notes_ai AFTER INSERT ON notes BEGIN
      INSERT INTO notes_fts(rowid, title, tags, plain_text)
      VALUES (new.rowid, new.title, new.tags, new.plain_text);
    END;

    CREATE TRIGGER notes_ad AFTER DELETE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, tags, plain_text)
      VALUES ('delete', old.rowid, old.title, old.tags, old.plain_text);
    END;

    CREATE TRIGGER notes_au AFTER UPDATE ON notes BEGIN
      INSERT INTO notes_fts(notes_fts, rowid, title, tags, plain_text)
      VALUES ('delete', old.rowid, old.title, old.tags, old.plain_text);
      INSERT INTO notes_fts(rowid, title, tags, plain_text)
      VALUES (new.rowid, new.title, new.tags, new.plain_text);
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

    CREATE TABLE media_assets (
      key          TEXT PRIMARY KEY,
      filename     TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size         INTEGER NOT NULL,
      local_path   TEXT,
      url          TEXT,
      width        INTEGER,
      height       INTEGER,
      alt          TEXT,
      poster       TEXT,
      created_at   INTEGER NOT NULL,
      uploaded_at  INTEGER
    );

    -- The assistant rail's conversations, one per note, on this device only.
    CREATE TABLE assistant_messages (
      id         TEXT PRIMARY KEY,
      note_id    TEXT NOT NULL,
      role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content    TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX idx_assistant_messages_note ON assistant_messages(note_id, created_at);
  `)
}

interface Migration {
  version: number
  up: (db: Database.Database) => void
}

/** What brings a database an earlier build made up to date. */
const migrations: Migration[] = [
  {
    // Every note is MDX now. The deleted notes were the last still in JSON:
    // they go for good, but for one whose deletion the Worker has yet to hear,
    // and so does the copy each note kept from before MDX.
    version: 7,
    up(db) {
      db.exec(`
        DELETE FROM notes
        WHERE is_deleted = 1
          AND id NOT IN (
            SELECT entity_id FROM sync_queue WHERE entity_type = 'note' AND status = 'pending'
          );
        ALTER TABLE notes DROP COLUMN format;
        ALTER TABLE notes DROP COLUMN body_backup;
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

  const record = db.prepare('INSERT INTO schema_version (version) VALUES (?)')
  const currentVersion =
    (db.prepare('SELECT MAX(version) as v FROM schema_version').get() as { v: number | null })?.v ??
    0

  if (currentVersion === 0) {
    db.transaction(() => {
      createSchema(db)
      record.run(SCHEMA_VERSION)
    })()
    return
  }

  for (const migration of migrations) {
    if (migration.version > currentVersion) {
      db.transaction(() => {
        migration.up(db)
        record.run(migration.version)
      })()
    }
  }
}
