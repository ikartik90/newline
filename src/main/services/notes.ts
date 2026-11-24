import { v4 as uuidv4 } from 'uuid'
import { mdxPlainText } from '@shared/mdx/plain-text'
import { getDb } from '../db/database'

export interface Note {
  id: string
  title: string
  /** The note's MDX, kept as it came. */
  body: string
  /** The words in it, read from the body on every write, for search. */
  plainText: string
  tags: string[]
  createdAt: number
  updatedAt: number
  lastSyncedAt: number | null
  isDeleted: boolean
}

export interface NoteRow {
  id: string
  title: string
  body: string
  plain_text: string
  tags: string
  created_at: number
  updated_at: number
  last_synced_at: number | null
  is_deleted: number
}

function rowToNote(row: NoteRow): Note {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    plainText: row.plain_text,
    tags: JSON.parse(row.tags),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSyncedAt: row.last_synced_at,
    isDeleted: row.is_deleted === 1
  }
}

export function createNote(title = '', body = ''): Note {
  const db = getDb()
  const now = Date.now()
  const id = uuidv4()
  const plainText = mdxPlainText(body)

  db.prepare(
    `INSERT INTO notes (id, title, body, plain_text, tags, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, '[]', ?, ?, 0)`
  ).run(id, title, body, plainText, now, now)

  enqueueSyncAction(id, 'upsert')

  return {
    id,
    title,
    body,
    plainText,
    tags: [],
    createdAt: now,
    updatedAt: now,
    lastSyncedAt: null,
    isDeleted: false
  }
}

export function updateNote(
  id: string,
  fields: { title?: string; body?: string; tags?: string[] }
): Note | null {
  const db = getDb()
  const now = Date.now()

  const sets: string[] = ['updated_at = ?']
  const values: unknown[] = [now]

  if (fields.title !== undefined) {
    sets.push('title = ?')
    values.push(fields.title)
  }
  if (fields.body !== undefined) {
    sets.push('body = ?', 'plain_text = ?')
    values.push(fields.body, mdxPlainText(fields.body))
  }
  if (fields.tags !== undefined) {
    sets.push('tags = ?')
    values.push(JSON.stringify(fields.tags))
  }

  values.push(id)

  db.prepare(`UPDATE notes SET ${sets.join(', ')} WHERE id = ? AND is_deleted = 0`).run(...values)

  enqueueSyncAction(id, 'upsert')

  return getNote(id)
}

export function deleteNote(id: string): void {
  const db = getDb()
  const now = Date.now()

  db.prepare('UPDATE notes SET is_deleted = 1, updated_at = ? WHERE id = ?').run(now, id)
  // The assistant's conversation was about this note and is kept nowhere else.
  db.prepare('DELETE FROM assistant_messages WHERE note_id = ?').run(id)

  enqueueSyncAction(id, 'delete')
}

export function getNote(id: string): Note | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND is_deleted = 0').get(id) as
    | NoteRow
    | undefined

  return row ? rowToNote(row) : null
}

/**
 * The note whether or not it has been deleted. Sync needs the tombstone: a
 * deletion is pushed as one, and a remote copy is compared against it.
 */
export function getNoteIncludingDeleted(id: string): Note | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow | undefined
  return row ? rowToNote(row) : null
}

export function listNotes(): Note[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM notes WHERE is_deleted = 0 ORDER BY updated_at DESC')
    .all() as NoteRow[]

  return rows.map(rowToNote)
}

/** Prefix-matches every term against the title, the tags and the plain text. */
export function searchNotes(query: string): Note[] {
  const db = getDb()

  if (!query.trim()) return listNotes()

  const ftsQuery = query
    .trim()
    .split(/\s+/)
    .map((term) => `"${term.replace(/"/g, '""')}"*`)
    .join(' ')

  const rows = db
    .prepare(
      `SELECT notes.* FROM notes_fts
       JOIN notes ON notes.rowid = notes_fts.rowid
       WHERE notes_fts MATCH ?
         AND notes.is_deleted = 0
       ORDER BY bm25(notes_fts, 10.0, 5.0, 1.0)
       LIMIT 100`
    )
    .all(ftsQuery) as NoteRow[]

  return rows.map(rowToNote)
}

