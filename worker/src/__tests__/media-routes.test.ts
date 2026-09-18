import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import { MAX_IMAGE_UPLOAD_BYTES } from '@shared/domain/media'
import type { App } from '../app'
import type { AppEnv } from '../env'
import { bytesOf, call, ORIGIN, signedInUser, testApp, type SignedInUser } from './helpers'

const PNG_KEY = 'media/0f8fad5b-d9cb-469f-a165-70867728950e-photo.png'

interface MediaObject {
  key: string
  url: string
  size: number
  contentType: string
  metadata: Record<string, string>
}

interface PutOptions {
  contentType?: string
  metadata?: Record<string, unknown>
  headers?: Record<string, string>
  env?: Partial<AppEnv>
  app?: App
}

function put(who: SignedInUser, key: string, body: Uint8Array, options: PutOptions = {}) {
  const headers: Record<string, string> = {
    ...who.auth,
    'content-type': options.contentType ?? 'image/png',
    'content-length': String(body.byteLength),
    ...options.headers
  }
  if (options.metadata) headers['x-media-metadata'] = JSON.stringify(options.metadata)
  return call(
    options.app ?? testApp(),
    `/media/objects/${key}`,
    { method: 'PUT', headers, body },
    options.env
  )
}

async function putOk(who: SignedInUser, key: string, body: Uint8Array, options: PutOptions = {}) {
  const response = await put(who, key, body, options)
  expect(response.status).toBe(200)
  return response.json<MediaObject>()
}

async function usage(who: SignedInUser, envOverrides: Partial<AppEnv> = {}) {
  const response = await call(testApp(), '/media/usage', { headers: who.auth }, envOverrides)
  expect(response.status).toBe(200)
  return response.json<{ bytes: number; quotaBytes: number }>()
}

async function storedBytes(who: SignedInUser, key: string): Promise<string | null> {
  const object = await env.MEDIA.get(`u/${who.user.id}/${key}`)
  return object ? object.text() : null
}

