import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import type { MediaAsset } from '@shared/domain/media'
import { getDb } from '../../db/database'
import * as media from '../media'
import * as notes from '../notes'
import { bucket, failWith, resetFakeS3 } from './fake-s3'

vi.mock('@aws-sdk/client-s3', () => import('./fake-s3'))

vi.mock('electron', async () => {
  const { mkdtempSync } = await import('fs')
  const { tmpdir } = await import('os')
  const { join } = await import('path')
  const userData = mkdtempSync(join(tmpdir(), 'newline-media-'))
  return { app: { getPath: () => userData } }
})

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

const ENV = {
  MAIN_VITE_R2_ACCOUNT_ID: 'acct',
  MAIN_VITE_R2_ACCESS_KEY_ID: 'ak',
  MAIN_VITE_R2_SECRET_ACCESS_KEY: 'sk',
  MAIN_VITE_R2_BUCKET_NAME: 'bucket',
  MAIN_VITE_R2_PUBLIC_BASE_URL: 'https://cdn.example.com'
}

function configureR2(): void {
  for (const [name, value] of Object.entries(ENV)) vi.stubEnv(name, value)
}

const userData = app.getPath('userData')
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47])

function upload(overrides: Partial<media.MediaUploadInput> = {}): Promise<MediaAsset> {
  return media.saveMedia({
    filename: 'My Photo.png',
    contentType: 'image/png',
    bytes: png,
    width: 640,
    height: 480,
    ...overrides
  })
}

function noteWithSrc(src: string): string {
  return serializeDocument({ type: 'doc', content: [{ type: 'media', kind: 'image', src }] })
}

