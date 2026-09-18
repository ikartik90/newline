import { app, BrowserWindow, shell } from 'electron'
import { AuthSessionSchema, GoogleSignInConfigSchema, type AuthUser } from '@shared/domain/auth'
import { apiFetch, apiJson } from './api'
import {
  SignInCancelledError,
  obtainGoogleAuthorizationCode,
  type CodeFlow,
  type ObtainCodeOptions
} from './google-sign-in'
import { clearSession, currentUser, getSessionToken, storeSession } from './session'

// ---------------------------------------------------------------------------
// Sign-in. Google is the identity provider: the user's default browser runs
// the consent screen and sends an authorization code back to a loopback
// port (`google-sign-in.ts`); the Worker exchanges the code for a session,
// which `session.ts` keeps. The session is the whole of being signed in:
// the renderer only ever learns who the user is.
// ---------------------------------------------------------------------------

export type { AuthUser }
export { currentUser, getSessionToken, SignInCancelledError }

/** What a sign-in needs from outside: the browser flow, the browser, and the window. */
export interface SignInDeps {
  obtainCode: (clientId: string, options: ObtainCodeOptions) => CodeFlow
  openExternal: (url: string) => Promise<void>
  /** Once signed in, the user is in the browser; the app asks for them back. */
  bringToFront: () => void
}

const defaultDeps: SignInDeps = {
  obtainCode: obtainGoogleAuthorizationCode,
  openExternal: (url) => shell.openExternal(url),
  bringToFront: () => {
    app.focus({ steal: true })
    const window = BrowserWindow.getAllWindows()[0]
    if (!window) return
    if (window.isMinimized()) window.restore()
    window.focus()
  }
}

let deps = defaultDeps

/** Swap the real browser and window for a test's stand-ins. `null` restores them. */
export function setSignInDeps(overrides: Partial<SignInDeps> | null): void {
  deps = overrides ? { ...defaultDeps, ...overrides } : defaultDeps
}

/**
 * The sign-in under way, if any. It exists from the first request onward
 * so a cancel that lands while the client id is still being fetched is
 * honoured too, before any browser opens.
 */
interface Attempt {
  cancelled: boolean
  flow: CodeFlow | null
}

let pending: Attempt | null = null

function cancel(attempt: Attempt): void {
  attempt.cancelled = true
  attempt.flow?.cancel()
  if (pending === attempt) pending = null
}

/**
 * Sign in: Google in the browser, then the Worker. Resolves once the session
 * is stored, with the user the Worker knows. Rejects, storing nothing, when
 * either side refuses; with `SignInCancelledError` when the user declines in
 * the browser, when `cancelSignIn` is called, or when a newer sign-in
 * supersedes this one.
 */
export async function signInWithGoogle(): Promise<{ user: AuthUser }> {
  if (pending) cancel(pending)
  const attempt: Attempt = { cancelled: false, flow: null }
  pending = attempt

  try {
    const { clientId } = GoogleSignInConfigSchema.parse(await apiJson('/auth/google/config'))
    if (attempt.cancelled) throw new SignInCancelledError()

    attempt.flow = deps.obtainCode(clientId, { openExternal: deps.openExternal })
    const { code, codeVerifier, redirectUri } = await attempt.flow.promise

    const session = AuthSessionSchema.parse(
      await apiJson('/auth/google/code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, codeVerifier, redirectUri })
      })
    )
    if (attempt.cancelled) throw new SignInCancelledError()

    storeSession(session.token, session.user)
    deps.bringToFront()
    return { user: session.user }
  } finally {
    if (pending === attempt) pending = null
  }
}

/** End the sign-in under way, if there is one; the browser flow's port closes with it. */
export function cancelSignIn(): void {
  if (pending) cancel(pending)
}

/**
 * End the session here and, when it can be reached, at the Worker. The local
 * half never waits on the network: a machine that is offline still signs out.
 */
export async function signOut(): Promise<void> {
  if (getSessionToken() !== null) {
    try {
      await apiFetch('/auth/signout', { method: 'POST' })
    } catch (error) {
      console.warn('[auth] sign-out did not reach the server:', error)
    }
  }
  clearSession()
}
