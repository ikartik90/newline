import { app } from 'electron'
import { randomUUID } from 'crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  CreateMediaUploadInputSchema,
  MediaAssetSchema,
  filenameFromMediaKey,
  sanitizeMediaDisplayName,
  sanitizeMediaFilename,
  type MediaAsset
} from '@shared/domain/media'
import { getDb } from '../db/database'
import { enqueueSyncAction } from './notes'
import {
  MEDIA_PREFIX,
  POSTER_PREFIX,
  deleteObject,
  headObject,
  isR2Configured,
  listMediaKeys,
  posterKeyFor,
  publicUrlForKey,
  putObject,
  updateObjectMetadata
} from './r2'

// ---------------------------------------------------------------------------
// The media library. Every file lands in `userData/media/` and a row in
// `media_assets` first; the bucket is a copy that may arrive later. A row's
// `url` is what a note stores for it — `local://<file>` until the copy lands,
// the public URL after — and `flushPending` rewrites the notes when it changes.
// ---------------------------------------------------------------------------

export interface MediaUploadInput {
  filename: string
  contentType: string
  bytes: Uint8Array
  width?: number
  height?: number
}

interface MediaRow {
  key: string
  filename: string
  content_type: string
  size: number
  local_path: string | null
  url: string
  width: number | null
  height: number | null
  alt: string | null
  poster: string | null
  created_at: number
  uploaded_at: number | null
}

const LOCAL_SCHEME = 'local://'

/** What a captured still is stored as. */
const POSTER_CONTENT_TYPE = 'image/jpeg'

export function mediaDir(): string {
  const dir = join(app.getPath('userData'), 'media')
  mkdirSync(dir, { recursive: true })
  return dir
}

/** Where the pre-library image paste kept its files; still served, never written. */
function legacyImagesDir(): string {
  return join(app.getPath('userData'), 'images')
}

/**
 * The file a `local://<file>` URL names, or null. One path segment and no
 * dot-names, so a request can only ever reach the two directories we serve.
 */
export function getMediaPath(filename: string): string | null {
  if (!/^[^/\\]+$/.test(filename) || filename === '.' || filename === '..') return null
  for (const dir of [mediaDir(), legacyImagesDir()]) {
    const path = join(dir, filename)
    if (existsSync(path)) return path
  }
  return null
}

function localUrl(file: string): string {
  return `${LOCAL_SCHEME}${file}`
}

function localFileOf(url: string): string | null {
  return url.startsWith(LOCAL_SCHEME) ? url.slice(LOCAL_SCHEME.length) : null
}

/** The still's file on this machine, named after the clip's key like the object is. */
function posterFileFor(key: string): string | null {
  const posterKey = posterKeyFor(key)
  return posterKey ? posterKey.slice(POSTER_PREFIX.length) : null
}

function assertLibraryKey(key: string): void {
  if (!key.startsWith(MEDIA_PREFIX)) throw new Error('Invalid media key')
}

function rowFor(key: string): MediaRow | null {
  const row = getDb().prepare('SELECT * FROM media_assets WHERE key = ?').get(key) as
    | MediaRow
    | undefined
  return row ?? null
}

function rowToAsset(row: MediaRow): MediaAsset {
  return MediaAssetSchema.parse({
    key: row.key,
    url: row.url,
    filename: row.filename,
    contentType: row.content_type,
    size: row.size,
    alt: row.alt || undefined,
    width: row.width ?? undefined,
    height: row.height ?? undefined,
    poster: row.poster || undefined
  })
}

function assetFor(key: string): MediaAsset {
  const row = rowFor(key)
  if (!row) throw new Error('Media asset not found')
  return rowToAsset(row)
}

