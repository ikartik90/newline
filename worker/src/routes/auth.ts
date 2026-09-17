import { bearerToken, requireSession } from '../auth/bearer'
import { InvalidGoogleTokenError, type GoogleIdentity } from '../auth/google'
import { createSession, revokeSession } from '../auth/session'
import { upsertUser } from '../auth/users'
import type { AppEnv } from '../env'
import { HttpError, json, noContent, readJsonObject } from '../http'
import type { Router } from '../router'

export interface AuthRouteDeps {
  /** Resolves the identity a Google id token carries, or throws `InvalidGoogleTokenError`. */
  verifyGoogleIdToken: (token: string, clientId: string) => Promise<GoogleIdentity>
  now: () => number
}

const CALLBACK_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Newline</title>
  </head>
  <body>
    <p>You can close this window.</p>
  </body>
</html>
`

export function registerAuthRoutes(router: Router<AppEnv>, deps: AuthRouteDeps): void {
  router.on('POST', '/auth/google', async ({ request, env }) => {
    const body = await readJsonObject(request)
    const idToken = body.idToken
    if (typeof idToken !== 'string' || idToken.length === 0) {
      throw new HttpError(400, 'bad_request')
    }

    let identity: GoogleIdentity
    try {
      identity = await deps.verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID)
    } catch (error) {
      if (error instanceof InvalidGoogleTokenError) throw new HttpError(401, 'invalid_token')
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

  router.on(
    'GET',
    '/auth/callback',
    () => new Response(CALLBACK_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } })
  )
}