describe('PUT /media/objects/<key>', () => {
  it('stores the bytes, records the object and returns it with its public URL', async () => {
    const who = await signedInUser()

    const object = await putOk(who, PNG_KEY, bytesOf('png-bytes'))

    expect(object).toEqual({
      key: PNG_KEY,
      url: `${ORIGIN}/m/u/${who.user.id}/${PNG_KEY}`,
      size: 9,
      contentType: 'image/png',
      metadata: { filename: 'photo.png' }
    })
    const stored = await env.MEDIA.get(`u/${who.user.id}/${PNG_KEY}`)
    expect(stored?.httpMetadata).toEqual({
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable'
    })
    await expect(stored?.text()).resolves.toBe('png-bytes')
    const row = await env.DB.prepare(
      'SELECT size, content_type, filename FROM media_objects WHERE user_id = ? AND key = ?'
    )
      .bind(who.user.id, PNG_KEY)
      .first()
    expect(row).toEqual({ size: 9, content_type: 'image/png', filename: 'photo.png' })
  })

  it('keeps the metadata the header carries, dimensions as strings', async () => {
    const who = await signedInUser()

    const object = await putOk(who, PNG_KEY, bytesOf('png-bytes'), {
      metadata: { filename: 'Holiday.png', alt: 'The beach', width: 640, height: '480' }
    })

    expect(object.metadata).toEqual({
      filename: 'Holiday.png',
      alt: 'The beach',
      width: '640',
      height: '480'
    })
  })

  it('uses the configured public base URL when there is one', async () => {
    const who = await signedInUser()

    const object = await putOk(who, PNG_KEY, bytesOf('png-bytes'), {
      env: { MEDIA_PUBLIC_BASE_URL: 'https://cdn.example/files/' }
    })

    expect(object.url).toBe(`https://cdn.example/files/u/${who.user.id}/${PNG_KEY}`)
  })

  it('accepts a poster under posters/', async () => {
    const who = await signedInUser()

    const object = await putOk(who, 'posters/clip.jpg', bytesOf('jpeg'), {
      contentType: 'image/jpeg'
    })

    expect(object.key).toBe('posters/clip.jpg')
    expect(object.metadata.filename).toBe('clip.jpg')
  })

  it('accepts a content type with parameters', async () => {
    const who = await signedInUser()

    const object = await putOk(who, 'media/vector.svg', bytesOf('<svg/>'), {
      contentType: 'image/svg+xml; charset=utf-8'
    })

    expect(object.contentType).toBe('image/svg+xml')
  })

  it('overwrites an existing key and adjusts the usage', async () => {
    const who = await signedInUser()
    await putOk(who, PNG_KEY, bytesOf('x'.repeat(100)), { metadata: { alt: 'first' } })

    const object = await putOk(who, PNG_KEY, bytesOf('y'.repeat(40)))

    expect(object.size).toBe(40)
    expect(object.metadata).toEqual({ filename: 'photo.png' })
    await expect(storedBytes(who, PNG_KEY)).resolves.toBe('y'.repeat(40))
    expect((await usage(who)).bytes).toBe(40)
  })

  it('is 413 too_large above the cap for the content type, before reading the body', async () => {
    const who = await signedInUser()
    const declared = String(MAX_IMAGE_UPLOAD_BYTES + 1)

    const image = await put(who, PNG_KEY, bytesOf('tiny'), {
      headers: { 'content-length': declared }
    })
    const video = await put(who, 'media/clip.mp4', bytesOf('tiny'), {
      contentType: 'video/mp4',
      headers: { 'content-length': declared }
    })

    expect(image.status).toBe(413)
    await expect(image.json()).resolves.toEqual({ error: 'too_large' })
    expect(video.status).not.toBe(413)
    await expect(storedBytes(who, PNG_KEY)).resolves.toBeNull()
  })

  it('is 507 quota_exceeded when the upload would cross the quota, storing nothing', async () => {
    const who = await signedInUser()
    const tinyQuota = { MEDIA_QUOTA_BYTES: '100' }
    await putOk(who, 'media/first.png', bytesOf('x'.repeat(60)), { env: tinyQuota })

    const response = await put(who, 'media/second.png', bytesOf('y'.repeat(50)), { env: tinyQuota })

    expect(response.status).toBe(507)
    await expect(response.json()).resolves.toEqual({
      error: 'quota_exceeded',
      bytes: 60,
      quotaBytes: 100
    })
    await expect(storedBytes(who, 'media/second.png')).resolves.toBeNull()
    expect(await usage(who, tinyQuota)).toEqual({ bytes: 60, quotaBytes: 100 })
  })

  it('counts an overwrite against the quota net of the old size', async () => {
    const who = await signedInUser()
    const tinyQuota = { MEDIA_QUOTA_BYTES: '100' }
    await putOk(who, PNG_KEY, bytesOf('x'.repeat(60)), { env: tinyQuota })

    const object = await putOk(who, PNG_KEY, bytesOf('y'.repeat(90)), { env: tinyQuota })

    expect(object.size).toBe(90)
    expect((await usage(who, tinyQuota)).bytes).toBe(90)
  })

  it.each([
    'other/photo.png',
    'media/',
    'media/nested/photo.png',
    'media/.hidden',
    'media/sp ace.png',
    `media/${'a'.repeat(201)}`
  ])('is 400 invalid_key for %s', async (key) => {
    const who = await signedInUser()

    const response = await put(who, key, bytesOf('png-bytes'))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_key' })
  })

  it('is 400 invalid_content_type for a type the app never uploads', async () => {
    const who = await signedInUser()

    const response = await put(who, 'media/notes.txt', bytesOf('hello'), {
      contentType: 'text/plain'
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_content_type' })
  })

  it('is 411 without a Content-Length', async () => {
    const who = await signedInUser()

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, {
      method: 'PUT',
      headers: { ...who.auth, 'content-type': 'image/png' }
    })

    expect(response.status).toBe(411)
  })

  it('is 400 bad_request when the body does not match the declared length', async () => {
    const who = await signedInUser()

    const response = await put(who, PNG_KEY, bytesOf('png-bytes'), {
      headers: { 'content-length': '5' }
    })

    expect(response.status).toBe(400)
    await expect(storedBytes(who, PNG_KEY)).resolves.toBeNull()
  })

  it('is 400 bad_request for metadata that is not a JSON object', async () => {
    const who = await signedInUser()

    const response = await put(who, PNG_KEY, bytesOf('png-bytes'), {
      headers: { 'x-media-metadata': '[1,2]' }
    })

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })
})

describe('GET /media/objects/<key>', () => {
  it('returns the object', async () => {
    const who = await signedInUser()
    const stored = await putOk(who, PNG_KEY, bytesOf('png-bytes'), { metadata: { alt: 'A' } })

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: who.auth })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual(stored)
  })

  it('is 404 not_found for a key the user never stored', async () => {
    const who = await signedInUser()

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: who.auth })

    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ error: 'not_found' })
  })

  it("is 404 not_found for another user's object", async () => {
    const owner = await signedInUser()
    const other = await signedInUser()
    await putOk(owner, PNG_KEY, bytesOf('png-bytes'))

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: other.auth })

    expect(response.status).toBe(404)
  })
})

