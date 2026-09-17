import { app, BrowserWindow, safeStorage, shell } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../api'
import { getDb } from '../../db/database'
import { SignInCancelledError, type AuthorizationCode, type CodeFlow } from '../google-sign-in'
import * as auth from '../auth'

// ---------------------------------------------------------------------------
// Sign-in against a mocked Worker: the browser flow is an injected stand-in
// that hands back a code on cue, `fetch` is a stub, and the session lands in
// the in-memory database through a stand-in for the OS keychain.
// ---------------------------------------------------------------------------

vi.mock('electron', async () => {
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  const userData = mkdtempSync(join(tmpdir(), 'newline-auth-'))
  const PREFIX = 'enc:'
  return {
    app: { getPath: () => userData, focus: vi.fn() },
    BrowserWindow: { getAllWindows: vi.fn(() => []) },
    shell: { openExternal: vi.fn(async () => {}) },
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
const code: AuthorizationCode = {
  code: 'abc',
  codeVerifier: 'verifier',
  redirectUri: 'http://127.0.0.1:4242/callback'
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function request(index: number): { url: string; init: RequestInit; headers: Headers } {
  const [url, init = {}] = fetchMock.mock.calls[index] as [string, RequestInit | undefined]
  return { url, init, headers: new Headers(init.headers) }
}

function lastRequest(): { url: string; init: RequestInit; headers: Headers } {
  return request(fetchMock.mock.calls.length - 1)
}

function meta(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

/** A browser flow the test settles by hand. */
interface FakeFlow extends CodeFlow {
  resolve: (code: AuthorizationCode) => void
  reject: (error: unknown) => void
  cancel: ReturnType<typeof vi.fn<() => void>>
}

function fakeFlow(): FakeFlow {
  let resolve!: (code: AuthorizationCode) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<AuthorizationCode>((res, rej) => {
    resolve = res
    reject = rej
  })
  const cancel = vi.fn(() => reject(new SignInCancelledError()))
  return { promise, cancel, resolve, reject }
}

const flows: FakeFlow[] = []
const obtainCode = vi.fn((_clientId: string, _options: unknown): CodeFlow => {
  const flow = fakeFlow()
  flows.push(flow)
  return flow
})
const bringToFront = vi.fn()

/** The Worker's two answers, queued: the client id, then the session. */
function answerWorker(): void {
  fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
  fetchMock.mockResolvedValueOnce(
    json({ token: 'session-token', user, idToken: 'google-id-token' })
  )
}

/** A sign-in whose browser flow answers at once. */
async function signIn(): Promise<{ idToken: string; user: auth.AuthUser }> {
  answerWorker()
  const pending = auth.signInWithGoogle()
  await vi.waitFor(() => expect(flows.length).toBeGreaterThan(0))
  flows.at(-1)!.resolve(code)
  return pending
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
  fetchMock.mockReset()
  flows.length = 0
  obtainCode.mockClear()
  bringToFront.mockClear()
  vi.mocked(safeStorage.isEncryptionAvailable).mockReturnValue(true)
  auth.setSignInDeps({ obtainCode, bringToFront })
  getDb().exec('DELETE FROM app_meta')
})

afterEach(() => {
  auth.cancelSignIn()
  auth.setSignInDeps(null)
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('signInWithGoogle', () => {
  it('asks the Worker for the client id, runs the browser flow, then posts the code', async () => {
    const result = await signIn()

    const config = request(0)
    expect(config.url).toBe('https://api.example.com/auth/google/config')
    expect(config.init.method ?? 'GET').toBe('GET')
    expect(config.headers.has('Authorization')).toBe(false)

    expect(obtainCode).toHaveBeenCalledTimes(1)
    expect(obtainCode.mock.calls[0][0]).toBe('client-123')

    const exchange = request(1)
    expect(exchange.url).toBe('https://api.example.com/auth/google/code')
    expect(exchange.init.method).toBe('POST')
    expect(exchange.headers.get('Content-Type')).toBe('application/json')
    expect(exchange.headers.has('Authorization')).toBe(false)
    expect(JSON.parse(exchange.init.body as string)).toEqual({
      code: 'abc',
      codeVerifier: 'verifier',
      redirectUri: 'http://127.0.0.1:4242/callback'
    })

    expect(result).toEqual({ idToken: 'google-id-token', user })
    expect(bringToFront).toHaveBeenCalledTimes(1)
  })

  it('hands the flow the injected browser opener', async () => {
    const openExternal = vi.fn(async () => {})
    auth.setSignInDeps({ obtainCode, bringToFront, openExternal })
    await signIn()
    const options = obtainCode.mock.calls[0][1] as { openExternal: (url: string) => unknown }
    await options.openExternal('https://accounts.google.com/x')
    expect(openExternal).toHaveBeenCalledWith('https://accounts.google.com/x')
  })

  it('opens the browser with the shell and brings the window forward by default', async () => {
    auth.setSignInDeps({ obtainCode })
    const window = { isMinimized: vi.fn(() => true), restore: vi.fn(), focus: vi.fn() }
    vi.mocked(BrowserWindow.getAllWindows).mockReturnValue([window as never])

    await signIn()
    const options = obtainCode.mock.calls[0][1] as { openExternal: (url: string) => unknown }
    await options.openExternal('https://accounts.google.com/x')
    expect(shell.openExternal).toHaveBeenCalledWith('https://accounts.google.com/x')
    expect(app.focus).toHaveBeenCalledWith({ steal: true })
    expect(window.restore).toHaveBeenCalled()
    expect(window.focus).toHaveBeenCalled()
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

  it('never opens the browser when the Worker has no client id to give', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'misconfigured' }, 500))
    const error = await auth.signInWithGoogle().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 500, code: 'misconfigured' })
    expect(obtainCode).not.toHaveBeenCalled()
    expect(auth.getSessionToken()).toBeNull()
  })

  it('refuses a config without a client id', async () => {
    fetchMock.mockResolvedValueOnce(json({}))
    await expect(auth.signInWithGoogle()).rejects.toThrow()
    expect(obtainCode).not.toHaveBeenCalled()
  })

  it('stores nothing when the Worker refuses the code', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    fetchMock.mockResolvedValueOnce(json({ error: 'invalid_code' }, 401))
    const pending = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))
    flows[0].resolve(code)
    const error = await pending.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 401, code: 'invalid_code' })
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
    expect(bringToFront).not.toHaveBeenCalled()
  })

  it('refuses a session the Worker shaped wrongly', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    fetchMock.mockResolvedValueOnce(json({ token: 'x', user }))
    const pending = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))
    flows[0].resolve(code)
    await expect(pending).rejects.toThrow()
    expect(auth.currentUser()).toBeNull()
  })

  it('passes on the browser flow declining, storing nothing', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    const pending = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))
    flows[0].reject(new SignInCancelledError())
    await expect(pending).rejects.toBeInstanceOf(SignInCancelledError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.getSessionToken()).toBeNull()
  })

  it('replaces an earlier session', async () => {
    await signIn()
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    fetchMock.mockResolvedValueOnce(
      json({ token: 'second', user: { ...user, name: 'Renamed' }, idToken: 'id-2' })
    )
    const pending = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(2))
    flows[1].resolve(code)
    await pending
    expect(auth.getSessionToken()).toBe('second')
    expect(auth.currentUser()?.name).toBe('Renamed')
  })
})

