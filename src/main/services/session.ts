import { safeStorage } from 'electron'
import { AuthUserSchema, type AuthUser } from '@shared/domain/auth'
import { getDb } from '../db/database'

// ---------------------------------------------------------------------------
// The Worker session on this machine: the bearer token and who it belongs
// to, in `app_meta`. The token is a credential, so it goes through the OS
// keychain (`safeStorage`) on the way in and out; the user is plain JSON.
// `auth.ts` writes here; `api.ts` reads the token for every request.
// ---------------------------------------------------------------------------

const TOKEN_KEY = 'session_token'
const USER_KEY = 'session_user'

/** Marks a token stored as it is, on a machine whose keychain could not be used. */
const PLAIN_PREFIX = 'plain:'

function readMeta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

function encryptToken(token: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(token).toString('base64')
  }
  console.warn('[auth] OS encryption is unavailable; storing the session token in plain text')
  return `${PLAIN_PREFIX}${token}`
}

/** The token a stored value holds, or null when this machine can no longer read it. */
function decryptToken(stored: string): string | null {
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length)
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch (error) {
    console.warn('[auth] could not decrypt the stored session token:', error)
    return null
  }
}

export function getSessionToken(): string | null {
  const stored = readMeta(TOKEN_KEY)
  return stored === null ? null : decryptToken(stored)
}

export function currentUser(): AuthUser | null {
  const stored = readMeta(USER_KEY)
  if (stored === null) return null
  try {
    const parsed = AuthUserSchema.safeParse(JSON.parse(stored))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

export function storeSession(token: string, user: AuthUser): void {
  const db = getDb()
  const upsert = db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)')
  db.transaction(() => {
    upsert.run(TOKEN_KEY, encryptToken(token))
    upsert.run(USER_KEY, JSON.stringify(user))
  })()
}

export function clearSession(): void {
  getDb().prepare('DELETE FROM app_meta WHERE key IN (?, ?)').run(TOKEN_KEY, USER_KEY)
}