describe('PATCH /media/objects/<key>', () => {
  function patch(who: SignedInUser, key: string, body: unknown) {
    return call(testApp(), `/media/objects/${key}`, {
      method: 'PATCH',
      headers: { ...who.auth, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
  }

  it('merges the provided fields into the metadata', async () => {
    const who = await signedInUser()
    await putOk(who, PNG_KEY, bytesOf('png-bytes'), { metadata: { alt: 'Before', width: '10' } })

    const response = await patch(who, PNG_KEY, {
      metadata: { alt: 'After', height: '20', poster: 'posters/photo.jpg' }
    })

    expect(response.status).toBe(200)
    const object = await response.json<MediaObject>()
    expect(object.metadata).toEqual({
      filename: 'photo.png',
      alt: 'After',
      width: '10',
      height: '20',
      poster: 'posters/photo.jpg'
    })
    const again = await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: who.auth })
    await expect(again.json()).resolves.toEqual(object)
  })

  it('is 404 not_found for a missing object', async () => {
    const who = await signedInUser()

    const response = await patch(who, PNG_KEY, { metadata: { alt: 'x' } })

    expect(response.status).toBe(404)
  })

  it("is 404 not_found for another user's object and leaves it alone", async () => {
    const owner = await signedInUser()
    const other = await signedInUser()
    await putOk(owner, PNG_KEY, bytesOf('png-bytes'), { metadata: { alt: 'Mine' } })

    const response = await patch(other, PNG_KEY, { metadata: { alt: 'Stolen' } })

    expect(response.status).toBe(404)
    const mine = await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: owner.auth })
    expect((await mine.json<MediaObject>()).metadata.alt).toBe('Mine')
  })

  it.each([
    ['no metadata object', { alt: 'x' }],
    ['a non-string field', { metadata: { alt: 5 } }],
    ['a non-numeric dimension', { metadata: { width: 'wide' } }]
  ])('is 400 bad_request for %s', async (_, body) => {
    const who = await signedInUser()
    await putOk(who, PNG_KEY, bytesOf('png-bytes'))

    const response = await patch(who, PNG_KEY, body)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })
})