/**
 * Take a note as the Worker holds it. `updatedAt` is the Worker's stamp and
 * becomes the local `updated_at`, so a later pull compares like with like.
 */
export function upsertFromRemote(
  id: string,
  fields: {
    title: string
    body: string
    tags: string[]
    createdAt: number
    updatedAt: number
    isDeleted: boolean
  }
): void {
  const db = getDb()
  const now = Date.now()
  const plainText = mdxPlainText(fields.body)
  const tags = JSON.stringify(fields.tags)
  const isDeleted = fields.isDeleted ? 1 : 0

  const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(id) as
    | { id: string }
    | undefined

  if (existing) {
    db.prepare(
      `UPDATE notes SET title = ?, body = ?, plain_text = ?, tags = ?, is_deleted = ?,
         updated_at = ?, last_synced_at = ?
       WHERE id = ?`
    ).run(fields.title, fields.body, plainText, tags, isDeleted, fields.updatedAt, now, id)
  } else {
    db.prepare(
      `INSERT INTO notes (id, title, body, plain_text, tags, created_at, updated_at, last_synced_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      fields.title,
      fields.body,
      plainText,
      tags,
      fields.createdAt,
      fields.updatedAt,
      now,
      isDeleted
    )
  }
}

/**
 * The note has reached the Worker: clear its queue row. With the stamp the
 * Worker answered, the note's `updated_at` moves up to it, so the next pull
 * sees the copy there as the same age rather than newer; an edit that landed
 * meanwhile is later still and keeps its own time.
 */
export function markSynced(id: string, updatedAt?: number): void {
  const db = getDb()
  const now = Date.now()
  if (updatedAt === undefined) {
    db.prepare('UPDATE notes SET last_synced_at = ? WHERE id = ?').run(now, id)
  } else {
    db.prepare(
      'UPDATE notes SET last_synced_at = ?, updated_at = MAX(updated_at, ?) WHERE id = ?'
    ).run(now, updatedAt, id)
  }

  db.prepare(
    "DELETE FROM sync_queue WHERE entity_type = 'note' AND entity_id = ? AND status = 'pending'"
  ).run(id)
}

/** Every note with a pending queue row, tombstones included: what the next push sends. */
export function getDirtyNotes(): Note[] {
  const db = getDb()
  const rows = db
    .prepare(
      `SELECT DISTINCT n.* FROM notes n
       INNER JOIN sync_queue sq ON sq.entity_id = n.id
       WHERE sq.entity_type = 'note' AND sq.status = 'pending'`
    )
    .all() as NoteRow[]

  return rows.map(rowToNote)
}

export function setAppMeta(key: string, value: string): void {
  const db = getDb()
  db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
}

export function getAppMeta(key: string): string | null {
  const db = getDb()
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

/** Mark a note dirty. One pending row per note: a second call updates it. */
export function enqueueSyncAction(entityId: string, action: string): void {
  const db = getDb()

  const existing = db
    .prepare(
      `SELECT id FROM sync_queue
       WHERE entity_type = 'note' AND entity_id = ? AND status = 'pending'`
    )
    .get(entityId) as { id: number } | undefined

  if (existing) {
    db.prepare('UPDATE sync_queue SET action = ?, created_at = ? WHERE id = ?').run(
      action,
      Date.now(),
      existing.id
    )
  } else {
    db.prepare(
      `INSERT INTO sync_queue (entity_type, entity_id, action, created_at)
       VALUES ('note', ?, ?, ?)`
    ).run(entityId, action, Date.now())
  }
}
