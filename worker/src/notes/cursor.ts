import { NoteIdSchema } from '@shared/domain/sync'

/** Where a page of `GET /notes` ends: the keyset position after its last note. */
export interface NoteCursor {
  updatedAt: number
  id: string
}

const BASE64URL = /^[A-Za-z0-9_-]*$/

function toBase64Url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(text: string): string | null {
  if (!BASE64URL.test(text)) return null
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  try {
    return atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  } catch {
    return null
  }
}

/** Opaque to the app: `base64url(updatedAt:id)`. */
export function encodeCursor(cursor: NoteCursor): string {
  return toBase64Url(`${cursor.updatedAt}:${cursor.id}`)
}

/** The position a cursor names, or null for anything the Worker would not have minted. */
export function decodeCursor(text: string): NoteCursor | null {
  const decoded = fromBase64Url(text)
  if (decoded === null) return null
  const colon = decoded.indexOf(':')
  if (colon < 0) return null

  const timestamp = decoded.slice(0, colon)
  const id = decoded.slice(colon + 1)
  if (!/^\d+$/.test(timestamp)) return null
  const updatedAt = Number(timestamp)
  if (!Number.isSafeInteger(updatedAt)) return null
  if (!NoteIdSchema.safeParse(id).success) return null

  return { updatedAt, id }
}
