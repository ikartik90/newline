import type { GoogleIdentity } from './google'

/** What the app knows about the signed-in person. */
export interface User {
  id: string
  email: string
  name?: string
  picture?: string
}

export interface UserRow {
  id: string
  email: string
  name: string | null
  picture: string | null
}

export function userFromRow(row: UserRow): User {
  const user: User = { id: row.id, email: row.email }
  if (row.name !== null) user.name = row.name
  if (row.picture !== null) user.picture = row.picture
  return user
}

/**
 * The user for a Google account: created with a fresh uuid on first sign-in,
 * with email, name, picture and `last_seen_at` refreshed on every one after.
 */
export async function upsertUser(
  db: D1Database,
  identity: GoogleIdentity,
  now = Date.now()
): Promise<User> {
  const row = await db
    .prepare(
      `INSERT INTO users (id, google_sub, email, name, picture, created_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (google_sub) DO UPDATE SET
         email = excluded.email,
         name = excluded.name,
         picture = excluded.picture,
         last_seen_at = excluded.last_seen_at
       RETURNING id, email, name, picture`
    )
    .bind(
      crypto.randomUUID(),
      identity.sub,
      identity.email,
      identity.name ?? null,
      identity.picture ?? null,
      now,
      now
    )
    .first<UserRow>()
  if (!row) throw new Error('users upsert returned no row')
  return userFromRow(row)
}
