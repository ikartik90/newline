import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  type CryptoKey,
  type JWTVerifyGetKey
} from 'jose'
import { beforeAll, describe, expect, it } from 'vitest'
import { InvalidGoogleTokenError, verifyGoogleIdToken } from '../auth/google'

const CLIENT_ID = 'client-123.apps.googleusercontent.com'
const KID = 'test-key'

let signingKey: CryptoKey
let strangerKey: CryptoKey
let jwks: JWTVerifyGetKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const stranger = await generateKeyPair('RS256')
  signingKey = pair.privateKey
  strangerKey = stranger.privateKey
  const publicJwk = await exportJWK(pair.publicKey)
  jwks = createLocalJWKSet({ keys: [{ ...publicJwk, kid: KID, alg: 'RS256', use: 'sig' }] })
})

interface SignOptions {
  key?: CryptoKey
  issuer?: string
  audience?: string
  expiresAt?: number | string
  subject?: string | null
}

function sign(claims: Record<string, unknown>, options: SignOptions = {}): Promise<string> {
  const jwt = new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuer(options.issuer ?? 'https://accounts.google.com')
    .setAudience(options.audience ?? CLIENT_ID)
    .setIssuedAt()
    .setExpirationTime(options.expiresAt ?? '1h')
  if (options.subject !== null) jwt.setSubject(options.subject ?? 'google-sub-1')
  return jwt.sign(options.key ?? signingKey)
}

const verifiedClaims = {
  email: 'someone@example.com',
  email_verified: true,
  name: 'Someone',
  picture: 'https://pictures.example/someone.png'
}

describe('verifyGoogleIdToken', () => {
  it('returns the identity from a valid token', async () => {
    const token = await sign(verifiedClaims)

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).resolves.toEqual({
      sub: 'google-sub-1',
      email: 'someone@example.com',
      name: 'Someone',
      picture: 'https://pictures.example/someone.png'
    })
  })

  it('accepts the issuer without a scheme', async () => {
    const token = await sign(verifiedClaims, { issuer: 'accounts.google.com' })

    const identity = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })

    expect(identity.sub).toBe('google-sub-1')
  })

  it('leaves name and picture out when the token has none', async () => {
    const token = await sign({ email: 'bare@example.com', email_verified: true })

    const identity = await verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })

    expect(identity).toEqual({ sub: 'google-sub-1', email: 'bare@example.com' })
  })

  it('rejects a token for another audience', async () => {
    const token = await sign(verifiedClaims, {
      audience: 'someone-else.apps.googleusercontent.com'
    })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects a token from another issuer', async () => {
    const token = await sign(verifiedClaims, { issuer: 'https://accounts.example.com' })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects an expired token', async () => {
    const token = await sign(verifiedClaims, { expiresAt: Math.floor(Date.now() / 1000) - 60 })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects an unverified email', async () => {
    const token = await sign({ ...verifiedClaims, email_verified: false })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects a token without an email', async () => {
    const token = await sign({ email_verified: true })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects a token without a subject', async () => {
    const token = await sign(verifiedClaims, { subject: null })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects a token signed by another key', async () => {
    const token = await sign(verifiedClaims, { key: strangerKey })

    await expect(verifyGoogleIdToken(token, { clientId: CLIENT_ID, jwks })).rejects.toBeInstanceOf(
      InvalidGoogleTokenError
    )
  })

  it('rejects garbage', async () => {
    await expect(
      verifyGoogleIdToken('not-a-jwt', { clientId: CLIENT_ID, jwks })
    ).rejects.toBeInstanceOf(InvalidGoogleTokenError)
  })

  it('refuses to verify against an empty client id', async () => {
    const token = await sign(verifiedClaims)

    await expect(verifyGoogleIdToken(token, { clientId: '', jwks })).rejects.toThrow(
      /GOOGLE_CLIENT_ID/
    )
  })
})
