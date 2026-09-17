import { createApp } from './app'
import { googleJwks, verifyGoogleIdToken, type GoogleIdentity } from './auth/google'
import type { AppEnv } from './env'

// Created on first use and kept for the isolate's life, so jose can cache Google's keys.
let jwks: ReturnType<typeof googleJwks> | undefined

function verifyWithGoogle(token: string, clientId: string): Promise<GoogleIdentity> {
  jwks ??= googleJwks()
  return verifyGoogleIdToken(token, { clientId, jwks })
}

const app = createApp({ verifyGoogleIdToken: verifyWithGoogle })

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx)
} satisfies ExportedHandler<AppEnv>
