import { publicUrlFor } from './keys'
import type { MediaMetadata, MediaMetadataPatch } from './metadata'

/** A `media_objects` row as D1 returns it. */
export interface MediaObjectRow {
  user_id: string
  key: string
  size: number
  content_type: string
  filename: string
  alt: string | null
  width: number | null
  height: number | null
  poster: string | null
  created_at: number
}

/** What the API returns for an object. */
export interface MediaObject {
  key: string
  url: string
  size: number
  contentType: string
  metadata: MediaMetadata
}

export interface UpsertObjectInput {
  userId: string
  key: string
  size: number
  contentType: string
  metadata: MediaMetadata
  now: number
}

const COLUMNS = 'user_id, key, size, content_type, filename, alt, width, height, poster, created_at'

function toInteger(value: string | undefined): number | null {
  if (value === undefined) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isSafeInteger(parsed) ? parsed : null
}

/** The sum of a user's object sizes — what the quota is checked against. */
export async function usageBytes(db: D1Database, userId: string): Promise<number> {
  const row = await db
    .prepare('SELECT COALESCE(SUM(size), 0) AS bytes FROM media_objects WHERE user_id = ?')
    .bind(userId)
    .first<{ bytes: number }>()
  return row?.bytes ?? 0
}

export async function getObject(
  db: D1Database,
  userId: string,
  key: string
): Promise<MediaObjectRow | null> {
  return db
    .prepare(`SELECT ${COLUMNS} FROM media_objects WHERE user_id = ? AND key = ?`)
    .bind(userId, key)
    .first<MediaObjectRow>()
}

/** Records an object; a second PUT to the same key replaces size and metadata whole. */
export async function upsertObject(
  db: D1Database,
  input: UpsertObjectInput
): Promise<MediaObjectRow> {
  const { metadata } = input
  const row = await db
    .prepare(
      `INSERT INTO media_objects (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, key) DO UPDATE SET
         size = excluded.size,
         content_type = excluded.content_type,
         filename = excluded.filename,
         alt = excluded.alt,
         width = excluded.width,
         height = excluded.height,
         poster = excluded.poster,
         created_at = excluded.created_at
       RETURNING ${COLUMNS}`
    )
    .bind(
      input.userId,
      input.key,
      input.size,
      input.contentType,
      metadata.filename,
      metadata.alt ?? null,
      toInteger(metadata.width),
      toInteger(metadata.height),
      metadata.poster ?? null,
      input.now
    )
    .first<MediaObjectRow>()
  if (!row) throw new Error('media_objects upsert returned no row')
  return row
}

/** Merges the provided fields only; null when the user has no such object. */
export async function patchObject(
  db: D1Database,
  userId: string,
  key: string,
  patch: MediaMetadataPatch
): Promise<MediaObjectRow | null> {
  return db
    .prepare(
      `UPDATE media_objects SET
         filename = COALESCE(?, filename),
         alt = COALESCE(?, alt),
         width = COALESCE(?, width),
         height = COALESCE(?, height),
         poster = COALESCE(?, poster)
       WHERE user_id = ? AND key = ?
       RETURNING ${COLUMNS}`
    )
    .bind(
      patch.filename ?? null,
      patch.alt ?? null,
      toInteger(patch.width),
      toInteger(patch.height),
      patch.poster ?? null,
      userId,
      key
    )
    .first<MediaObjectRow>()
}

/** A user's objects under `prefix`, newest first. */
export async function listObjects(
  db: D1Database,
  userId: string,
  prefix: string
): Promise<MediaObjectRow[]> {
  const { results } = await db
    .prepare(
      `SELECT ${COLUMNS} FROM media_objects
       WHERE user_id = ? AND substr(key, 1, ?) = ?
       ORDER BY created_at DESC, key DESC`
    )
    .bind(userId, prefix.length, prefix)
    .all<MediaObjectRow>()
  return results
}

/** True when a row was there to delete. */
export async function deleteObject(db: D1Database, userId: string, key: string): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM media_objects WHERE user_id = ? AND key = ?')
    .bind(userId, key)
    .run()
  return result.meta.changes > 0
}

export function toMediaObject(row: MediaObjectRow, publicBaseUrl: string): MediaObject {
  const metadata: MediaMetadata = { filename: row.filename }
  if (row.alt !== null) metadata.alt = row.alt
  if (row.width !== null) metadata.width = String(row.width)
  if (row.height !== null) metadata.height = String(row.height)
  if (row.poster !== null) metadata.poster = row.poster
  return {
    key: row.key,
    url: publicUrlFor(publicBaseUrl, row.user_id, row.key),
    size: row.size,
    contentType: row.content_type,
    metadata
  }
}
