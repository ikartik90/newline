import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { hashSessionToken } from '../auth/session'
import { call, goodToken, identity, signedInUser, testApp } from './helpers'

function postJson(path: string, body: unknown, headers: Record<string, string> = {}) {
  return call(testApp(), path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body)
  })
}

describe('POST /auth/google', () => {
  it('trades a valid id token for a session and the user', async () => {
    const who = identity()

    const response = await postJson('/auth/google', { idToken: goodToken(who) })

    expect(response.status).toBe(200)
    const body = await response.json<{ token: string; user: Record<string, string> }>()
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(body.user).toEqual({
      id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      email: who.email,
      name: who.name,
      picture: who.picture
    })
    const row = await env.DB.prepare('SELECT user_id FROM sessions WHERE token_hash = ?')
      .bind(await hashSessionToken(body.token))
      .first<{ user_id: string }>()
    expect(row?.user_id).toBe(body.user.id)
  })

  it('keeps the same user id across sign-ins and refreshes the profile', async () => {
    const who = identity()
    const first = await (
      await postJson('/auth/google', { idToken: goodToken(who) })
    ).json<{
      user: { id: string }
    }>()

    const again = await postJson('/auth/google', {
      idToken: goodToken({
        ...who,
        email: 'renamed@example.com',
        name: 'Renamed',
        picture: undefined
      })
    })

    expect(again.status).toBe(200)
    const body = await again.json<{ token: string; user: Record<string, string> }>()
    expect(body.user).toEqual({ id: first.user.id, email: 'renamed@example.com', name: 'Renamed' })
  })

  it('is 401 invalid_token for a token Google would not vouch for', async () => {
    const response = await postJson('/auth/google', { idToken: 'forged' })

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_token' })
  })

  it('is 400 bad_request without an idToken', async () => {
    const response = await postJson('/auth/google', { token: 'x' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })

  it('is 400 bad_request for a body that is not JSON', async () => {
    const response = await call(testApp(), '/auth/google', { method: 'POST', body: 'idToken=x' })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
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

describe('GET /auth/callback', () => {
  it('tells the person to close the window', async () => {
    const response = await call(testApp(), '/auth/callback')

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/^text\/html/)
    expect(await response.text()).toContain('You can close this window')
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

  it('is 405 for the wrong method on a known route', async () => {
    const response = await SELF.fetch('https://newline-api.example/auth/me', { method: 'DELETE' })

    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toBe('GET')
  })
})
