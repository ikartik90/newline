import { ApiError, apiFetch, apiJson, isApiConfigured } from './api'
import { getSessionToken } from './session'

// ---------------------------------------------------------------------------
// The Worker's media store (`worker/README.md`, Media), as kartik.to's
// `lib/storage/r2.ts` was for the bucket. The Worker holds the bytes and the
// metadata together, so an object is written in one PUT, patched in place,
// and listed with everything the library needs to show it.
// ---------------------------------------------------------------------------

export const MEDIA_PREFIX = 'media/'

/** The stills taken from clips, kept out of the library's listing. */
export const POSTER_PREFIX = 'posters/'

/** What the Worker knows about an object. Values are strings, as R2 metadata was. */
export interface MediaMetadata {
  /** The display name, editable without moving the object. */
  filename?: string
  alt?: string
  width?: string
  height?: string
  /** The still's URL, on a clip that has one. */
  poster?: string
}

export interface MediaObject {
  /** The app's own key; the Worker files it under the user. */
  key: string
  /** Public, opaque: what a note stores. */
  url: string
  size: number
  contentType: string
  metadata: MediaMetadata & { filename: string }
}

/**
 * Where a clip's still is filed: the clip's own key moved to the poster
 * corner and renamed to what it now is. Derived, never minted, so either can
 * be read from the other. `null` outside the library.
 */
export function posterKeyFor(mediaKey: string): string | null {
  if (!mediaKey.startsWith(MEDIA_PREFIX)) return null
  const name = mediaKey.slice(MEDIA_PREFIX.length)
  const dot = name.lastIndexOf('.')
  return `${POSTER_PREFIX}${dot === -1 ? name : name.slice(0, dot)}.jpg`
}

/** A base URL and a session: without both, an upload has nowhere to go. */
export function isMediaApiAvailable(): boolean {
  return isApiConfigured() && getSessionToken() !== null
}

/**
 * The route for one object. The key goes in as it is: `sanitizeMediaFilename`
 * limits a key to characters a URL path takes unencoded, and the Worker
 * reads the path back literally.
 */
function objectPath(key: string): string {
  return `/media/objects/${key}`
}

export async function putObject(
  key: string,
  bytes: Uint8Array,
  contentType: string,
  metadata?: MediaMetadata
): Promise<MediaObject> {
  const headers: Record<string, string> = { 'Content-Type': contentType }
  if (metadata) headers['X-Media-Metadata'] = JSON.stringify(metadata)
  return apiJson<MediaObject>(objectPath(key), { method: 'PUT', headers, body: bytes })
}

/** The object, or null for a key the store does not hold. */
export async function getObject(key: string): Promise<MediaObject | null> {
  try {
    return await apiJson<MediaObject>(objectPath(key))
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null
    throw error
  }
}

/** Merge a patch into an object's metadata; resolves to the object as it now is. */
export async function patchObject(key: string, metadata: MediaMetadata): Promise<MediaObject> {
  return apiJson<MediaObject>(objectPath(key), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metadata })
  })
}

/** Every object under a prefix, newest first as the Worker orders them. */
export async function listObjects(prefix = MEDIA_PREFIX): Promise<MediaObject[]> {
  const { objects } = await apiJson<{ objects: MediaObject[] }>(
    `/media/objects?prefix=${encodeURIComponent(prefix)}`
  )
  return objects
}

/** Remove an object; a missing key is not an error. */
export async function deleteObject(key: string): Promise<void> {
  await apiFetch(objectPath(key), { method: 'DELETE' })
}
