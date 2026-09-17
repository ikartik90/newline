import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getSessionToken } from '../session'
import {
  MEDIA_PREFIX,
  POSTER_PREFIX,
  deleteObject,
  getObject,
  isMediaApiAvailable,
  listObjects,
  patchObject,
  posterKeyFor,
  putObject,
  type MediaObject
} from '../media-api'

vi.mock('../session', () => ({ getSessionToken: vi.fn((): string | null => 'session-token') }))

const fetchMock = vi.fn<typeof fetch>()

const object: MediaObject = {
  key: 'media/0b1d0e0c-1111-4222-8333-444444444444-photo.png',
  url: 'https://api.example.com/m/u/u-1/media/0b1d0e0c-1111-4222-8333-444444444444-photo.png',
  size: 4,
  contentType: 'image/png',
  metadata: { filename: 'photo.png', width: '640', height: '480' }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function lastRequest(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAIN_VITE_API_URL', 'https://api.example.com')
  fetchMock.mockReset()
  vi.mocked(getSessionToken).mockReturnValue('session-token')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('isMediaApiAvailable', () => {
  it('needs the base URL and a session both', () => {
    expect(isMediaApiAvailable()).toBe(true)
    vi.mocked(getSessionToken).mockReturnValue(null)
    expect(isMediaApiAvailable()).toBe(false)
    vi.mocked(getSessionToken).mockReturnValue('session-token')
    vi.stubEnv('MAIN_VITE_API_URL', undefined)
    expect(isMediaApiAvailable()).toBe(false)
  })
})

describe('posterKeyFor', () => {
  it('moves a clip key to the poster corner as a jpg', () => {
    expect(posterKeyFor('media/uuid-clip.mp4')).toBe('posters/uuid-clip.jpg')
    expect(posterKeyFor('media/uuid-noext')).toBe('posters/uuid-noext.jpg')
    expect(posterKeyFor('icons/x.svg')).toBeNull()
    expect(MEDIA_PREFIX).toBe('media/')
    expect(POSTER_PREFIX).toBe('posters/')
  })
})

describe('putObject', () => {
  it('PUTs the bytes under the key with their type and the metadata header', async () => {
    fetchMock.mockResolvedValue(json(object))
    const bytes = new Uint8Array([1, 2, 3, 4])
    const result = await putObject(object.key, bytes, 'image/png', {
      filename: 'photo.png',
      width: '640',
      height: '480'
    })
    expect(result).toEqual(object)
    const { url, init, headers } = lastRequest()
    expect(url).toBe(`https://api.example.com/media/objects/${object.key}`)
    expect(init.method).toBe('PUT')
    expect(init.body).toBe(bytes)
    expect(headers.get('Content-Type')).toBe('image/png')
    expect(headers.get('Authorization')).toBe('Bearer session-token')
    expect(JSON.parse(headers.get('X-Media-Metadata')!)).toEqual({
      filename: 'photo.png',
      width: '640',
      height: '480'
    })
  })

  it('sends no metadata header when there is no metadata', async () => {
    fetchMock.mockResolvedValue(json(object))
    await putObject('posters/uuid-clip.jpg', new Uint8Array([1]), 'image/jpeg')
    expect(lastRequest().headers.has('X-Media-Metadata')).toBe(false)
  })

  it('surfaces the Worker refusing the upload', async () => {
    fetchMock.mockResolvedValue(json({ error: 'quota_exceeded', bytes: 1, quotaBytes: 1 }, 507))
    await expect(putObject(object.key, new Uint8Array([1]), 'image/png')).rejects.toMatchObject({
      status: 507,
      code: 'quota_exceeded'
    })
  })
})

describe('getObject', () => {
  it('GETs the object', async () => {
    fetchMock.mockResolvedValue(json(object))
    expect(await getObject(object.key)).toEqual(object)
    const { url, init } = lastRequest()
    expect(url).toBe(`https://api.example.com/media/objects/${object.key}`)
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('answers null for a key the store does not hold', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, 404))
    expect(await getObject('media/missing.png')).toBeNull()
  })

  it('lets any other failure through', async () => {
    fetchMock.mockResolvedValue(json({ error: 'unauthorized' }, 401))
    await expect(getObject(object.key)).rejects.toMatchObject({ status: 401 })
  })
})

describe('patchObject', () => {
  it('PATCHes the metadata as JSON and answers with the merged object', async () => {
    const merged = { ...object, metadata: { ...object.metadata, alt: 'A cat' } }
    fetchMock.mockResolvedValue(json(merged))
    expect(await patchObject(object.key, { alt: 'A cat' })).toEqual(merged)
    const { url, init, headers } = lastRequest()
    expect(url).toBe(`https://api.example.com/media/objects/${object.key}`)
    expect(init.method).toBe('PATCH')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(JSON.parse(init.body as string)).toEqual({ metadata: { alt: 'A cat' } })
  })

  it('surfaces a missing object', async () => {
    fetchMock.mockResolvedValue(json({ error: 'not_found' }, 404))
    await expect(patchObject('media/missing.png', { alt: 'x' })).rejects.toMatchObject({
      status: 404,
      code: 'not_found'
    })
  })
})

describe('listObjects', () => {
  it('lists the library by default, in the order the Worker gives', async () => {
    const older = { ...object, key: 'media/0a-older.png' }
    fetchMock.mockResolvedValue(json({ objects: [object, older] }))
    expect(await listObjects()).toEqual([object, older])
    const { url, init } = lastRequest()
    expect(url).toBe('https://api.example.com/media/objects?prefix=media%2F')
    expect(init.method ?? 'GET').toBe('GET')
  })

  it('lists another corner on request', async () => {
    fetchMock.mockResolvedValue(json({ objects: [] }))
    expect(await listObjects(POSTER_PREFIX)).toEqual([])
    expect(lastRequest().url).toBe('https://api.example.com/media/objects?prefix=posters%2F')
  })
})

describe('deleteObject', () => {
  it('DELETEs the key and resolves to nothing', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
    await expect(deleteObject(object.key)).resolves.toBeUndefined()
    const { url, init, headers } = lastRequest()
    expect(url).toBe(`https://api.example.com/media/objects/${object.key}`)
    expect(init.method).toBe('DELETE')
    expect(headers.get('Authorization')).toBe('Bearer session-token')
  })

  it('surfaces a failure', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'))
    await expect(deleteObject(object.key)).rejects.toThrow('fetch failed')
  })
})
