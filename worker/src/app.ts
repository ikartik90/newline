import type { AppEnv } from './env'
import { Router } from './router'
import { registerAuthRoutes, type GoogleDeps } from './routes/auth'
import { registerMediaRoutes } from './routes/media'
import { registerNotesRoutes } from './routes/notes'
import { registerPublicMediaRoutes } from './routes/public-media'

export interface AppDeps {
  /** The code exchange and the ID token check; `src/index.ts` wires the real ones. */
  google: GoogleDeps
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
  registerAuthRoutes(router, { google: deps.google, now })
  registerMediaRoutes(router, { now })
  registerNotesRoutes(router, { now })
  registerPublicMediaRoutes(router)
  return { fetch: (request, env, ctx) => router.handle(request, env, ctx) }
}
