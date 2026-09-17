import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'

export const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs'
export const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com']

export interface GoogleIdentity {
  sub: string
  email: string
  name?: string
  picture?: string
}

export interface VerifyGoogleIdTokenOptions {
  /** The OAuth client the app signs in with; the token's `aud` must equal it. */
  clientId: string
  /** Google's signing keys — remote in production, a local set in tests. */
  jwks: JWTVerifyGetKey
}

/** The token is not one Google issued for us, or its holder's email is unverified. */
export class InvalidGoogleTokenError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = 'InvalidGoogleTokenError'
  }
}

/** Google's published keys, cached and refreshed by jose between calls. */
export function googleJwks(): JWTVerifyGetKey {
  return createRemoteJWKSet(new URL(GOOGLE_JWKS_URL))
}

export async function verifyGoogleIdToken(
  token: string,
  { clientId, jwks }: VerifyGoogleIdTokenOptions
): Promise<GoogleIdentity> {
  // jose skips the audience check for an empty string; never let that happen silently.
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not configured')

  let payload
  try {
    ;({ payload } = await jwtVerify(token, jwks, { issuer: GOOGLE_ISSUERS, audience: clientId }))
  } catch (cause) {
    throw new InvalidGoogleTokenError('Google id token failed verification', { cause })
  }

  if (payload.email_verified !== true) throw new InvalidGoogleTokenError('email is not verified')
  if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
    throw new InvalidGoogleTokenError('token has no subject')
  }
  if (typeof payload.email !== 'string' || payload.email.length === 0) {
    throw new InvalidGoogleTokenError('token has no email')
  }

  const identity: GoogleIdentity = { sub: payload.sub, email: payload.email }
  if (typeof payload.name === 'string') identity.name = payload.name
  if (typeof payload.picture === 'string') identity.picture = payload.picture
  return identity
}
