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

async function encryptToken(token: string): Promise<string> {
  if (await safeStorage.isAsyncEncryptionAvailable()) {
    return (await safeStorage.encryptStringAsync(token)).toString('base64')
  }
  console.warn('[auth] OS encryption is unavailable; storing the session token in plain text')
  return `${PLAIN_PREFIX}${token}`
}

/**
 * The stored value this machine last failed to decrypt. Remembered so the
 * presence check (`hasSession`) stops vouching for it without asking the
 * keychain again.
 */
let unreadable: string | null = null

/** The token a stored value holds, or null when this machine can no longer read it. */
async function decryptToken(stored: string): Promise<string | null> {
  if (stored.startsWith(PLAIN_PREFIX)) return stored.slice(PLAIN_PREFIX.length)
  try {
    const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(
      Buffer.from(stored, 'base64')
    )
    // The keychain rotated its key: store the token under the new one.
    if (shouldReEncrypt) writeMeta(TOKEN_KEY, await encryptToken(result))
    return result
  } catch (error) {
    console.warn('[auth] could not decrypt the stored session token:', error)
    unreadable = stored
    return null
  }
}

function writeMeta(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').run(key, value)
}

/** Whether a session is stored, without touching the keychain. */
export function hasSession(): boolean {
  const stored = readMeta(TOKEN_KEY)
  return stored !== null && stored !== unreadable
}

export async function getSessionToken(): Promise<string | null> {
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

export async function storeSession(token: string, user: AuthUser): Promise<void> {
  // Encrypted before the transaction, which cannot wait on the keychain.
  const encrypted = await encryptToken(token)
  getDb().transaction(() => {
    writeMeta(TOKEN_KEY, encrypted)
    writeMeta(USER_KEY, JSON.stringify(user))
  })()
}

export function clearSession(): void {
  getDb().prepare('DELETE FROM app_meta WHERE key IN (?, ?)').run(TOKEN_KEY, USER_KEY)
}
