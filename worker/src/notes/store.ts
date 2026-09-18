import type { NotePush, NoteRecord, NotesPage } from '@shared/domain/sync'
import { encodeCursor, type NoteCursor } from './cursor'

/** A `notes` row as D1 returns it; `tags` is JSON text, `is_deleted` 0 or 1. */
interface NoteRow {
  id: string
  title: string
  body: string
  tags: string
  created_at: number
  updated_at: number
  is_deleted: number
}

const COLUMNS = 'id, title, body, tags, created_at, updated_at, is_deleted'

function toNoteRecord(row: NoteRow): NoteRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    tags: JSON.parse(row.tags) as string[],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isDeleted: row.is_deleted !== 0
  }
}

/** Creates or replaces the user's note whole, stamped `updatedAt`. */
export async function putNote(
  db: D1Database,
  userId: string,
  id: string,
  push: NotePush,
  updatedAt: number
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO notes (user_id, ${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, id) DO UPDATE SET
         title = excluded.title,
         body = excluded.body,
         tags = excluded.tags,
         created_at = excluded.created_at,
         updated_at = excluded.updated_at,
         is_deleted = excluded.is_deleted`
    )
    .bind(
      userId,
      id,
      push.title,
      push.body,
      JSON.stringify(push.tags),
      push.createdAt,
      updatedAt,
      push.isDeleted ? 1 : 0
    )
    .run()
}

/**
 * The user's notes changed after `cursor` (from the beginning when null),
 * tombstones included, ordered by `updated_at` then `id`, at most `limit`.
 * One row past the page is fetched to learn whether more exist now.
 */
export async function listNotesAfter(
  db: D1Database,
  userId: string,
  cursor: NoteCursor | null,
  limit: number
): Promise<NotesPage> {
  const keyset = cursor ? 'AND (updated_at > ? OR (updated_at = ? AND id > ?))' : ''
  const position = cursor ? [cursor.updatedAt, cursor.updatedAt, cursor.id] : []
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM notes
       WHERE user_id = ? ${keyset}
       ORDER BY updated_at, id
       LIMIT ?`
    )
    .bind(userId, ...position, limit + 1)
    .all<NoteRow>()

  const hasMore = results.length > limit
  const notes = (hasMore ? results.slice(0, limit) : results).map(toNoteRecord)
  const last = notes.at(-1)
  const after = last ? { updatedAt: last.updatedAt, id: last.id } : cursor
  return { notes, cursor: after ? encodeCursor(after) : null, hasMore }
}
