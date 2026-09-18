import { filenameFromMediaKey } from '@shared/domain/media'

/** The app's two kinds of key: library objects and the stills taken from clips. */
export const MEDIA_KEY_PREFIXES = ['media/', 'posters/'] as const

const MAX_NAME_LENGTH = 200

/**
 * What `sanitizeMediaFilename` leaves in a name (and the `<uuid>-` stamp
 * before it): word characters, dot, dash, parentheses and plus. No slash, so a
 * name is always a single path segment.
 */
const NAME_PATTERN = /^[\w.\-()+]+$/

/**
 * `media/<name>` or `posters/<name>` with a name the app could have produced.
 * A name is one segment, so dots inside it (`a..b.png`, which the sanitiser
 * lets through) cannot climb anywhere; only a dot-name itself is refused.
 */
export function isValidMediaKey(key: string): boolean {
  const prefix = MEDIA_KEY_PREFIXES.find((candidate) => key.startsWith(candidate))
  if (!prefix) return false
  const name = key.slice(prefix.length)
  return (
    name.length > 0 &&
    name.length <= MAX_NAME_LENGTH &&
    NAME_PATTERN.test(name) &&
    !name.startsWith('.')
  )
}

/** Where the bytes live: one folder per user, which the app never sees. */
export function bucketKeyFor(userId: string, key: string): string {
  return `u/${userId}/${key}`
}

export function publicUrlFor(publicBaseUrl: string, userId: string, key: string): string {
  return `${publicBaseUrl}/${bucketKeyFor(userId, key)}`
}

/** The file name a key carries: its name without the `<uuid>-` stamp. */
export function filenameOfKey(key: string): string {
  return filenameFromMediaKey(key.slice(key.indexOf('/') + 1), '')
}
