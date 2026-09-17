import type Database from 'better-sqlite3'
import { documentPlainText, serializeDocument } from '@shared/domain/document'
import { bodyToDocument } from '@shared/markdown/markdown-to-document'

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
  },
  {
    // Bodies become JSON documents. The words are pulled out into
    // `plain_text` for search, since the JSON's own vocabulary ("paragraph",
    // "children") must never match a query. Every note is queued so the
    // converted body reaches Firestore, and the media library gets its table.
    version: 2,
    up(db) {
      db.exec(`
        ALTER TABLE notes ADD COLUMN plain_text TEXT NOT NULL DEFAULT '';

        DROP TRIGGER IF EXISTS notes_ai;
        DROP TRIGGER IF EXISTS notes_ad;
        DROP TRIGGER IF EXISTS notes_au;
        DROP TABLE IF EXISTS notes_fts;
      `)

      const rows = db.prepare('SELECT id, body FROM notes').all() as { id: string; body: string }[]
      const convert = db.prepare('UPDATE notes SET body = ?, plain_text = ? WHERE id = ?')
      const queued = db.prepare(
        `SELECT id FROM sync_queue WHERE entity_type = 'note' AND entity_id = ? AND status = 'pending'`
      )
      const enqueue = db.prepare(
        `INSERT INTO sync_queue (entity_type, entity_id, action, created_at)
         VALUES ('note', ?, 'upsert', ?)`
      )
      const now = Date.now()
      for (const row of rows) {
        const doc = bodyToDocument(row.body)
        convert.run(serializeDocument(doc), documentPlainText(doc), row.id)
        if (!queued.get(row.id)) enqueue.run(row.id, now)
      }

      db.exec(`
        -- The old image pipeline's rows: nothing consumes them any more.
        DELETE FROM sync_queue WHERE entity_type = 'image';

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

        INSERT INTO notes_fts(notes_fts) VALUES ('rebuild');

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
      `)
    }
  }
]

/** Bring the schema up to date — or, for a test seeding an old shape, to `toVersion`. */
export function runMigrations(db: Database.Database, { toVersion = Infinity } = {}): void {
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
    if (migration.version > currentVersion && migration.version <= toVersion) {
      db.transaction(() => {
        migration.up(db)
        db.prepare('INSERT INTO schema_version (version) VALUES (?)').run(migration.version)
      })()
    }
  }
}