describe('DELETE /media/objects/<key>', () => {
  it('removes the bytes and the record', async () => {
    const who = await signedInUser()
    await putOk(who, PNG_KEY, bytesOf('png-bytes'))

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, {
      method: 'DELETE',
      headers: who.auth
    })

    expect(response.status).toBe(204)
    await expect(storedBytes(who, PNG_KEY)).resolves.toBeNull()
    expect((await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: who.auth })).status).toBe(
      404
    )
    expect((await usage(who)).bytes).toBe(0)
  })

  it('is 204 when there is nothing to delete', async () => {
    const who = await signedInUser()

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, {
      method: 'DELETE',
      headers: who.auth
    })

    expect(response.status).toBe(204)
  })

  it("cannot delete another user's object", async () => {
    const owner = await signedInUser()
    const other = await signedInUser()
    await putOk(owner, PNG_KEY, bytesOf('png-bytes'))

    const response = await call(testApp(), `/media/objects/${PNG_KEY}`, {
      method: 'DELETE',
      headers: other.auth
    })

    expect(response.status).toBe(204)
    await expect(storedBytes(owner, PNG_KEY)).resolves.toBe('png-bytes')
    expect(
      (await call(testApp(), `/media/objects/${PNG_KEY}`, { headers: owner.auth })).status
    ).toBe(200)
  })
})

describe('GET /media/objects', () => {
  it('lists the user’s own objects under media/ newest first', async () => {
    let clock = Date.UTC(2026, 8, 1)
    const app = testApp({ now: () => (clock += 1000) })
    const who = await signedInUser()
    const other = await signedInUser()
    await putOk(who, 'media/first.png', bytesOf('1'), { app })
    await putOk(who, 'media/second.png', bytesOf('22'), { app })
    await putOk(who, 'posters/second.jpg', bytesOf('333'), { app, contentType: 'image/jpeg' })
    await putOk(other, 'media/theirs.png', bytesOf('4444'), { app })

    const response = await call(app, '/media/objects', { headers: who.auth })

    expect(response.status).toBe(200)
    const { objects } = await response.json<{ objects: MediaObject[] }>()
    expect(objects.map((o) => o.key)).toEqual(['media/second.png', 'media/first.png'])
    expect(objects[0]).toEqual({
      key: 'media/second.png',
      url: `${ORIGIN}/m/u/${who.user.id}/media/second.png`,
      size: 2,
      contentType: 'image/png',
      metadata: { filename: 'second.png' }
    })
  })

  it('filters by prefix', async () => {
    const who = await signedInUser()
    await putOk(who, 'media/photo.png', bytesOf('1'))
    await putOk(who, 'posters/clip.jpg', bytesOf('22'), { contentType: 'image/jpeg' })

    const response = await call(testApp(), '/media/objects?prefix=posters/', { headers: who.auth })

    const { objects } = await response.json<{ objects: MediaObject[] }>()
    expect(objects.map((o) => o.key)).toEqual(['posters/clip.jpg'])
  })

  it('is empty for a user with nothing stored', async () => {
    const who = await signedInUser()

    const response = await call(testApp(), '/media/objects', { headers: who.auth })

    await expect(response.json()).resolves.toEqual({ objects: [] })
  })
})

describe('GET /media/usage', () => {
  it('reports the bytes used and the default quota', async () => {
    const who = await signedInUser()
    await putOk(who, 'media/a.png', bytesOf('12345'))
    await putOk(who, 'media/b.png', bytesOf('678'))

    expect(await usage(who)).toEqual({ bytes: 8, quotaBytes: 8 * 1024 * 1024 * 1024 })
  })

  it('reports the configured quota', async () => {
    const who = await signedInUser()

    expect(await usage(who, { MEDIA_QUOTA_BYTES: '1024' })).toEqual({ bytes: 0, quotaBytes: 1024 })
  })
})

describe('without a session', () => {
  it.each([
    ['GET', '/media/usage'],
    ['GET', '/media/objects'],
    ['GET', `/media/objects/${PNG_KEY}`],
    ['PUT', `/media/objects/${PNG_KEY}`],
    ['PATCH', `/media/objects/${PNG_KEY}`],
    ['DELETE', `/media/objects/${PNG_KEY}`]
  ])('%s %s is 401 unauthorized', async (method, path) => {
    const anonymous = await call(testApp(), path, { method })
    const forged = await call(testApp(), path, {
      method,
      headers: { authorization: 'Bearer nobody-minted-this' }
    })

    expect(anonymous.status).toBe(401)
    await expect(anonymous.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(forged.status).toBe(401)
  })
})
