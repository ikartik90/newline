import { safeStorage } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { getDb } from '../../db/database'
import * as auth from '../auth'

// ---------------------------------------------------------------------------
// Sign-in against a mocked Worker: the Google ID token comes from an injected
// provider rather than a window, `fetch` is a stub, and the session lands in
// the in-memory database through a stand-in for the OS keychain.
// ---------------------------------------------------------------------------

vi.mock('electron', async () => {
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  const userData = mkdtempSync(join(tmpdir(), 'newline-auth-'))
  const PREFIX = 'enc:'
  return {
    app: { getPath: () => userData },
    BrowserWindow: class {},
    safeStorage: {
      isEncryptionAvailable: vi.fn(() => true),
      encryptString: vi.fn((text: string) => Buffer.from(`${PREFIX}${text}`)),
      decryptString: vi.fn((buffer: Buffer) => {
        const text = buffer.toString()
        if (!text.startsWith(PREFIX)) throw new Error('not ours')
        return text.slice(PREFIX.length)
      })
    }
  }
})

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

const fetchMock = vi.fn<typeof fetch>()
const user = { id: 'u-1', email: 'me@example.com', name: 'Me' }

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function lastRequest(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

function meta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

async function signIn(): Promise<{ idToken: string; user: auth.AuthUser }> {
  fetchMock.mockResolvedValueOnce(json({ token: 'session-token', user }))
  return auth.signInWithGoogle('client-id', 'app.firebaseapp.com')
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
  fetchMock.mockReset()
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  auth.setGoogleIdTokenProvider(async () => 'google-id-token')
  getDb().exec('DELETE FROM app_meta')
})

afterEach(() => {
  auth.setGoogleIdTokenProvider(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signInWithGoogle', () => {
  it('trades the ID token for a session and answers with both', async () => {
    const provider = vi.fn(async () => 'google-id-token')
    auth.setGoogleIdTokenProvider(provider)
    const result = await signIn()

    expect(provider).toHaveBeenCalledWith('client-id', 'app.firebaseapp.com')
    expect(result).toEqual({ idToken: 'google-id-token', user })
    const { url, init, headers } = lastRequest()
    expect(url).toBe('https://api.example.com/auth/google')
    expect(init.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.has('Authorization')).toBe(false)
    expect(JSON.parse(init.body as string)).toEqual({ idToken: 'google-id-token' })
  })

  it('stores the token encrypted, never in the clear, and the user beside it', async () => {
    await signIn()
    const stored = meta('session_token')!
    expect(stored).toBe(Buffer.from('enc:session-token').toString('base64'))
    expect(stored).not.toContain('session-token')
    expect(safeStorage.encryptString).toHaveBeenCalledWith('session-token')
    expect(JSON.parse(meta('session_user')!)).toEqual(user)
    expect(auth.getSessionToken()).toBe('session-token')
    expect(auth.currentUser()).toEqual(user)
  })

  it('falls back to plain text, with a warning, when the OS cannot encrypt', async () => {
    vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(false)
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    await signIn()
    expect(meta('session_token')).toBe('plain:session-token')
    expect(warn).toHaveBeenCalled()
    expect(auth.getSessionToken()).toBe('session-token')
  })

  it('stores nothing when the Worker refuses the token', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_token' }, 401))
    const error = await auth
      .signInWithGoogle('client-id', 'app.firebaseapp.com')
      .catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'invalid_token' })
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
  })

  it('refuses a session the Worker shaped wrongly', async () => {
    fetchMock.mockResolvedValueOnce(json({ token: 'x', user: { email: 'no-id@example.com' } }))
    await expect(auth.signInWithGoogle('client-id', 'app.firebaseapp.com')).rejects.toThrow()
    expect(auth.currentUser()).toBeNull()
  })

  it('replaces an earlier session', async () => {
    await signIn()
    fetchMock.mockResolvedValueOnce(json({ token: 'second', user: { ...user, name: 'Renamed' } }))
    await auth.signInWithGoogle('client-id', 'app.firebaseapp.com')
    expect(auth.getSessionToken()).toBe('second')
    expect(auth.currentUser()?.name).toBe('Renamed')
  })
})

describe('getSessionToken / currentUser', () => {
  it('answer null before any sign-in', () => {
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
  })

  it('round-trip through the encryption on every read', async () => {
    await signIn()
    vi.mocked(safeStorage.decryptString).mockClear()
    expect(auth.getSessionToken()).toBe('session-token')
    expect(safeStorage.decryptString).toHaveBeenCalledWith(Buffer.from('enc:session-token'))
  })

  it('treat a token this machine can no longer decrypt as no session', async () => {
    await signIn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getDb()
      .prepare('UPDATE app_meta SET value = ? WHERE key = ?')
      .run(Buffer.from('other-machine').toString('base64'), 'session_token')
    expect(auth.getSessionToken()).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('treat a user row that does not parse as no user', async () => {
    await signIn()
    getDb().prepare('UPDATE app_meta SET value = ? WHERE key = ?').run('{"id":', 'session_user')
    expect(auth.currentUser()).toBeNull()
  })
})

describe('signOut', () => {
  it('tells the Worker with the session token, then forgets it', async () => {
    await signIn()
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }))
    await auth.signOut()
    const { url, init, headers } = lastRequest()
    expect(url).toBe('https://api.example.com/auth/signout')
    expect(init.method).toBe('POST')
    expect(headers.get('Authorization')).toBe('Bearer session-token')
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
    expect(meta('session_token')).toBeNull()
    expect(meta('session_user')).toBeNull()
  })

  it('forgets the session even when the Worker cannot be reached', async () => {
    await signIn()
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'))
    await expect(auth.signOut()).resolves.toBeUndefined()
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
    expect(warn).toHaveBeenCalled()
  })

  it('forgets the session even when the Worker answers with an error', async () => {
    await signIn()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    fetchMock.mockResolvedValueOnce(json({ error: 'unauthorized' }, 401))
    await auth.signOut()
    expect(auth.getSessionToken()).toBeNull()
  })

  it('does not call the Worker when there is no session to end', async () => {
    await auth.signOut()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