describe('cancelSignIn', () => {
  it('ends a pending sign-in: it rejects as cancelled and stores nothing', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    const pending = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))

    auth.cancelSignIn()
    expect(flows[0].cancel).toHaveBeenCalledTimes(1)
    await expect(pending).rejects.toBeInstanceOf(SignInCancelledError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.getSessionToken()).toBeNull()
    expect(auth.currentUser()).toBeNull()
    expect(bringToFront).not.toHaveBeenCalled()
  })

  it('ends a sign-in still waiting for the client id, before any browser opens', async () => {
    let answerConfig!: (response: Response) => void
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        answerConfig = resolve
      })
    )
    const pending = auth.signInWithGoogle()
    auth.cancelSignIn()
    answerConfig(json({ clientId: 'client-123' }))
    await expect(pending).rejects.toBeInstanceOf(SignInCancelledError)
    expect(obtainCode).not.toHaveBeenCalled()
  })

  it('is a no-op when nothing is pending', () => {
    expect(() => auth.cancelSignIn()).not.toThrow()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('does not touch a sign-in that has already finished', async () => {
    await signIn()
    auth.cancelSignIn()
    expect(flows[0].cancel).not.toHaveBeenCalled()
    expect(auth.getSessionToken()).toBe('session-token')
  })
})

describe('a second sign-in while one is pending', () => {
  it('cancels the first and carries on with the second', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    const first = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))

    answerWorker()
    const second = auth.signInWithGoogle()
    expect(flows[0].cancel).toHaveBeenCalledTimes(1)
    await expect(first).rejects.toBeInstanceOf(SignInCancelledError)

    await vi.waitFor(() => expect(flows.length).toBe(2))
    flows[1].resolve(code)
    await expect(second).resolves.toEqual({ idToken: 'google-id-token', user })
    expect(auth.getSessionToken()).toBe('session-token')
    expect(bringToFront).toHaveBeenCalledTimes(1)
  })

  it('lets the second be cancelled without the first coming back', async () => {
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    const first = auth.signInWithGoogle()
    await vi.waitFor(() => expect(flows.length).toBe(1))
    fetchMock.mockResolvedValueOnce(json({ clientId: 'client-123' }))
    const second = auth.signInWithGoogle()
    await expect(first).rejects.toBeInstanceOf(SignInCancelledError)
    await vi.waitFor(() => expect(flows.length).toBe(2))

    auth.cancelSignIn()
    expect(flows[1].cancel).toHaveBeenCalledTimes(1)
    await expect(second).rejects.toBeInstanceOf(SignInCancelledError)
    expect(auth.getSessionToken()).toBeNull()
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
