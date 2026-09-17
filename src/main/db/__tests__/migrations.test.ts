import type Database from 'better-sqlite3'
import { beforeEach, describe, expect, it } from 'vitest'
import { DocumentSchema, parseDocument } from '@shared/domain/document'
import { runMigrations } from '../migrations'
import { openMemoryDb } from './test-db'

interface NoteRow {
  id: string
  body: string
  plain_text: string
}

function seedV1(db: Database.Database): void {
  runMigrations(db, { toVersion: 1 })
  const insert = db.prepare(
    `INSERT INTO notes (id, title, body, tags, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, 1, 1, ?)`
  )
  insert.run('a', 'First', '# Hello\n\nSome **bold** text #work', '["work"]', 0)
  insert.run('b', '', '- [x] done\n- [ ] todo\n\n![pic](local://x.png)', '[]', 0)
  insert.run('c', 'Empty', '', '[]', 0)
  insert.run('d', 'Gone', 'deleted body', '[]', 1)
  // One note is already waiting to sync; the migration must not queue it twice.
  db.prepare(
    `INSERT INTO sync_queue (entity_type, entity_id, action, created_at) VALUES ('note', 'a', 'upsert', 1)`
  ).run()
  // The old image pipeline's queue rows have nothing left to consume them.
  db.prepare(
    `INSERT INTO sync_queue (entity_type, entity_id, action, created_at) VALUES ('image', 'x.png', 'upload_image', 1)`
  ).run()
}

describe('runMigrations', () => {
  let db: Database.Database

  beforeEach(() => {
    db = openMemoryDb()
  })

  it('stops at the requested version', () => {
    runMigrations(db, { toVersion: 1 })
    const columns = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[]
    expect(columns.map((c) => c.name)).not.toContain('plain_text')
    expect(db.prepare('SELECT MAX(version) AS v FROM schema_version').get()).toEqual({ v: 1 })
  })

  describe('v2', () => {
    beforeEach(() => {
      seedV1(db)
      runMigrations(db)
    })

    it('records the version once and is a no-op the second time', () => {
      runMigrations(db)
      const versions = db.prepare('SELECT version FROM schema_version ORDER BY version').all()
      expect(versions).toEqual([{ version: 1 }, { version: 2 }])
    })

    it('converts every markdown body to a document with its plain text', () => {
      const rows = db
        .prepare('SELECT id, body, plain_text FROM notes ORDER BY id')
        .all() as NoteRow[]
      for (const row of rows) {
        expect(() => DocumentSchema.parse(JSON.parse(row.body))).not.toThrow()
      }
      const [a, b, c, d] = rows
      expect(parseDocument(a.body).content[0]).toEqual({
        type: 'heading',
        level: 1,
        children: [{ type: 'text', text: 'Hello' }]
      })
      expect(a.plain_text).toBe('Hello\nSome bold text #work')
      expect(parseDocument(b.body).content).toEqual([
        { type: 'bullet_list_item', children: [{ type: 'text', text: 'done' }], marker: 'check' },
        { type: 'bullet_list_item', children: [{ type: 'text', text: 'todo' }] },
        { type: 'media', kind: 'image', src: 'local://x.png', alt: 'pic' }
      ])
      expect(b.plain_text).toBe('done\ntodo')
      expect(parseDocument(c.body)).toEqual({ type: 'doc', content: [] })
      expect(c.plain_text).toBe('')
      expect(d.plain_text).toBe('deleted body')
    })

    it('indexes title, tags and plain text for search, not the body', () => {
      const search = (match: string): string[] =>
        (
          db
            .prepare(
              `SELECT notes.id FROM notes_fts JOIN notes ON notes.rowid = notes_fts.rowid
               WHERE notes_fts MATCH ?`
            )
            .all(match) as { id: string }[]
        ).map((r) => r.id)
      expect(search('"bold"')).toEqual(['a'])
      expect(search('plain_text:"todo"')).toEqual(['b'])
      expect(search('title:"First"')).toEqual(['a'])
      expect(search('tags:"work"')).toEqual(['a'])
      // Nothing in the index knows the JSON body's own vocabulary.
      expect(search('"heading"')).toEqual([])
      expect(() => search('body:"x"')).toThrow()
    })

    it('keeps the index in step with later writes', () => {
      db.prepare("UPDATE notes SET plain_text = 'fresh words' WHERE id = 'c'").run()
      const hits = db
        .prepare(`SELECT rowid FROM notes_fts WHERE notes_fts MATCH '"fresh"'`)
        .all() as { rowid: number }[]
      expect(hits).toHaveLength(1)
      db.prepare("DELETE FROM notes WHERE id = 'c'").run()
      expect(
        db.prepare(`SELECT rowid FROM notes_fts WHERE notes_fts MATCH '"fresh"'`).all()
      ).toEqual([])
    })

    it('queues every converted note for sync, once, and drops the old image rows', () => {
      const rows = db
        .prepare(
          `SELECT entity_type, entity_id, action, status FROM sync_queue ORDER BY entity_type, entity_id`
        )
        .all()
      expect(rows).toEqual([
        { entity_type: 'note', entity_id: 'a', action: 'upsert', status: 'pending' },
        { entity_type: 'note', entity_id: 'b', action: 'upsert', status: 'pending' },
        { entity_type: 'note', entity_id: 'c', action: 'upsert', status: 'pending' },
        { entity_type: 'note', entity_id: 'd', action: 'upsert', status: 'pending' }
      ])
    })

    it('creates the media_assets table', () => {
      const columns = (
        db.prepare('PRAGMA table_info(media_assets)').all() as { name: string }[]
      ).map((c) => c.name)
      expect(columns).toEqual([
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
    })
  })
})
