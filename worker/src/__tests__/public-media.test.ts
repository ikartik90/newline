import { SELF } from 'cloudflare:test'
import { env } from 'cloudflare:workers'
import { beforeAll, describe, expect, it } from 'vitest'
import { bytesOf } from './helpers'

const USER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const KEY = 'media/0f8fad5b-d9cb-469f-a165-70867728950e-photo.png'
const CONTENT = '0123456789abcdef'
const URL_OF = (key: string) => `https://newline-api.example/m/u/${USER_ID}/${key}`

/** The body as text without workerd warning that an image is not text. */
async function bodyText(response: Response): Promise<string> {
  return new TextDecoder().decode(await response.arrayBuffer())
}

beforeAll(async () => {
  await env.MEDIA.put(`u/${USER_ID}/${KEY}`, bytesOf(CONTENT), {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' }
  })
})

describe('GET /m/u/<userId>/<key>', () => {
  it('serves the bytes with the immutable cache header', async () => {
    const response = await SELF.fetch(URL_OF(KEY))

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-length')).toBe(String(CONTENT.length))
    expect(response.headers.get('etag')).toMatch(/^"[^"]+"$/)
    await expect(bodyText(response)).resolves.toBe(CONTENT)
  })

  it('honours a byte range with 206', async () => {
    const response = await SELF.fetch(URL_OF(KEY), { headers: { range: 'bytes=2-5' } })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 2-5/${CONTENT.length}`)
    expect(response.headers.get('content-length')).toBe('4')
    await expect(bodyText(response)).resolves.toBe('2345')
  })

  it('honours an open-ended range', async () => {
    const response = await SELF.fetch(URL_OF(KEY), { headers: { range: 'bytes=12-' } })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 12-15/${CONTENT.length}`)
    await expect(bodyText(response)).resolves.toBe('cdef')
  })

  it('honours a suffix range', async () => {
    const response = await SELF.fetch(URL_OF(KEY), { headers: { range: 'bytes=-3' } })

    expect(response.status).toBe(206)
    expect(response.headers.get('content-range')).toBe(`bytes 13-15/${CONTENT.length}`)
    await expect(bodyText(response)).resolves.toBe('def')
  })

  it('is 304 when the ETag still matches', async () => {
    const etag = (await SELF.fetch(URL_OF(KEY))).headers.get('etag')!

    const response = await SELF.fetch(URL_OF(KEY), { headers: { 'if-none-match': etag } })

    expect(response.status).toBe(304)
    expect(response.headers.get('etag')).toBe(etag)
    await expect(bodyText(response)).resolves.toBe('')
  })

  it('answers HEAD with the headers and no body', async () => {
    const response = await SELF.fetch(URL_OF(KEY), { method: 'HEAD' })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('image/png')
    expect(response.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    await expect(bodyText(response)).resolves.toBe('')
  })

  it('is 404 for an object that does not exist', async () => {
    const response = await SELF.fetch(URL_OF('media/missing.png'))

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it('is 404 for a key outside the media and posters prefixes', async () => {
    await env.MEDIA.put(`u/${USER_ID}/secret/x.png`, bytesOf('x'))

    const response = await SELF.fetch(URL_OF('secret/x.png'))

    expect(response.status).toBe(404)
  })

  it('is 404 for a traversal-shaped key', async () => {
    const response = await SELF.fetch(`https://newline-api.example/m/u/${USER_ID}/media/..%2Fx.png`)

    expect(response.status).toBe(404)
  })

  it('needs no session', async () => {
    const response = await SELF.fetch(URL_OF(KEY), { headers: { authorization: 'Bearer junk' } })

    expect(response.status).toBe(200)
  })
})
