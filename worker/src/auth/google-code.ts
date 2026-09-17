import { isRecord } from '../http'

export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'

/** What the app collected on its loopback redirect. */
export interface GoogleCodeGrant {
  code: string
  /** The PKCE verifier the app generated before opening the consent screen. */
  codeVerifier: string
  /** The loopback URL the code was issued for, verbatim. */
  redirectUri: string
}

/** The OAuth client; the secret never leaves the Worker. */
export interface GoogleClientConfig {
  clientId: string
  clientSecret: string
}

/** Google refused the exchange, or answered it without an ID token. */
export class InvalidGoogleCodeError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidGoogleCodeError'
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return undefined
  }
}

/** Trades an authorization code for the ID token Google issues with it. */
export async function exchangeGoogleCode(
  { code, codeVerifier, redirectUri }: GoogleCodeGrant,
  { clientId, clientSecret }: GoogleClientConfig,
  fetchImpl: typeof fetch = fetch
): Promise<{ idToken: string }> {
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: 'POST',
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      code_verifier: codeVerifier,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    })
  })
  const answer = await readJson(response)

  if (!response.ok) {
    const reason =
      isRecord(answer) && typeof answer.error === 'string'
        ? answer.error
        : `HTTP ${response.status}`
    throw new InvalidGoogleCodeError(`Google refused the code exchange: ${reason}`)
  }
  if (!isRecord(answer) || typeof answer.id_token !== 'string' || answer.id_token.length === 0) {
    throw new InvalidGoogleCodeError('Google answered the code exchange without an id_token')
  }
  return { idToken: answer.id_token }
}
