import { bearerToken, requireSession } from '../auth/bearer'
import { InvalidGoogleTokenError, type GoogleIdentity } from '../auth/google'
import {
  InvalidGoogleCodeError,
  type GoogleClientConfig,
  type GoogleCodeGrant
} from '../auth/google-code'
import { createSession, revokeSession } from '../auth/session'
import { upsertUser } from '../auth/users'
import type { AppEnv } from '../env'
import { HttpError, json, noContent, readJsonObject } from '../http'
import type { Router } from '../router'

/** The two calls to Google a sign-in makes; production talks to Google, tests inject fakes. */
export interface GoogleDeps {
  /** Trades the app's authorization code for an ID token, or throws `InvalidGoogleCodeError`. */
  exchangeCode: (grant: GoogleCodeGrant, client: GoogleClientConfig) => Promise<{ idToken: string }>
  /** Resolves the identity a Google ID token carries, or throws `InvalidGoogleTokenError`. */
  verifyIdToken: (token: string, clientId: string) => Promise<GoogleIdentity>
}

export interface AuthRouteDeps {
  google: GoogleDeps
  now: () => number
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

export function registerAuthRoutes(router: Router<AppEnv>, deps: AuthRouteDeps): void {
  router.on('GET', '/auth/google/config', ({ env }) => {
    if (!env.GOOGLE_CLIENT_ID) throw new HttpError(500, 'misconfigured')
    return json({ clientId: env.GOOGLE_CLIENT_ID })
  })

  router.on('POST', '/auth/google/code', async ({ request, env }) => {
    const body = await readJsonObject(request)
    const { code, codeVerifier, redirectUri } = body
    if (
      !isNonEmptyString(code) ||
      !isNonEmptyString(codeVerifier) ||
      !isNonEmptyString(redirectUri)
    ) {
      throw new HttpError(400, 'bad_request')
    }

    // Both secrets must be in place before anything is sent to Google.
    const { GOOGLE_CLIENT_ID: clientId, GOOGLE_CLIENT_SECRET: clientSecret } = env
    if (!clientId || !clientSecret) throw new HttpError(500, 'misconfigured')

    // Google's ID token is checked here and goes no further: the app gets a session.
    let identity: GoogleIdentity
    try {
      const { idToken } = await deps.google.exchangeCode(
        { code, codeVerifier, redirectUri },
        { clientId, clientSecret }
      )
      identity = await deps.google.verifyIdToken(idToken, clientId)
    } catch (error) {
      if (error instanceof InvalidGoogleCodeError || error instanceof InvalidGoogleTokenError) {
        throw new HttpError(401, 'invalid_code')
      }
      throw error
    }

    const now = deps.now()
    const user = await upsertUser(env.DB, identity, now)
    const token = await createSession(env.DB, user.id, now)
    return json({ token, user })
  })

  router.on('GET', '/auth/me', async ({ request, env }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    return json({ user })
  })

  router.on('POST', '/auth/signout', async ({ request, env }) => {
    const token = bearerToken(request)
    if (!token) throw new HttpError(401, 'unauthorized')
    await revokeSession(env.DB, token)
    return noContent()
  })
}
