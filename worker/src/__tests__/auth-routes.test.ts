import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it, vi } from 'vitest'
import type { App } from '../app'
import type { GoogleIdentity } from '../auth/google'
import { hashSessionToken } from '../auth/session'
import type { AppEnv } from '../env'
import {
  call,
  CLIENT_ID,
  CLIENT_SECRET,
  codeFor,
  fakeExchanger,
  goodCode,
  identity,
  signedInUser,
  testApp
} from './helpers'

const CODE_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const REDIRECT_URI = 'http://127.0.0.1:51823/callback'

interface PostOptions {
  app?: App
  env?: Partial<AppEnv>
}

function postJson(path: string, body: unknown, options: PostOptions = {}) {
  return call(
    options.app ?? testApp(),
    path,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    },
    options.env
  )
}

/** What the app posts after Google's loopback redirect for `who`. */
function grant(who: GoogleIdentity) {
  return { code: goodCode(who), codeVerifier: CODE_VERIFIER, redirectUri: REDIRECT_URI }
}

interface SignInBody {
  token: string
  user: Record<string, string>
}

describe('GET /auth/google/config', () => {
  it('hands out the public client id', async () => {
    const response = await call(testApp(), '/auth/google/config')

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ clientId: CLIENT_ID })
  })

  it('is 500 misconfigured without a client id', async () => {
    const response = await call(testApp(), '/auth/google/config', {}, { GOOGLE_CLIENT_ID: '' })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'misconfigured' })
  })
})

describe('POST /auth/google/code', () => {
  it('trades the code for a session and the user, keeping Google’s id token to itself', async () => {
    const who = identity()

    const response = await postJson('/auth/google/code', grant(who))

    expect(response.status).toBe(200)
    const body = await response.json<SignInBody>()
    expect(body).toEqual({
      token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
      user: {
        id: expect.stringMatching(/^[0-9a-f-]{36}$/),
        email: who.email,
        name: who.name,
        picture: who.picture
      }
    })
    const row = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?')
      .bind(await hashSessionToken(body.token))
      .first<{ user_id: string }>()
    expect(row?.user_id).toBe(body.user.id)
  })

  it('mints a session /auth/me accepts', async () => {
    const { token, user } = await (
      await postJson('/auth/google/code', grant(identity()))
    ).json<SignInBody>()

    const me = await call(testApp(), '/auth/me', { headers: { authorization: `Bearer ${token}` } })

    expect(me.status).toBe(200)
    await expect(me.json()).resolves.toEqual({ user })
  })

  it('asks Google with the code, the verifier, the redirect and the client secret', async () => {
    const who = identity()
    const exchangeCode = vi.fn(fakeExchanger())

    const response = await postJson('/auth/google/code', grant(who), {
      app: testApp({ google: { exchangeCode } })
    })

    expect(response.status).toBe(200)
    expect(exchangeCode).toHaveBeenCalledTimes(1)
    expect(exchangeCode).toHaveBeenCalledWith(
      { code: goodCode(who), codeVerifier: CODE_VERIFIER, redirectUri: REDIRECT_URI },
      { clientId: CLIENT_ID, clientSecret: CLIENT_SECRET }
    )
  })

  it('keeps the same user id across sign-ins and refreshes the profile', async () => {
    const who = identity()
    const first = await (await postJson('/auth/google/code', grant(who))).json<SignInBody>()

    const again = await postJson(
      '/auth/google/code',
      grant({ ...who, email: 'renamed@example.com', name: 'Renamed', picture: undefined })
    )

    expect(again.status).toBe(200)
    const body = await again.json<SignInBody>()
    expect(body.user).toEqual({ id: first.user.id, email: 'renamed@example.com', name: 'Renamed' })
  })

  it('is 401 invalid_code for a code Google would not exchange', async () => {
    const response = await postJson('/auth/google/code', { ...grant(identity()), code: 'forged' })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_code' })
  })

  it('is 401 invalid_code when the token Google returns fails verification', async () => {
    const response = await postJson('/auth/google/code', {
      ...grant(identity()),
      code: codeFor('forged')
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_code' })
  })

  it.each(['code', 'codeVerifier', 'redirectUri'] as const)(
    'is 400 bad_request without %s',
    async (field) => {
      const body = grant(identity())

      const missing = await postJson('/auth/google/code', { ...body, [field]: undefined })
      const empty = await postJson('/auth/google/code', { ...body, [field]: '' })

      expect(missing.status).toBe(400)
      await expect(missing.json()).resolves.toEqual({ error: 'bad_request' })
      expect(empty.status).toBe(400)
      await expect(empty.json()).resolves.toEqual({ error: 'bad_request' })
    }
  )

  it('is 400 bad_request for a body that is not JSON', async () => {
    const response = await call(testApp(), '/auth/google/code', {
      method: 'POST',
      body: 'code=x'
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })

  it.each([
    { name: 'client id', overrides: { GOOGLE_CLIENT_ID: '' } },
    { name: 'client secret', overrides: { GOOGLE_CLIENT_SECRET: '' } }
  ])('is 500 misconfigured without the $name, before asking Google', async ({ overrides }) => {
    const exchangeCode = vi.fn(fakeExchanger())

    const response = await postJson('/auth/google/code', grant(identity()), {
      app: testApp({ google: { exchangeCode } }),
      env: overrides
    })

    expect(response.status).toBe(500)
    await expect(response.json()).resolves.toEqual({ error: 'misconfigured' })
    expect(exchangeCode).not.toHaveBeenCalled()
  })
})

describe('GET /auth/me', () => {
  it('returns the signed-in user', async () => {
    const who = identity()
    const { user, auth } = await signedInUser(who)

    const response = await call(testApp(), '/auth/me', { headers: auth })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      user: { id: user.id, email: who.email, name: who.name, picture: who.picture }
    })
  })

  it('is 401 unauthorized without a token', async () => {
    const response = await call(testApp(), '/auth/me')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('is 401 unauthorized for an unknown token', async () => {
    const response = await call(testApp(), '/auth/me', {
      headers: { authorization: 'Bearer nobody-minted-this' }
    })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('is 401 unauthorized for a scheme other than Bearer', async () => {
    const { token } = await signedInUser()

    const response = await call(testApp(), '/auth/me', {
      headers: { authorization: `Basic ${token}` }
    })

    expect(response.status).toBe(401)
  })
})

describe('POST /auth/signout', () => {
  it('revokes the session', async () => {
    const { auth } = await signedInUser()

    const response = await call(testApp(), '/auth/signout', { method: 'POST', headers: auth })

    expect(response.status).toBe(204)
    expect((await call(testApp(), '/auth/me', { headers: auth })).status).toBe(401)
  })

  it('is 204 for a token nobody knows', async () => {
    const response = await call(testApp(), '/auth/signout', {
      method: 'POST',
      headers: { authorization: 'Bearer nobody-minted-this' }
    })

    expect(response.status).toBe(204)
  })

  it('is 401 without a token', async () => {
    const response = await call(testApp(), '/auth/signout', { method: 'POST' })

    expect(response.status).toBe(401)
  })
})

describe('the deployed worker', () => {
  it('answers /auth/me with 401 through the real entry point', async () => {
    const response = await SELF.fetch('https://newline-api.example/auth/me')

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('is 404 not_found for an unknown route', async () => {
    const response = await SELF.fetch('https://newline-api.example/nope')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('no longer serves the old callback page', async () => {
    const response = await SELF.fetch('https://newline-api.example/auth/callback')

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('is 405 for the wrong method on a known route', async () => {
    const response = await SELF.fetch('https://newline-api.example/auth/me', { method: 'DELETE' })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})
