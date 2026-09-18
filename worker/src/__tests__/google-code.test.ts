import { describe, expect, it } from 'vitest'
import { exchangeGoogleCode, InvalidGoogleCodeError } from '../auth/google-code'

const grant = {
  code: '4/0AbCdEfGhIjKlMnOpQrStUvWxYz',
  codeVerifier: 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk',
  redirectUri: 'http://127.0.0.1:51823/callback'
}
const client = { clientId: 'client-123.apps.googleusercontent.com', clientSecret: 'GOCSPX-secret' }

interface SeenRequest {
  url?: string
  method?: string
  contentType?: string | null
  body?: string
}

/**
 * A `fetch` standing in for Google's token endpoint: it answers with `status`
 * and `answer` (JSON when an object), and records what it was sent in `seen`.
 */
function googleAnswers(status: number, answer: object | string) {
  const seen: SeenRequest = {}
  const fetchImpl: typeof fetch = async (input, init) => {
    const request = new Request(input, init)
    seen.url = request.url
    seen.method = request.method
    seen.contentType = request.headers.get('content-type')
    // Decoded by hand: workerd warns when `.text()` is called on a form-encoded body.
    seen.body = new TextDecoder().decode(await request.arrayBuffer())
    return typeof answer === 'string'
      ? new Response(answer, { status })
      : Response.json(answer, { status })
  }
  return { fetchImpl, seen }
}

describe('exchangeGoogleCode', () => {
  it('posts the code with the client secret to the token endpoint and returns the id token', async () => {
    const { fetchImpl, seen } = googleAnswers(200, {
      access_token: 'ya29.access',
      expires_in: 3599,
      id_token: 'eyJ.id.token',
      scope: 'openid email profile',
      token_type: 'Bearer'
    })

    await expect(exchangeGoogleCode(grant, client, fetchImpl)).resolves.toEqual({
      idToken: 'eyJ.id.token'
    })

    expect(seen.url).toBe('https://oauth2.googleapis.com/token')
    expect(seen.method).toBe('POST')
    expect(seen.contentType).toMatch(/^application\/x-www-form-urlencoded/)
    expect(Object.fromEntries(new URLSearchParams(seen.body))).toEqual({
      client_id: client.clientId,
      client_secret: client.clientSecret,
      code: grant.code,
      code_verifier: grant.codeVerifier,
      redirect_uri: grant.redirectUri,
      grant_type: 'authorization_code'
    })
  })

  it('throws InvalidGoogleCodeError, naming the reason, when Google refuses the code', async () => {
    const { fetchImpl } = googleAnswers(400, {
      error: 'invalid_grant',
      error_description: 'Malformed auth code.'
    })

    const attempt = exchangeGoogleCode(grant, client, fetchImpl)

    await expect(attempt).rejects.toBeInstanceOf(InvalidGoogleCodeError)
    await expect(attempt).rejects.toThrow(/invalid_grant/)
  })

  it('throws InvalidGoogleCodeError when a refusal carries no JSON', async () => {
    const { fetchImpl } = googleAnswers(502, '<html>Bad Gateway</html>')

    await expect(exchangeGoogleCode(grant, client, fetchImpl)).rejects.toBeInstanceOf(
      InvalidGoogleCodeError
    )
  })

  it('throws InvalidGoogleCodeError when a success answer has no id_token', async () => {
    const { fetchImpl } = googleAnswers(200, { access_token: 'ya29.access', token_type: 'Bearer' })

    await expect(exchangeGoogleCode(grant, client, fetchImpl)).rejects.toBeInstanceOf(
      InvalidGoogleCodeError
    )
  })

  it('throws InvalidGoogleCodeError when a success answer is not JSON', async () => {
    const { fetchImpl } = googleAnswers(200, 'id_token=eyJ.id.token')

    await expect(exchangeGoogleCode(grant, client, fetchImpl)).rejects.toBeInstanceOf(
      InvalidGoogleCodeError
    )
  })

  it('lets a network failure through untouched', async () => {
    const offline: typeof fetch = async () => {
      throw new TypeError('fetch failed')
    }

    await expect(exchangeGoogleCode(grant, client, offline)).rejects.toThrow(TypeError)
  })
})
