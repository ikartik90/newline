import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { bucket, clientConfigs, resetFakeS3, send, setListPageSize } from './fake-s3'
import {
  MEDIA_PREFIX,
  deleteObject,
  headObject,
  isR2Configured,
  listMediaKeys,
  posterKeyFor,
  publicUrlForKey,
  putObject,
  updateObjectMetadata
} from '../r2'

vi.mock('@aws-sdk/client-s3', () => import('./fake-s3'))

const ENV = {
  MAIN_VITE_R2_ACCOUNT_ID: 'acct',
  MAIN_VITE_R2_ACCESS_KEY_ID: 'ak',
  MAIN_VITE_R2_SECRET_ACCESS_KEY: 'sk',
  MAIN_VITE_R2_BUCKET_NAME: 'bucket',
  MAIN_VITE_R2_PUBLIC_BASE_URL: 'https://cdn.example.com'
}

function configure(overrides: Partial<Record<keyof typeof ENV, string | undefined>> = {}): void {
  for (const [name, value] of Object.entries({ ...ENV, ...overrides })) {
    vi.stubEnv(name, value as string)
  }
}

beforeEach(() => {
  resetFakeS3()
  for (const name of Object.keys(ENV)) vi.stubEnv(name, undefined)
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isR2Configured', () => {
  it('needs every variable, the public base URL included', () => {
    expect(isR2Configured()).toBe(false)
    configure({ MAIN_VITE_R2_PUBLIC_BASE_URL: undefined })
    expect(isR2Configured()).toBe(false)
    configure()
    expect(isR2Configured()).toBe(true)
  })
})

describe('publicUrlForKey', () => {
  it('joins the base URL and the key, or answers null unconfigured', () => {
    expect(publicUrlForKey('media/a.png')).toBeNull()
    configure()
    expect(publicUrlForKey('media/a.png')).toBe('https://cdn.example.com/media/a.png')
    configure({ MAIN_VITE_R2_PUBLIC_BASE_URL: 'https://cdn.example.com/' })
    expect(publicUrlForKey('media/a.png')).toBe('https://cdn.example.com/media/a.png')
  })
})

describe('posterKeyFor', () => {
  it('moves a clip key to the poster corner as a jpg', () => {
    expect(posterKeyFor('media/uuid-clip.mp4')).toBe('posters/uuid-clip.jpg')
    expect(posterKeyFor('media/uuid-noext')).toBe('posters/uuid-noext.jpg')
    expect(posterKeyFor('icons/x.svg')).toBeNull()
  })
})

describe('the client', () => {
  it('is built once for the account endpoint and refuses to run unconfigured', async () => {
    await expect(putObject('media/a.png', new Uint8Array([1]), 'image/png')).rejects.toThrow(
      /not configured/
    )
    configure()
    await putObject('media/a.png', new Uint8Array([1]), 'image/png')
    await putObject('media/b.png', new Uint8Array([2]), 'image/png')
    expect(clientConfigs).toEqual([
      {
        region: 'auto',
        endpoint: 'https://acct.r2.cloudflarestorage.com',
        credentials: { accessKeyId: 'ak', secretAccessKey: 'sk' }
      }
    ])
  })
})

describe('putObject', () => {
  it('stores the bytes with their type and an immutable cache header', async () => {
    configure()
    await putObject('media/a.png', new Uint8Array([1, 2, 3]), 'image/png')
    expect(bucket.get('media/a.png')).toEqual({
      body: new Uint8Array([1, 2, 3]),
      contentType: 'image/png',
      metadata: {},
      cacheControl: 'public, max-age=31536000, immutable'
    })
    expect(send.mock.calls[0][0].input.Bucket).toBe('bucket')
  })
})

describe('updateObjectMetadata', () => {
  it('merges the patch over what is stored, keeping the content type', async () => {
    configure()
    bucket.set('media/a.png', {
      body: new Uint8Array([1]),
      contentType: 'image/png',
      metadata: { filename: 'a.png', alt: 'old' }
    })
    await updateObjectMetadata('media/a.png', { alt: 'new', width: '10' })
    expect(bucket.get('media/a.png')).toEqual({
      body: new Uint8Array([1]),
      contentType: 'image/png',
      metadata: { filename: 'a.png', alt: 'new', width: '10' },
      cacheControl: 'public, max-age=31536000, immutable'
    })
    const copy = send.mock.calls[1][0].input
    expect(copy).toMatchObject({
      Bucket: 'bucket',
      CopySource: 'bucket/media/a.png',
      Key: 'media/a.png',
      MetadataDirective: 'REPLACE'
    })
  })
})

describe('headObject', () => {
  it('reads the size, type and the library metadata', async () => {
    configure()
    bucket.set('media/a.mp4', {
      body: new Uint8Array(4),
      contentType: 'video/mp4',
      metadata: { filename: 'a.mp4', alt: 'A', width: '1', height: '2', poster: 'https://p' }
    })
    expect(await headObject('media/a.mp4')).toEqual({
      size: 4,
      contentType: 'video/mp4',
      metadata: { filename: 'a.mp4', alt: 'A', width: '1', height: '2', poster: 'https://p' },
      filename: 'a.mp4',
      alt: 'A',
      width: '1',
      height: '2',
      poster: 'https://p'
    })
  })
})

describe('listMediaKeys', () => {
  it('lists library objects under the prefix newest-key first, across pages', async () => {
    configure()
    const object = { body: new Uint8Array(1), contentType: 'x', metadata: {} }
    bucket.set('media/1-a.png', object)
    bucket.set('media/2-b.MP4', object)
    bucket.set('media/3-c.txt', object)
    bucket.set('media/4-d.pdf', object)
    bucket.set('posters/1-a.jpg', object)
    setListPageSize(2)
    expect(await listMediaKeys()).toEqual(['media/4-d.pdf', 'media/2-b.MP4', 'media/1-a.png'])
    expect(await listMediaKeys('posters/')).toEqual(['posters/1-a.jpg'])
    expect(MEDIA_PREFIX).toBe('media/')
  })
})

describe('deleteObject', () => {
  it('removes the object', async () => {
    configure()
    bucket.set('media/a.png', { body: new Uint8Array(1), contentType: 'x', metadata: {} })
    await deleteObject('media/a.png')
    expect(bucket.has('media/a.png')).toBe(false)
  })
})
