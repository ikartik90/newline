import { vi } from 'vitest'
import { ApiError } from '../api'
import type { MediaMetadata, MediaObject } from '../media-api'

// ---------------------------------------------------------------------------
// A stand-in for `media-api.ts`: the Worker's store held in a Map, and the
// five calls media.ts makes acted out against it. A test installs it over the
// real module's constants with
//
//   vi.mock('../media-api', async (importOriginal) => ({
//     ...(await importOriginal()),
//     ...(await import('./fake-media-api'))
//   }))
//
// and then reads or seeds `store` directly.
// ---------------------------------------------------------------------------

export interface StoredObject {
  body: Uint8Array
  contentType: string
  /** Seeded without a `filename` on purpose in places: media.ts must name such an object itself. */
  metadata: MediaMetadata
}

/** Where the Worker would serve a user's objects from. */
export const PUBLIC_BASE = 'https://api.example.com/m/u/user-1'

export const store = new Map<string, StoredObject>()

let failure: Error | null = null
let available = false

/** Make every call reject until reset — the machine is offline. */
export function failWith(error: Error | null): void {
  failure = error
}

/** Whether the app has a base URL and a session; what `isMediaApiAvailable` answers. */
export function setAvailable(value: boolean): void {
  available = value
}

export function resetFakeMediaApi(): void {
  store.clear()
  failure = null
  available = false
  putObject.mockClear()
  getObject.mockClear()
  patchObject.mockClear()
  listObjects.mockClear()
  deleteObject.mockClear()
}

export function isMediaApiAvailable(): boolean {
  return available
}

function objectFor(key: string, stored: StoredObject): MediaObject {
  return {
    key,
    url: `${PUBLIC_BASE}/${key}`,
    size: stored.body.byteLength,
    contentType: stored.contentType,
    metadata: { ...stored.metadata } as MediaObject['metadata']
  }
}

function offlineOr(): void {
  if (failure) throw failure
}

export const putObject = vi.fn(
  async (
    key: string,
    bytes: Uint8Array,
    contentType: string,
    metadata: MediaMetadata = {}
  ): Promise<MediaObject> => {
    offlineOr()
    const stored: StoredObject = {
      body: bytes,
      contentType,
      // The Worker names an object after its key when the PUT carries no name.
      metadata: { filename: key.split('/').pop() ?? key, ...metadata }
    }
    store.set(key, stored)
    return objectFor(key, stored)
  }
)

export const getObject = vi.fn(async (key: string): Promise<MediaObject | null> => {
  offlineOr()
  const stored = store.get(key)
  return stored ? objectFor(key, stored) : null
})

export const patchObject = vi.fn(
  async (key: string, metadata: MediaMetadata): Promise<MediaObject> => {
    offlineOr()
    const stored = store.get(key)
    if (!stored) throw new ApiError(404, 'not_found')
    stored.metadata = { ...stored.metadata, ...metadata }
    return objectFor(key, stored)
  }
)

export const listObjects = vi.fn(async (prefix = 'media/'): Promise<MediaObject[]> => {
  offlineOr()
  return [...store.entries()]
    .filter(([key]) => key.startsWith(prefix))
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, stored]) => objectFor(key, stored))
})

export const deleteObject = vi.fn(async (key: string): Promise<void> => {
  offlineOr()
  store.delete(key)
})
