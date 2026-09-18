import { createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { createApp, type App, type AppDeps } from '../app'
import { InvalidGoogleTokenError, type GoogleIdentity } from '../auth/google'
import { InvalidGoogleCodeError } from '../auth/google-code'
import { createSession } from '../auth/session'
import { upsertUser, type User } from '../auth/users'
import type { AppEnv } from '../env'
import type { GoogleDeps } from '../routes/auth'

export const ORIGIN = 'http://api.test'
export const CLIENT_ID = 'test-client.apps.googleusercontent.com'
export const CLIENT_SECRET = 'test-client-secret'

/** A fresh Google identity; every call is a different account. */
export function identity(overrides: Partial<GoogleIdentity> = {}): GoogleIdentity {
  const id = crypto.randomUUID()
  return {
    sub: `sub-${id}`,
    email: `${id}@example.com`,
    name: 'Test User',
    picture: `https://pictures.example/${id}.png`,
    ...overrides
  }
}

/** The token the fake verifier accepts for `who`. */
export function goodToken(who: GoogleIdentity): string {
  return `good:${JSON.stringify(who)}`
}

/** An authorization code the fake exchanger trades for exactly `token`. */
export function codeFor(token: string): string {
  return `code:${token}`
}

/** The code that signs `who` in: the fake exchanger trades it for `goodToken(who)`. */
export function goodCode(who: GoogleIdentity): string {
  return codeFor(goodToken(who))
}

/** Trades codes minted by `codeFor`, refuses everything else the way Google would. */
export function fakeExchanger(): GoogleDeps['exchangeCode'] {
  return async ({ code }) => {
    if (!code.startsWith('code:')) {
      throw new InvalidGoogleCodeError('rejected by the test exchanger')
    }
    return { idToken: code.slice('code:'.length) }
  }
}

/** Accepts tokens minted by `goodToken`, rejects everything else the way the real one would. */
export function fakeVerifier(): GoogleDeps['verifyIdToken'] {
  return async (token) => {
    if (!token.startsWith('good:')) {
      throw new InvalidGoogleTokenError('rejected by the test verifier')
    }
    return JSON.parse(token.slice('good:'.length)) as GoogleIdentity
  }
}

export function testEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return { ...env, GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CLIENT_SECRET: CLIENT_SECRET, ...overrides }
}

export interface TestAppDeps {
  now?: AppDeps['now']
  /** Replaces one or both Google fakes. */
  google?: Partial<GoogleDeps>
}

export function testApp(deps: TestAppDeps = {}): App {
  return createApp({
    ...deps,
    google: { exchangeCode: fakeExchanger(), verifyIdToken: fakeVerifier(), ...deps.google }
  })
}

/** One request through `app`, with the execution context drained afterwards. */
export async function call(
  app: App,
  path: string,
  init: RequestInit = {},
  envOverrides: Partial<AppEnv> = {}
): Promise<Response> {
  const ctx = createExecutionContext()
  const response = await app.fetch(
    new Request(`${ORIGIN}${path}`, init),
    testEnv(envOverrides),
    ctx
  )
  await waitOnExecutionContext(ctx)
  return response
}

export interface SignedInUser {
  user: User
  token: string
  /** Ready to spread into request headers. */
  auth: Record<string, string>
}

/** A user with a live session, written straight to D1. */
export async function signedInUser(who: GoogleIdentity = identity()): Promise<SignedInUser> {
  const user = await upsertUser(env.DB, who)
  const token = await createSession(env.DB, user.id)
  return { user, token, auth: { authorization: `Bearer ${token}` } }
}

export function bytesOf(text: string): Uint8Array {
  return new TextEncoder().encode(text)
}
