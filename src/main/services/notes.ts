import { v4 as uuidv4 } from 'uuid'
import { documentPlainText, serializeDocument } from '@shared/domain/document'
import { bodyToDocument } from '@shared/markdown/markdown-to-document'
import { getDb } from '../db/database'

export interface Note {
  id: string
  title: string
  body: string
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

/**
 * A body as it is stored: the document's JSON and the words in it. The
 * renderer sends JSON; a legacy markdown body (an old remote, an old caller)
 * is converted on the way in, so nothing below this line meets markdown.
 */
function storedBody(body: string): { body: string; plainText: string } {
  const doc = bodyToDocument(body)
  return { body: serializeDocument(doc), plainText: documentPlainText(doc) }
}

export function createNote(title = '', body = ''): Note {
  const db = getDb()
  const now = Date.now()
  const id = uuidv4()
  const stored = storedBody(body)

  db.prepare(
    `INSERT INTO notes (id, title, body, plain_text, tags, created_at, updated_at, is_deleted)
     VALUES (?, ?, ?, ?, '[]', ?, ?, 0)`
  ).run(id, title, stored.body, stored.plainText, now, now)

  enqueueSyncAction(id, 'upsert')

  return {
    id,
    title,
    body: stored.body,
    plainText: stored.plainText,
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
    const stored = storedBody(fields.body)
    sets.push('body = ?', 'plain_text = ?')
    values.push(stored.body, stored.plainText)
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

  enqueueSyncAction(id, 'delete')
}

export function getNote(id: string): Note | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM notes WHERE id = ? AND is_deleted = 0').get(id) as
    | NoteRow
    | undefined

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

export function upsertFromRemote(
  id: string,
  fields: { title: string; body: string; tags: string[]; createdAt: number; isDeleted: boolean }
): void {
  const db = getDb()
  const now = Date.now()
  const stored = storedBody(fields.body)

  const existing = db.prepare('SELECT id FROM notes WHERE id = ?').get(id) as
    | { id: string }
    | undefined

  if (existing) {
    db.prepare(
      `UPDATE notes SET title = ?, body = ?, plain_text = ?, tags = ?, is_deleted = ?,
         updated_at = ?, last_synced_at = ?
       WHERE id = ?`
    ).run(
      fields.title,
      stored.body,
      stored.plainText,
      JSON.stringify(fields.tags),
      fields.isDeleted ? 1 : 0,
      now,
      now,
      id
    )
  } else {
    db.prepare(
      `INSERT INTO notes (id, title, body, plain_text, tags, created_at, updated_at, last_synced_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      fields.title,
      stored.body,
      stored.plainText,
      JSON.stringify(fields.tags),
      fields.createdAt,
      now,
      now,
      fields.isDeleted ? 1 : 0
    )
  }
}

export function markSynced(id: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare('UPDATE notes SET last_synced_at = ? WHERE id = ?').run(now, id)

  db.prepare(
    "DELETE FROM sync_queue WHERE entity_type = 'note' AND entity_id = ? AND status = 'pending'"
  ).run(id)
}

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
