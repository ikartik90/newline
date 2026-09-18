import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  createSession,
  hashSessionToken,
  lookupSession,
  mintSessionToken,
  revokeSession,
  SESSION_TTL_MS
} from '../auth/session'
import { upsertUser } from '../auth/users'
import { identity } from './helpers'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const T0 = Date.UTC(2026, 8, 1)

interface SessionRow {
  token_hash: string
  expires_at: number
  last_used_at: number
}

async function sessionRow(token: string): Promise<SessionRow | null> {
  return env.DB.prepare(
    'SELECT token_hash, expires_at, last_used_at FROM sessions WHERE token_hash = ?'
  )
    .bind(await hashSessionToken(token))
    .first<SessionRow>()
}

describe('mintSessionToken', () => {
  it('is 32 random bytes as base64url', () => {
    const token = mintSessionToken()

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(mintSessionToken()).not.toBe(token)
  })
})

describe('hashSessionToken', () => {
  it('is the SHA-256 hex digest', async () => {
    await expect(hashSessionToken('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    )
  })
})

describe('sessions', () => {
  it('stores only the hash and expires 180 days out', async () => {
    const user = await upsertUser(env.DB, identity(), T0)

    const token = await createSession(env.DB, user.id, T0)

    const row = await sessionRow(token)
    expect(row).toEqual({
      token_hash: await hashSessionToken(token),
      expires_at: T0 + SESSION_TTL_MS,
      last_used_at: T0
    })
    const { results } = await env.DB.prepare('SELECT token_hash FROM sessions').all<{
      token_hash: string
    }>()
    expect(results.map((r) => r.token_hash)).not.toContain(token)
  })

  it('looks a session up by its token and returns the user', async () => {
    const who = identity()
    const user = await upsertUser(env.DB, who, T0)
    const token = await createSession(env.DB, user.id, T0)

    const session = await lookupSession(env.DB, token, T0 + HOUR)

    expect(session).toEqual({
      user: { id: user.id, email: who.email, name: who.name, picture: who.picture },
      expiresAt: T0 + SESSION_TTL_MS,
      lastUsedAt: T0
    })
  })

  it('is null for an unknown token', async () => {
    await expect(lookupSession(env.DB, mintSessionToken(), T0)).resolves.toBeNull()
  })

  it('does not touch a session used again within a day', async () => {
    const user = await upsertUser(env.DB, identity(), T0)
    const token = await createSession(env.DB, user.id, T0)

    await lookupSession(env.DB, token, T0 + 23 * HOUR)

    expect(await sessionRow(token)).toMatchObject({
      expires_at: T0 + SESSION_TTL_MS,
      last_used_at: T0
    })
  })

  it('slides the expiry forward once a day of use has passed', async () => {
    const user = await upsertUser(env.DB, identity(), T0)
    const token = await createSession(env.DB, user.id, T0)
    const later = T0 + DAY + HOUR

    const session = await lookupSession(env.DB, token, later)

    expect(session).toMatchObject({ expiresAt: later + SESSION_TTL_MS, lastUsedAt: later })
    expect(await sessionRow(token)).toMatchObject({
      expires_at: later + SESSION_TTL_MS,
      last_used_at: later
    })
  })

  it('rejects and forgets an expired session', async () => {
    const user = await upsertUser(env.DB, identity(), T0)
    const token = await createSession(env.DB, user.id, T0)

    await expect(lookupSession(env.DB, token, T0 + SESSION_TTL_MS)).resolves.toBeNull()

    expect(await sessionRow(token)).toBeNull()
  })

  it('revokes a session', async () => {
    const user = await upsertUser(env.DB, identity(), T0)
    const token = await createSession(env.DB, user.id, T0)

    await revokeSession(env.DB, token)

    await expect(lookupSession(env.DB, token, T0)).resolves.toBeNull()
    await expect(revokeSession(env.DB, token)).resolves.toBeUndefined()
  })
})