/** One metadata string as the positive integer it claims to be, or nothing. */
function numericMetadata(value: string | undefined): number | undefined {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

/** An object only the bucket knows, read the way kartik.to reads every one. */
async function keyToMediaAsset(key: string): Promise<MediaAsset | null> {
  const url = publicUrlForKey(key)
  if (!url) return null
  const head = await headObject(key)
  return MediaAssetSchema.parse({
    key,
    url,
    filename: head.filename || filenameFromMediaKey(key, MEDIA_PREFIX),
    contentType: head.contentType,
    size: head.size,
    alt: head.alt || undefined,
    width: numericMetadata(head.width),
    height: numericMetadata(head.height),
    poster: head.poster || undefined
  })
}

async function remoteAsset(key: string): Promise<MediaAsset> {
  const asset = await keyToMediaAsset(key)
  if (!asset) throw new Error('Media asset not found')
  return asset
}

/** What the object is stamped with: everything the row knows that is not local-only. */
function metadataFor(row: MediaRow): Record<string, string> {
  return {
    filename: row.filename,
    ...(row.width && row.height ? { width: String(row.width), height: String(row.height) } : {}),
    ...(row.alt ? { alt: row.alt } : {}),
    ...(row.poster && !localFileOf(row.poster) ? { poster: row.poster } : {})
  }
}

/**
 * Point every note at an asset's new address, and queue those notes so the
 * change reaches Firestore. `instr` rather than LIKE: a URL is a literal.
 */
function rewriteNoteSources(from: string, to: string): void {
  const db = getDb()
  const ids = db.prepare('SELECT id FROM notes WHERE instr(body, ?) > 0').all(from) as {
    id: string
  }[]
  if (!ids.length) return
  db.prepare(
    'UPDATE notes SET body = replace(body, ?, ?), updated_at = ? WHERE instr(body, ?) > 0'
  ).run(from, to, Date.now(), from)
  for (const { id } of ids) enqueueSyncAction(id, 'upsert')
}

/** Copy a row's file to the bucket; true once it is addressable there. */
async function uploadRow(row: MediaRow): Promise<boolean> {
  if (!row.local_path || !existsSync(row.local_path)) return false
  try {
    await putObject(row.key, readFileSync(row.local_path), row.content_type)
    await updateObjectMetadata(row.key, metadataFor(row))
  } catch (error) {
    console.warn(`[media] upload failed for ${row.key}:`, error)
    return false
  }
  const url = publicUrlForKey(row.key)
  if (!url) return false
  getDb()
    .prepare('UPDATE media_assets SET url = ?, uploaded_at = ? WHERE key = ?')
    .run(url, Date.now(), row.key)
  rewriteNoteSources(row.url, url)
  return true
}

/** Copy a still to the bucket and stamp its clip with the address; null if it could not. */
async function pushPoster(key: string, bytes: Uint8Array): Promise<string | null> {
  const posterKey = posterKeyFor(key)
  const url = posterKey && publicUrlForKey(posterKey)
  if (!posterKey || !url) return null
  try {
    await putObject(posterKey, bytes, POSTER_CONTENT_TYPE)
    await updateObjectMetadata(key, { poster: url })
  } catch (error) {
    console.warn(`[media] poster upload failed for ${key}:`, error)
    return null
  }
  return url
}

/** A still taken while its clip was still local: send it after the clip. */
async function uploadPendingPoster(row: MediaRow): Promise<void> {
  const file = row.poster && localFileOf(row.poster)
  if (!file) return
  const path = join(mediaDir(), file)
  if (!existsSync(path)) return
  const url = await pushPoster(row.key, readFileSync(path))
  if (!url) return
  getDb().prepare('UPDATE media_assets SET poster = ? WHERE key = ?').run(url, row.key)
  rewriteNoteSources(row.poster!, url)
}

/**
 * Store a file the author picked or pasted. Safe on disk before this
 * resolves; in the bucket too when R2 is configured and reachable, in which
 * case the asset already carries its public URL.
 */
export async function saveMedia(input: MediaUploadInput): Promise<MediaAsset> {
  const { filename, contentType } = CreateMediaUploadInputSchema.parse({
    filename: input.filename,
    contentType: input.contentType,
    size: input.bytes.byteLength
  })
  const safe = sanitizeMediaFilename(filename)
  const file = `${randomUUID()}-${safe}`
  const key = `${MEDIA_PREFIX}${file}`
  const localPath = join(mediaDir(), file)
  writeFileSync(localPath, input.bytes)

  // Both or neither: a ratio is not a thing half a measurement can express.
  const shaped = input.width && input.height
  getDb()
    .prepare(
      `INSERT INTO media_assets
         (key, filename, content_type, size, local_path, url, width, height, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      key,
      safe,
      contentType,
      input.bytes.byteLength,
      localPath,
      localUrl(file),
      shaped ? input.width : null,
      shaped ? input.height : null,
      Date.now()
    )

  if (isR2Configured()) await uploadRow(rowFor(key)!)
  return assetFor(key)
}

/**
 * Send everything still local-only, stills included, and point the notes at
 * the copies. Resolves to how many files landed.
 */
export async function flushPending(): Promise<number> {
  if (!isR2Configured()) return 0
  const db = getDb()
  const pending = db
    .prepare('SELECT * FROM media_assets WHERE uploaded_at IS NULL ORDER BY created_at')
    .all() as MediaRow[]
  let landed = 0
  for (const row of pending) {
    if (await uploadRow(row)) landed += 1
  }
  const stills = db
    .prepare(`SELECT * FROM media_assets WHERE uploaded_at IS NOT NULL AND poster LIKE 'local://%'`)
    .all() as MediaRow[]
  for (const row of stills) await uploadPendingPoster(row)
  return landed
}

/**
 * The library: this machine's rows newest first, then whatever else the
 * bucket holds — objects uploaded from another machine, or before there was
 * a table. Offline, the rows alone.
 */
export async function listMedia(): Promise<MediaAsset[]> {
  const rows = getDb()
    .prepare('SELECT * FROM media_assets ORDER BY created_at DESC, rowid DESC')
    .all() as MediaRow[]
  const assets = rows.map(rowToAsset)
  if (!isR2Configured()) return assets
  try {
    const known = new Set(rows.map((row) => row.key))
    const keys = (await listMediaKeys()).filter((key) => !known.has(key))
    const remote = await Promise.all(keys.map(keyToMediaAsset))
    return [...assets, ...remote.filter((asset): asset is MediaAsset => asset !== null)]
  } catch (error) {
    console.warn('[media] could not list the bucket:', error)
    return assets
  }
}

/**
 * Change what the row says, and what the object says where there is one.
 * The row is the source of truth for anything this machine holds, so a
 * bucket that cannot be reached is a warning, not a failure.
 */
async function updateRowAndObject(
  key: string,
  column: 'alt' | 'filename',
  value: string
): Promise<MediaAsset> {
  assertLibraryKey(key)
  const row = rowFor(key)
  if (!row) {
    await updateObjectMetadata(key, { [column]: value })
    return remoteAsset(key)
  }
  getDb().prepare(`UPDATE media_assets SET ${column} = ? WHERE key = ?`).run(value, key)
  if (row.uploaded_at !== null && isR2Configured()) {
    try {
      await updateObjectMetadata(key, { [column]: value })
    } catch (error) {
      console.warn(`[media] could not stamp ${column} on ${key}:`, error)
    }
  }
  return assetFor(key)
}

export function updateAlt(key: string, alt: string): Promise<MediaAsset> {
  return updateRowAndObject(key, 'alt', alt)
}

/** Rename for display only: the key, and every URL in every note, stays. */
export function rename(key: string, filename: string): Promise<MediaAsset> {
  const name = sanitizeMediaDisplayName(filename) || filenameFromMediaKey(key, MEDIA_PREFIX)
  return updateRowAndObject(key, 'filename', name)
}

/**
 * Remove an asset everywhere. The bucket goes first: if it refuses, nothing
 * here has changed and the caller can try again, rather than a local delete
 * leaving an orphan that the next listing would bring back.
 */
export async function deleteMedia(key: string): Promise<void> {
  assertLibraryKey(key)
  const row = rowFor(key)
  if ((!row || row.uploaded_at !== null) && isR2Configured()) {
    await deleteObject(key)
    // Unconditionally: a delete of a missing key is a no-op cheaper than
    // the HEAD it would take to ask.
    const posterKey = posterKeyFor(key)
    if (posterKey) await deleteObject(posterKey)
  }
  if (!row) return
  if (row.local_path) rmSync(row.local_path, { force: true })
  const posterFile = posterFileFor(key)
  if (posterFile) rmSync(join(mediaDir(), posterFile), { force: true })
  getDb().prepare('DELETE FROM media_assets WHERE key = ?').run(key)
}

/**
 * Store a clip's still beside it. Resolves to the still's URL — public once
 * the clip is in the bucket, `local://` until then — or null for a key that
 * is not a library object's.
 */
export async function uploadPoster(key: string, bytes: Uint8Array): Promise<string | null> {
  const file = posterFileFor(key)
  if (!file) return null
  writeFileSync(join(mediaDir(), file), bytes)

  const row = rowFor(key)
  let url = localUrl(file)
  if (isR2Configured() && (!row || row.uploaded_at !== null)) {
    url = (await pushPoster(key, bytes)) ?? url
  }
  if (row) getDb().prepare('UPDATE media_assets SET poster = ? WHERE key = ?').run(url, key)
  return url
}
