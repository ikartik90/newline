import { createHash, randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { SIGN_IN_CANCELLED_MESSAGE } from '@shared/domain/auth'

// ---------------------------------------------------------------------------
// The OAuth 2.0 flow for native apps, Google's way: the user's own browser
// runs the consent screen, and Google sends the authorization code back to a
// loopback address this process listens on for exactly one request. PKCE
// binds the code to this sign-in; the Worker, which alone holds the client
// secret, trades the code for the session (`auth.ts`). Nothing here knows
// about Electron: the browser opener is injected so the flow runs under
// plain Node in tests.
// ---------------------------------------------------------------------------

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const CALLBACK_PATH = '/callback'
const DEFAULT_TIMEOUT_MS = 5 * 60_000

/** The sign-in ended without a code because someone chose to end it: the user in the browser, or the app. */
export class SignInCancelledError extends Error {
  constructor() {
    super(SIGN_IN_CANCELLED_MESSAGE)
    this.name = 'SignInCancelledError'
  }
}

/** What Google handed back, with what the Worker needs to redeem it. */
export interface AuthorizationCode {
  code: string
  codeVerifier: string
  /** The loopback URL the code was issued for; the exchange must repeat it verbatim. */
  redirectUri: string
}

export interface ObtainCodeOptions {
  /** Send the user's default browser to a URL — `shell.openExternal` in the app. */
  openExternal: (url: string) => Promise<void> | void
  /** How long to wait for the browser before giving up. Default five minutes. */
  timeoutMs?: number
}

export interface CodeFlow {
  promise: Promise<AuthorizationCode>
  /** End the flow now: the promise rejects with `SignInCancelledError` and the port closes. */
  cancel: () => void
}

/**
 * Open the consent screen and wait for Google's redirect. The promise settles
 * exactly once, and however it settles the loopback server is closed first:
 * nothing is left listening after a success, a refusal, a timeout, a wrong
 * state, a browser that would not open, or `cancel()`.
 */
export function obtainGoogleAuthorizationCode(
  clientId: string,
  { openExternal, timeoutMs = DEFAULT_TIMEOUT_MS }: ObtainCodeOptions
): CodeFlow {
  const codeVerifier = randomBytes(32).toString('base64url')
  const codeChallenge = createHash('sha256').update(codeVerifier).digest('base64url')
  const state = randomBytes(16).toString('base64url')

  let settle: (outcome: { code: string } | { error: Error }) => void = () => {}
  let redirectUri = ''

  const promise = new Promise<AuthorizationCode>((resolve, reject) => {
    let settled = false
    const server: Server = createServer(handleRequest)

    const timer = setTimeout(() => {
      settle({ error: new Error(`Sign-in timed out after ${timeoutMs} ms`) })
    }, timeoutMs)

    settle = (outcome) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      // Stop accepting connections first, then drop any that are idle; the
      // response in flight, if there is one, ends its own connection.
      server.close()
      server.closeIdleConnections()
      if ('code' in outcome) resolve({ code: outcome.code, codeVerifier, redirectUri })
      else reject(outcome.error)
    }

    server.on('error', (error) => settle({ error }))

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address() as AddressInfo
      redirectUri = `http://127.0.0.1:${port}${CALLBACK_PATH}`
      const url = `${GOOGLE_AUTH_URL}?${new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        prompt: 'select_account',
        access_type: 'online'
      })}`
      Promise.resolve()
        .then(() => openExternal(url))
        .catch((error: unknown) => {
          settle({ error: error instanceof Error ? error : new Error(String(error)) })
        })
    })

    function handleRequest(request: IncomingMessage, response: ServerResponse): void {
      const url = new URL(request.url ?? '/', 'http://127.0.0.1')
      if (url.pathname !== CALLBACK_PATH) {
        reply(response, 404, 'text/plain', 'Not found')
        return
      }
      if (settled) {
        reply(response, 410, 'text/plain', 'This sign-in is over')
        return
      }

      const params = url.searchParams
      if (params.get('state') !== state) {
        reply(response, 400, 'text/plain', 'Bad request')
        settle({ error: new Error('Sign-in redirect carried the wrong state') })
        return
      }

      const declined = params.get('error')
      if (declined !== null) {
        reply(response, 200, 'text/html', cancelledPage())
        settle({ error: new SignInCancelledError() })
        return
      }

      const code = params.get('code')
      if (!code) {
        reply(response, 400, 'text/plain', 'Bad request')
        settle({ error: new Error('Sign-in redirect carried no code') })
        return
      }

      reply(response, 200, 'text/html', signedInPage())
      settle({ code })
    }
  })

  return {
    promise,
    cancel: () => settle({ error: new SignInCancelledError() })
  }
}

function reply(response: ServerResponse, status: number, type: string, body: string): void {
  response.writeHead(status, {
    'Content-Type': `${type}; charset=utf-8`,
    'Content-Length': Buffer.byteLength(body),
    Connection: 'close',
    'Cache-Control': 'no-store'
  })
  response.end(body)
}

// ---------------------------------------------------------------------------
// What the browser shows once Google has sent it back. Self-contained: the
// server is gone a moment later, so nothing may be fetched from it.
// ---------------------------------------------------------------------------

function signedInPage(): string {
  return page('You are signed in to Newline', 'You can close this tab and return to the app.')
}

function cancelledPage(): string {
  return page('Sign-in was cancelled', 'You can close this tab. Nothing was changed.')
}

function page(heading: string, detail: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>${heading} · Newline</title>
<style>
  :root { color-scheme: light dark; }
  body {
    margin: 0;
    min-height: 100vh;
    display: grid;
    place-items: center;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    background: #fafafa;
    color: #171717;
  }
  main { max-width: 28rem; padding: 2rem; text-align: center; }
  h1 { margin: 0 0 0.5rem; font-size: 1.25rem; font-weight: 600; }
  p { margin: 0; font-size: 0.9375rem; line-height: 1.5; color: #737373; }
  @media (prefers-color-scheme: dark) {
    body { background: #0a0a0a; color: #fafafa; }
    p { color: #a3a3a3; }
  }
</style>
</head>
<body>
<main>
<h1>${heading}</h1>
<p>${detail}</p>
</main>
</body>
</html>
`
}
