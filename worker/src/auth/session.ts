import { userFromRow, type User, type UserRow } from './users'

/** A session lives 180 days past its last use. */
export const SESSION_TTL_MS = 180 * 24 * 60 * 60 * 1000
/** …and "last use" is only re-stamped once a day, so reads stay cheap. */
export const SESSION_TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000

export interface SessionUser {
  user: User
  expiresAt: number
  lastUsedAt: number
}

interface SessionRow extends UserRow {
  expires_at: number
  last_used_at: number
}

function base64url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 32 random bytes as base64url — the bearer token the app holds. */
export function mintSessionToken(): string {
  return base64url(crypto.getRandomValues(new Uint8Array(32)))
}

/** SHA-256 hex; the only form of a token D1 ever sees. */
export async function hashSessionToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

/** Opens a session for `userId` and returns its token. */
export async function createSession(
  db: D1Database,
  userId: string,
  now = Date.now()
): Promise<string> {
  const token = mintSessionToken()
  await db
    .prepare(
      `INSERT INTO sessions (token_hash, user_id, created_at, expires_at, last_used_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(await hashSessionToken(token), userId, now, now + SESSION_TTL_MS, now)
    .run()
  return token
}

/**
 * The user behind a token, or null when it is unknown or expired (an expired
 * row is dropped on the way). Sliding expiry: the first use on a new day
 * pushes `expires_at` another 180 days out.
 */
export async function lookupSession(
  db: D1Database,
  token: string,
  now = Date.now()
): Promise<SessionUser | null> {
  const tokenHash = await hashSessionToken(token)
  const row = await db
    .prepare(
      `SELECT s.expires_at, s.last_used_at, u.id, u.email, u.name, u.picture
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`
    )
    .bind(tokenHash)
    .first<SessionRow>()
  if (!row) return null

  if (row.expires_at <= now) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }

  let { expires_at: expiresAt, last_used_at: lastUsedAt } = row
  if (now - lastUsedAt >= SESSION_TOUCH_INTERVAL_MS) {
    lastUsedAt = now
    expiresAt = now + SESSION_TTL_MS
    await db
      .prepare('UPDATE sessions SET last_used_at = ?, expires_at = ? WHERE token_hash = ?')
      .bind(lastUsedAt, expiresAt, tokenHash)
      .run()
  }

  return { user: userFromRow(row), expiresAt, lastUsedAt }
}

/** Forgets a token; a token nobody knows is already forgotten. */
export async function revokeSession(db: D1Database, token: string): Promise<void> {
  await db
    .prepare('DELETE FROM sessions WHERE token_hash = ?')
    .bind(await hashSessionToken(token))
    .run()
}
