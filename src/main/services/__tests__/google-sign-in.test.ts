import { createHash } from 'crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SignInCancelledError, obtainGoogleAuthorizationCode } from '../google-sign-in'

// ---------------------------------------------------------------------------
// The loopback flow against its real server. The "browser" is a fake that
// records the URL it was sent to; the test then plays Google, redirecting to
// the loopback with `fetch`, and checks what the flow makes of it.
// ---------------------------------------------------------------------------

const GOOGLE_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth'

type Flow = ReturnType<typeof obtainGoogleAuthorizationCode>

const flows: Flow[] = []

/**
 * Remember a flow so the test's end can clean it up, and count its rejection
 * as observed: a test often lets the flow reject while it is still awaiting
 * the redirect, before it gets to say `rejects`.
 */
function track(flow: Flow): Flow {
  flows.push(flow)
  flow.promise.catch(() => {})
  return flow
}

/** Start a flow and wait until the browser has been sent somewhere. */
async function start(options: { timeoutMs?: number } = {}) {
  let sendTo!: (url: string) => void
  const opened = new Promise<string>((resolve) => {
    sendTo = resolve
  })
  const openExternal = vi.fn(async (url: string) => {
    sendTo(url)
  })
  const flow = track(obtainGoogleAuthorizationCode('client-123', { openExternal, ...options }))
  const url = new URL(await opened)
  const params = url.searchParams
  return {
    flow,
    url,
    params,
    openExternal,
    redirectUri: params.get('redirect_uri')!,
    state: params.get('state')!
  }
}

/** Google's redirect, as the browser would follow it. */
function redirect(redirectUri: string, query: Record<string, string>): Promise<Response> {
  return fetch(`${redirectUri}?${new URLSearchParams(query)}`)
}

/** Once the flow is over nothing may be listening: a connection must be refused. */
async function expectClosed(redirectUri: string): Promise<void> {
  await expect(fetch(redirectUri)).rejects.toThrow()
}

function s256(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

afterEach(() => {
  // Whatever a test left running must not outlive it.
  for (const flow of flows.splice(0)) flow.cancel()
})

describe('obtainGoogleAuthorizationCode', () => {
  it('sends the browser to the consent screen with PKCE and a loopback redirect', async () => {
    const { url, params, openExternal, redirectUri, state } = await start()

    expect(`${url.origin}${url.pathname}`).toBe(GOOGLE_AUTH)
    expect(params.get('client_id')).toBe('client-123')
    expect(params.get('response_type')).toBe('code')
    expect(params.get('scope')).toBe('openid email profile')
    expect(params.get('code_challenge_method')).toBe('S256')
    expect(params.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(params.get('prompt')).toBe('select_account')
    expect(params.get('access_type')).toBe('online')
    expect(redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/)
    expect(state).toMatch(/^[A-Za-z0-9_-]{16,}$/)
    expect(openExternal).toHaveBeenCalledTimes(1)
  })

  it('picks a fresh state and verifier for every sign-in', async () => {
    const first = await start()
    const second = await start()
    expect(first.state).not.toBe(second.state)
    expect(first.params.get('code_challenge')).not.toBe(second.params.get('code_challenge'))
    expect(first.redirectUri).not.toBe(second.redirectUri)
  })

  it('resolves with the code, the verifier behind the challenge and the redirect it used', async () => {
    const { flow, params, redirectUri, state } = await start()

    const response = await redirect(redirectUri, { code: 'abc', state })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/html/)
    const html = await response.text()
    expect(html).toMatch(/signed in/i)
    expect(html).toMatch(/close this tab/i)
    expect(html).toMatch(/prefers-color-scheme/)

    const result = await flow.promise
    expect(result.code).toBe('abc')
    expect(result.redirectUri).toBe(redirectUri)
    expect(s256(result.codeVerifier)).toBe(params.get('code_challenge'))
    await expectClosed(redirectUri)
  })

  it('answers 400 and rejects when the state is wrong', async () => {
    const { flow, redirectUri } = await start()
    const response = await redirect(redirectUri, { code: 'abc', state: 'forged' })
    expect(response.status).toBe(400)
    const error = await flow.promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SignInCancelledError)
    await expectClosed(redirectUri)
  })

  it('answers 400 and rejects when the state is missing', async () => {
    const { flow, redirectUri } = await start()
    const response = await redirect(redirectUri, { code: 'abc' })
    expect(response.status).toBe(400)
    await expect(flow.promise).rejects.toThrow()
    await expectClosed(redirectUri)
  })

  it('treats a redirect that carries an error as the user declining', async () => {
    const { flow, redirectUri, state } = await start()
    const response = await redirect(redirectUri, { error: 'access_denied', state })
    expect(response.status).toBe(200)
    expect(await response.text()).toMatch(/cancelled/i)
    await expect(flow.promise).rejects.toBeInstanceOf(SignInCancelledError)
    await expectClosed(redirectUri)
  })

  it('answers 404 to any other path and keeps waiting', async () => {
    const { flow, redirectUri, state } = await start()
    const origin = new URL(redirectUri).origin
    expect((await fetch(`${origin}/favicon.ico`)).status).toBe(404)
    expect((await fetch(`${origin}/`)).status).toBe(404)

    await redirect(redirectUri, { code: 'later', state })
    await expect(flow.promise).resolves.toMatchObject({ code: 'later' })
  })

  it('cancel() rejects with SignInCancelledError and stops listening', async () => {
    const { flow, redirectUri } = await start()
    flow.cancel()
    await expect(flow.promise).rejects.toBeInstanceOf(SignInCancelledError)
    await expectClosed(redirectUri)
  })

  it('gives up after the timeout', async () => {
    const { flow, redirectUri } = await start({ timeoutMs: 50 })
    const error = await flow.promise.catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(SignInCancelledError)
    expect((error as Error).message).toMatch(/timed out/i)
    await expectClosed(redirectUri)
  })

  it('rejects, and stops listening, when the browser cannot be opened', async () => {
    let redirectUri = ''
    const openExternal = vi.fn(async (url: string) => {
      redirectUri = new URL(url).searchParams.get('redirect_uri')!
      throw new Error('no browser')
    })
    const flow = track(obtainGoogleAuthorizationCode('client-123', { openExternal }))
    await expect(flow.promise).rejects.toThrow('no browser')
    await expectClosed(redirectUri)
  })
})
