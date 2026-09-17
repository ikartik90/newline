import { BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { AuthSessionSchema, type AuthUser } from '@shared/domain/auth'
import { apiFetch, apiJson } from './api'
import { clearSession, currentUser, getSessionToken, storeSession } from './session'

// ---------------------------------------------------------------------------
// Sign-in. Google is the identity provider: a window runs the OpenID Connect
// implicit flow and hands back an ID token, which is traded with the Worker
// for a session. The session is kept in `session.ts`; the ID token is also
// handed to the renderer, which still signs into Firebase with it while
// Firestore sync remains.
// ---------------------------------------------------------------------------

export type { AuthUser }
export { currentUser, getSessionToken }

export type GoogleIdTokenProvider = (clientId: string, authDomain: string) => Promise<string>

/** The sign-in window: Google's consent screen, watched for the redirect that carries the token. */
function obtainGoogleIdTokenInWindow(clientId: string, authDomain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const nonce = randomUUID()
    const redirectUri = `https://${authDomain}/__/auth/handler`

    const authUrl =
      'https://accounts.google.com/o/oauth2/v2/auth?' +
      new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
        prompt: 'select_account'
      }).toString()

    const authWindow = new BrowserWindow({
      width: 500,
      height: 700,
      parent: BrowserWindow.getFocusedWindow() ?? undefined,
      modal: true,
      show: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true
      }
    })

    authWindow.webContents.on('will-redirect', (_e, url) => {
      extractToken(url)
    })

    authWindow.webContents.on('will-navigate', (_e, url) => {
      extractToken(url)
    })

    function extractToken(url: string): void {
      try {
        const parsed = new URL(url)
        const fragment = parsed.hash.substring(1)
        const params = new URLSearchParams(fragment)
        const idToken = params.get('id_token')
        if (idToken) {
          resolve(idToken)
          authWindow.close()
        }
      } catch {
        // Not the redirect we're looking for
      }
    }

    authWindow.on('closed', () => {
      reject(new Error('Auth window was closed'))
    })

    authWindow.loadURL(authUrl)
  })
}

let obtainGoogleIdToken: GoogleIdTokenProvider = obtainGoogleIdTokenInWindow

/** Swap the window for something else — a test's constant. `null` restores the window. */
export function setGoogleIdTokenProvider(provider: GoogleIdTokenProvider | null): void {
  obtainGoogleIdToken = provider ?? obtainGoogleIdTokenInWindow
}

/**
 * Sign in: Google first, then the Worker. Resolves once the session is
 * stored, with the ID token for the renderer's Firebase sign-in and the user
 * the Worker knows. Rejects, storing nothing, when either side refuses.
 */
export async function signInWithGoogle(
  clientId: string,
  authDomain: string
): Promise<{ idToken: string; user: AuthUser }> {
  const idToken = await obtainGoogleIdToken(clientId, authDomain)
  const session = AuthSessionSchema.parse(
    await apiJson('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken })
    })
  )
  storeSession(session.token, session.user)
  return { idToken, user: session.user }
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