beforeEach(() => {
  resetFakeS3()
  for (const name of Object.keys(ENV)) vi.stubEnv(name, undefined)
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM media_assets')
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('saveMedia', () => {
  it('rejects a type the library does not take, and a file too large', async () => {
    await expect(upload({ contentType: 'text/plain' })).rejects.toThrow()
    await expect(upload({ bytes: new Uint8Array(10 * 1024 * 1024 + 1) })).rejects.toThrow(
      /too large/
    )
  })

  it('keeps the file on this machine when R2 is not configured', async () => {
    const asset = await upload()
    expect(asset.key).toMatch(/^media\/[0-9a-f-]{36}-My-Photo\.png$/)
    const file = asset.key.slice('media/'.length)
    expect(asset).toEqual({
      key: asset.key,
      url: `local://${file}`,
      filename: 'My-Photo.png',
      contentType: 'image/png',
      size: 4,
      width: 640,
      height: 480
    })
    expect(readFileSync(join(userData, 'media', file))).toEqual(Buffer.from(png))
    expect(media.getMediaPath(file)).toBe(join(userData, 'media', file))

    const row = getDb().prepare('SELECT * FROM media_assets WHERE key = ?').get(asset.key)
    expect(row).toMatchObject({
      url: `local://${file}`,
      local_path: join(userData, 'media', file),
      uploaded_at: null
    })
    expect(bucket.size).toBe(0)
  })

  it('uploads and stamps the object when R2 is configured', async () => {
    configureR2()
    const asset = await upload()
    expect(asset.url).toBe(`https://cdn.example.com/${asset.key}`)
    expect(bucket.get(asset.key)).toMatchObject({
      body: Buffer.from(png),
      contentType: 'image/png',
      metadata: { filename: 'My-Photo.png', width: '640', height: '480' }
    })
    const row = getDb()
      .prepare('SELECT url, uploaded_at FROM media_assets WHERE key = ?')
      .get(asset.key) as { url: string; uploaded_at: number | null }
    expect(row.url).toBe(asset.url)
    expect(row.uploaded_at).not.toBeNull()
  })

  it('falls back to the local copy when the upload fails', async () => {
    configureR2()
    failWith(new Error('offline'))
    const asset = await upload()
    expect(asset.url).toMatch(/^local:\/\//)
    const row = getDb()
      .prepare('SELECT uploaded_at FROM media_assets WHERE key = ?')
      .get(asset.key) as { uploaded_at: number | null }
    expect(row.uploaded_at).toBeNull()
  })
})

describe('flushPending', () => {
  it('does nothing unconfigured', async () => {
    await upload()
    expect(await media.flushPending()).toBe(0)
    expect(bucket.size).toBe(0)
  })

  it('uploads what is still local and rewrites the notes that use it', async () => {
    const asset = await upload()
    const other = await upload({ filename: 'other.png' })
    const note = notes.createNote('N', noteWithSrc(asset.url))
    const untouched = notes.createNote('U', noteWithSrc('https://elsewhere/x.png'))
    notes.markSynced(note.id)
    notes.markSynced(untouched.id)

    configureR2()
    expect(await media.flushPending()).toBe(2)

    expect(bucket.has(asset.key)).toBe(true)
    expect(bucket.has(other.key)).toBe(true)
    const publicUrl = `https://cdn.example.com/${asset.key}`
    expect(parseDocument(notes.getNote(note.id)!.body).content).toEqual([
      { type: 'media', kind: 'image', src: publicUrl }
    ])
    expect(parseDocument(notes.getNote(untouched.id)!.body).content).toEqual([
      { type: 'media', kind: 'image', src: 'https://elsewhere/x.png' }
    ])
    expect(notes.getDirtyNotes().map((n) => n.id)).toEqual([note.id])

    const rows = getDb().prepare('SELECT url, uploaded_at FROM media_assets').all() as {
      url: string
      uploaded_at: number | null
    }[]
    expect(rows.every((r) => r.url.startsWith('https://') && r.uploaded_at !== null)).toBe(true)
    expect(await media.flushPending()).toBe(0)
  })

  it('leaves a row local when its upload fails', async () => {
    await upload()
    configureR2()
    failWith(new Error('offline'))
    expect(await media.flushPending()).toBe(0)
    failWith(null)
    expect(await media.flushPending()).toBe(1)
  })
})

describe('listMedia', () => {
  it('lists local rows newest first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_000)
    const first = await upload({ filename: 'first.png' })
    vi.setSystemTime(2_000)
    const second = await upload({ filename: 'second.png' })
    vi.useRealTimers()
    expect((await media.listMedia()).map((a) => a.key)).toEqual([second.key, first.key])
  })

  it('merges objects the bucket holds that this machine never saw', async () => {
    configureR2()
    const mine = await upload()
    bucket.set('media/0b1d0e0c-1111-4222-8333-444444444444-remote.png', {
      body: new Uint8Array(7),
      contentType: 'image/png',
      metadata: { filename: 'Remote picture', alt: 'R', width: '10', height: 'nope' }
    })
    bucket.set('posters/0b1d0e0c-1111-4222-8333-444444444444-remote.jpg', {
      body: new Uint8Array(1),
      contentType: 'image/jpeg',
      metadata: {}
    })
    expect(await media.listMedia()).toEqual([
      mine,
      {
        key: 'media/0b1d0e0c-1111-4222-8333-444444444444-remote.png',
        url: 'https://cdn.example.com/media/0b1d0e0c-1111-4222-8333-444444444444-remote.png',
        filename: 'Remote picture',
        contentType: 'image/png',
        size: 7,
        alt: 'R',
        width: 10
      }
    ])
  })

  it('still answers with the local rows when the bucket cannot be reached', async () => {
    configureR2()
    const mine = await upload()
    failWith(new Error('offline'))
    expect(await media.listMedia()).toEqual([mine])
  })
})

describe('updateAlt / rename', () => {
  it('updates the row, and the object once it has been uploaded', async () => {
    const local = await upload()
    expect((await media.updateAlt(local.key, 'A cat')).alt).toBe('A cat')

    configureR2()
    const uploaded = await upload()
    const withAlt = await media.updateAlt(uploaded.key, 'A dog')
    expect(withAlt.alt).toBe('A dog')
    expect(bucket.get(uploaded.key)?.metadata).toMatchObject({ alt: 'A dog' })

    const renamed = await media.rename(uploaded.key, '  Fancy  nameé ')
    expect(renamed.filename).toBe('Fancy namee')
    expect(bucket.get(uploaded.key)?.metadata.filename).toBe('Fancy namee')
    expect((await media.listMedia()).find((a) => a.key === uploaded.key)).toEqual(renamed)
  })

  it('works on an object only the bucket knows', async () => {
    configureR2()
    const key = 'media/0b1d0e0c-1111-4222-8333-444444444444-remote.png'
    bucket.set(key, { body: new Uint8Array(1), contentType: 'image/png', metadata: {} })
    expect((await media.updateAlt(key, 'alt')).alt).toBe('alt')
    expect((await media.rename(key, 'name')).filename).toBe('name')
    expect(bucket.get(key)?.metadata).toEqual({ alt: 'alt', filename: 'name' })
  })

  it('refuses a key outside the library', async () => {
    await expect(media.updateAlt('icons/x.svg', 'a')).rejects.toThrow(/Invalid media key/)
  })
})

describe('uploadPoster', () => {
  it('stores the still beside the clip and stamps the clip with it', async () => {
    configureR2()
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    const still = new Uint8Array([0xff, 0xd8])
    const url = await media.uploadPoster(clip.key, still)
    const posterKey = clip.key.replace('media/', 'posters/').replace(/\.mp4$/, '.jpg')
    expect(url).toBe(`https://cdn.example.com/${posterKey}`)
    expect(bucket.get(posterKey)?.contentType).toBe('image/jpeg')
    expect([...bucket.get(posterKey)!.body]).toEqual([0xff, 0xd8])
    expect(bucket.get(clip.key)?.metadata.poster).toBe(url)
    expect(existsSync(join(userData, 'media', posterKey.slice('posters/'.length)))).toBe(true)
    expect((await media.listMedia())[0].poster).toBe(url)
  })

  it('keeps the still local when R2 is not configured, and refuses a foreign key', async () => {
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    const url = await media.uploadPoster(clip.key, new Uint8Array([1]))
    expect(url).toMatch(/^local:\/\/[0-9a-f-]{36}-clip\.jpg$/)
    expect(await media.uploadPoster('icons/x.svg', new Uint8Array([1]))).toBeNull()
  })
})

describe('deleteMedia', () => {
  it('removes the row, the files and the objects', async () => {
    configureR2()
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    await media.uploadPoster(clip.key, new Uint8Array([1]))
    const file = clip.key.slice('media/'.length)

    await media.deleteMedia(clip.key)

    expect(bucket.size).toBe(0)
    expect(existsSync(join(userData, 'media', file))).toBe(false)
    expect(existsSync(join(userData, 'media', file.replace(/\.mp4$/, '.jpg')))).toBe(false)
    expect(await media.listMedia()).toEqual([])
  })

  it('leaves the local copy in place when the bucket refuses', async () => {
    configureR2()
    const asset = await upload()
    failWith(new Error('offline'))
    await expect(media.deleteMedia(asset.key)).rejects.toThrow('offline')
    expect(await media.listMedia()).toEqual([asset])
  })
})

describe('getMediaPath', () => {
  it('serves the media dir, then the legacy images dir, and never a path outside', () => {
    const legacy = join(userData, 'images')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'old.png'), 'x')
    expect(media.getMediaPath('old.png')).toBe(join(legacy, 'old.png'))
    expect(media.getMediaPath('missing.png')).toBeNull()
    expect(media.getMediaPath('../notes.db')).toBeNull()
    expect(media.getMediaPath('a/b.png')).toBeNull()
  })
})
