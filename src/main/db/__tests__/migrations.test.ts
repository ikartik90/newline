import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { runMigrations } from '../migrations'
import { openMemoryDb } from './test-db'

const columnsOf = (db: Database.Database, table: string): string[] =>
  (db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)

const versions = (db: Database.Database): number[] =>
  (
    db.prepare('SELECT version FROM schema_version ORDER BY version').all() as { version: number }[]
  ).map((row) => row.version)

const search = (db: Database.Database, match: string): string[] =>
  (
    db
      .prepare(
        `SELECT notes.id FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid
         WHERE notes_fts MATCH ? ORDER BY notes.id`
      )
      .all(match) as { id: string }[]
  ).map((row) => row.id)

/** A note of a few words; `more` names the columns of an older shape. */
const addNote = (
  db: Database.Database,
  id: string,
  words: string,
  more: Record<string, string | number> = {}
): void => {
  const row = {
    id,
    title: `Title ${id}`,
    body: words,
    plain_text: words,
    tags: '["work"]',
    created_at: 1,
    updated_at: 1,
    ...more
  }
  const names = Object.keys(row)
  db.prepare(
    `INSERT INTO notes (${names.join(', ')}) VALUES (${names.map(() => '?').join(', ')})`
  ).run(...Object.values(row))
}

describe('runMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openMemoryDb()
  })

  describe('a new database', () => {
    beforeEach(() => {
      runMigrations(db)
    })

    it('is made at the current version, once', () => {
      runMigrations(db)
      expect(versions(db)).toEqual([7])
    })

    it('holds a note as its MDX and the words in it', () => {
      expect(columnsOf(db, 'notes')).toEqual([
        'id',
        'title',
        'body',
        'plain_text',
        'tags',
        'created_at',
        'updated_at',
        'last_synced_at',
        'is_deleted'
      ])
    })

    it('indexes title, tags and plain text for search, not the body', () => {
      db.exec(
        `INSERT INTO notes (id, title, body, plain_text, tags, created_at, updated_at)
         VALUES ('a', 'First', '# Hello **bold**', 'Hello bold', '["work"]', 1, 1)`
      )
      expect(search(db, '"bold"')).toEqual(['a'])
      expect(search(db, 'plain_text:"Hello"')).toEqual(['a'])
      expect(search(db, 'title:"First"')).toEqual(['a'])
      expect(search(db, 'tags:"work"')).toEqual(['a'])
      expect(() => search(db, 'body:"x"')).toThrow()
    })

    it('keeps the index in step with later writes', () => {
      addNote(db, 'a', 'first words')
      db.prepare("UPDATE notes SET plain_text = 'fresh words' WHERE id = 'a'").run()
      expect(search(db, '"fresh"')).toEqual(['a'])
      expect(search(db, '"first"')).toEqual([])
      db.prepare("DELETE FROM notes WHERE id = 'a'").run()
      expect(search(db, '"fresh"')).toEqual([])
    })

    it('queues what waits to sync, one row an entry', () => {
      db.exec(
        `INSERT INTO sync_queue (entity_type, entity_id, action, created_at) VALUES ('note', 'a', 'upsert', 1)`
      )
      expect(db.prepare('SELECT status, retries, payload FROM sync_queue').get()).toEqual({
        status: 'pending',
        retries: 0,
        payload: null
      })
    })

    it('keeps the assistant conversation per note, in order, from the two who speak', () => {
      const insert = db.prepare(
        `INSERT INTO assistant_messages (id, note_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`
      )
      insert.run('m2', 'a', 'assistant', 'Hello', 2)
      insert.run('m1', 'a', 'user', 'Hi', 1)
      insert.run('m3', 'b', 'user', 'Other', 1)
      const rows = db
        .prepare(`SELECT id FROM assistant_messages WHERE note_id = 'a' ORDER BY created_at`)
        .all()
      expect(rows).toEqual([{ id: 'm1' }, { id: 'm2' }])
      expect(() => insert.run('m4', 'a', 'system', 'x', 3)).toThrow()
    })

    it('has the media library and the app’s own keys', () => {
      expect(columnsOf(db, 'media_assets')).toEqual([
        'key',
        'filename',
        'content_type',
        'size',
        'local_path',
        'url',
        'width',
        'height',
        'alt',
        'poster',
        'created_at',
        'uploaded_at'
      ])
      expect(columnsOf(db, 'app_meta')).toEqual(['key', 'value'])
    })
  })

  // The one database there is was made by the build before: its notes said how
  // their body was written and kept a copy from before MDX, and its deleted
  // notes were still JSON.
  describe('the database of the build before', () => {
    beforeEach(() => {
      runMigrations(db)
      db.exec(`
        ALTER TABLE notes ADD COLUMN body_backup TEXT;
        ALTER TABLE notes ADD COLUMN format TEXT NOT NULL DEFAULT 'json';
        DELETE FROM schema_version;
        INSERT INTO schema_version (version) VALUES (6);
      `)
      addNote(db, 'live', 'kept words', { format: 'mdx', body_backup: '{"type":"doc"}' })
      addNote(db, 'gone', 'deleted words', { is_deleted: 1 })
      addNote(db, 'going', 'unsent words', { is_deleted: 1 })
      db.exec(
        `INSERT INTO sync_queue (entity_type, entity_id, action, created_at) VALUES ('note', 'going', 'delete', 1)`
      )
      runMigrations(db)
    })

    it('is brought to the current version, once', () => {
      runMigrations(db)
      expect(versions(db)).toEqual([6, 7])
    })

    it('loses its deleted notes for good, and their words from search', () => {
      expect(db.prepare("SELECT id FROM notes WHERE id = 'gone'").get()).toBeUndefined()
      expect(search(db, '"deleted"')).toEqual([])
    })

    it('keeps a deletion still to be sent, so it reaches the Worker', () => {
      expect(db.prepare("SELECT is_deleted FROM notes WHERE id = 'going'").get()).toEqual({
        is_deleted: 1
      })
      expect(db.prepare('SELECT entity_id FROM sync_queue').all()).toEqual([{ entity_id: 'going' }])
    })

    it('leaves every other note as it was, less how its body is written and the copy from before', () => {
      expect(
        db.prepare("SELECT title, body, plain_text, updated_at FROM notes WHERE id = 'live'").get()
      ).toEqual({
        title: 'Title live',
        body: 'kept words',
        plain_text: 'kept words',
        updated_at: 1
      })
      expect(search(db, '"kept"')).toEqual(['live'])
      expect(columnsOf(db, 'notes')).toEqual([
        'id',
        'title',
        'body',
        'plain_text',
        'tags',
        'created_at',
        'updated_at',
        'last_synced_at',
        'is_deleted'
      ])
    })
  })
})
