import type { AppEnv } from './env'
import { Router } from './router'
import { registerAuthRoutes, type AuthRouteDeps } from './routes/auth'
import { registerMediaRoutes } from './routes/media'
import { registerPublicMediaRoutes } from './routes/public-media'

export interface AppDeps {
  verifyGoogleIdToken: AuthRouteDeps['verifyGoogleIdToken']
  /** The clock; tests hand in their own. */
  now?: () => number
}

export interface App {
  fetch(request: Request, env: AppEnv, ctx: ExecutionContext): Promise<Response>
}

/** The whole API, with its outside dependencies injected. */
export function createApp(deps: AppDeps): App {
  const now = deps.now ?? (() => Date.now())
  const router = new Router<AppEnv>()
  registerAuthRoutes(router, { verifyGoogleIdToken: deps.verifyGoogleIdToken, now })
  registerMediaRoutes(router, { now })
  registerPublicMediaRoutes(router)
  return { fetch: (request, env, ctx) => router.handle(request, env, ctx) }
}
