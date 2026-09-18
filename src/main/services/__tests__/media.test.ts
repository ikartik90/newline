import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import type { MediaAsset } from '@shared/domain/media'
import { getDb } from '../../db/database'
import * as media from '../media'
import * as notes from '../notes'
import { PUBLIC_BASE, failWith, resetFakeMediaApi, setAvailable, store } from './fake-media-api'

vi.mock('../media-api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../media-api')>()),
  ...(await import('./fake-media-api'))
}))

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

/** The app has a base URL and a session: uploads go to the Worker. */
function connect(): void {
  setAvailable(true)
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
  resetFakeMediaApi()
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM media_assets')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('saveMedia', () => {
  it('rejects a type the library does not take, and a file too large', async () => {
    await expect(upload({ contentType: 'text/plain' })).rejects.toThrow()
    await expect(upload({ bytes: new Uint8Array(10 * 1024 * 1024 + 1) })).rejects.toThrow(
      /too large/
    )
  })

  it('keeps the file on this machine when the Worker is not available', async () => {
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
    expect(store.size).toBe(0)
  })

  it('uploads the object with its metadata in one PUT when the Worker is available', async () => {
    connect()
    const asset = await upload()
    expect(asset.url).toBe(`${PUBLIC_BASE}/${asset.key}`)
    expect(store.get(asset.key)).toEqual({
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
    connect()
    failWith(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const asset = await upload()
    expect(asset.url).toMatch(/^local:\/\//)
    const row = getDb()
      .prepare('SELECT uploaded_at FROM media_assets WHERE key = ?')
      .get(asset.key) as { uploaded_at: number | null }
    expect(row.uploaded_at).toBeNull()
  })
})

describe('flushPending', () => {
  it('does nothing while the Worker is not available', async () => {
    await upload()
    expect(await media.flushPending()).toBe(0)
    expect(store.size).toBe(0)
  })

  it('uploads what is still local and rewrites the notes that use it', async () => {
    const asset = await upload()
    const other = await upload({ filename: 'other.png' })
    const note = notes.createNote('N', noteWithSrc(asset.url))
    const untouched = notes.createNote('U', noteWithSrc('https://elsewhere/x.png'))
    notes.markSynced(note.id)
    notes.markSynced(untouched.id)

    connect()
    expect(await media.flushPending()).toBe(2)

    expect(store.has(asset.key)).toBe(true)
    expect(store.has(other.key)).toBe(true)
    const publicUrl = `${PUBLIC_BASE}/${asset.key}`
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
    connect()
    failWith(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await media.flushPending()).toBe(0)
    failWith(null)
    expect(await media.flushPending()).toBe(1)
  })

  it('sends a still taken while its clip was local, after the clip', async () => {
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    const stillUrl = await media.uploadPoster(clip.key, new Uint8Array([0xff, 0xd8]))
    const note = notes.createNote('N', noteWithSrc(stillUrl!))
    notes.markSynced(note.id)

    connect()
    expect(await media.flushPending()).toBe(1)
    const posterKey = clip.key.replace('media/', 'posters/').replace(/\.mp4$/, '.jpg')
    expect(store.get(posterKey)?.contentType).toBe('image/jpeg')
    expect(store.get(clip.key)?.metadata.poster).toBe(`${PUBLIC_BASE}/${posterKey}`)
    expect((await media.listMedia())[0].poster).toBe(`${PUBLIC_BASE}/${posterKey}`)
    expect(parseDocument(notes.getNote(note.id)!.body).content).toEqual([
      { type: 'media', kind: 'image', src: `${PUBLIC_BASE}/${posterKey}` }
    ])
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

  it('merges objects the Worker holds that this machine never saw', async () => {
    connect()
    const mine = await upload()
    store.set('media/0b1d0e0c-1111-4222-8333-444444444444-remote.png', {
      body: new Uint8Array(7),
      contentType: 'image/png',
      metadata: { filename: 'Remote picture', alt: 'R', width: '10', height: 'nope' }
    })
    store.set('posters/0b1d0e0c-1111-4222-8333-444444444444-remote.jpg', {
      body: new Uint8Array(1),
      contentType: 'image/jpeg',
      metadata: {}
    })
    expect(await media.listMedia()).toEqual([
      mine,
      {
        key: 'media/0b1d0e0c-1111-4222-8333-444444444444-remote.png',
        url: `${PUBLIC_BASE}/media/0b1d0e0c-1111-4222-8333-444444444444-remote.png`,
        filename: 'Remote picture',
        contentType: 'image/png',
        size: 7,
        alt: 'R',
        width: 10
      }
    ])
  })

  it('names an object after its key when the Worker holds no name for it', async () => {
    connect()
    store.set('media/0b1d0e0c-1111-4222-8333-444444444444-remote.png', {
      body: new Uint8Array(1),
      contentType: 'image/png',
      metadata: {}
    })
    expect((await media.listMedia())[0].filename).toBe('remote.png')
  })

  it('still answers with the local rows when the Worker cannot be reached', async () => {
    connect()
    const mine = await upload()
    failWith(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(await media.listMedia()).toEqual([mine])
  })
})

describe('updateAlt / rename', () => {
  it('updates the row, and the object once it has been uploaded', async () => {
    const local = await upload()
    expect((await media.updateAlt(local.key, 'A cat')).alt).toBe('A cat')

    connect()
    const uploaded = await upload()
    const withAlt = await media.updateAlt(uploaded.key, 'A dog')
    expect(withAlt.alt).toBe('A dog')
    expect(store.get(uploaded.key)?.metadata).toMatchObject({ alt: 'A dog' })

    const renamed = await media.rename(uploaded.key, '  Fancy  nameé ')
    expect(renamed.filename).toBe('Fancy namee')
    expect(store.get(uploaded.key)?.metadata.filename).toBe('Fancy namee')
    expect((await media.listMedia()).find((a) => a.key === uploaded.key)).toEqual(renamed)
  })

  it('keeps the row when the Worker cannot be reached', async () => {
    connect()
    const uploaded = await upload()
    failWith(new Error('offline'))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect((await media.updateAlt(uploaded.key, 'A dog')).alt).toBe('A dog')
    expect(warn).toHaveBeenCalled()
  })

  it('works on an object only the Worker knows', async () => {
    connect()
    const key = 'media/0b1d0e0c-1111-4222-8333-444444444444-remote.png'
    store.set(key, { body: new Uint8Array(1), contentType: 'image/png', metadata: {} })
    expect((await media.updateAlt(key, 'alt')).alt).toBe('alt')
    expect((await media.rename(key, 'name')).filename).toBe('name')
    expect(store.get(key)?.metadata).toEqual({ alt: 'alt', filename: 'name' })
  })

  it('refuses a key outside the library', async () => {
    await expect(media.updateAlt('icons/x.svg', 'a')).rejects.toThrow(/Invalid media key/)
  })
})

describe('uploadPoster', () => {
  it('stores the still beside the clip and stamps the clip with it', async () => {
    connect()
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    const still = new Uint8Array([0xff, 0xd8])
    const url = await media.uploadPoster(clip.key, still)
    const posterKey = clip.key.replace('media/', 'posters/').replace(/\.mp4$/, '.jpg')
    expect(url).toBe(`${PUBLIC_BASE}/${posterKey}`)
    expect(store.get(posterKey)?.contentType).toBe('image/jpeg')
    expect([...store.get(posterKey)!.body]).toEqual([0xff, 0xd8])
    expect(store.get(clip.key)?.metadata.poster).toBe(url)
    expect(existsSync(join(userData, 'media', posterKey.slice('posters/'.length)))).toBe(true)
    expect((await media.listMedia())[0].poster).toBe(url)
  })

  it('keeps the still local when the Worker is not available, and refuses a foreign key', async () => {
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    const url = await media.uploadPoster(clip.key, new Uint8Array([1]))
    expect(url).toMatch(/^local:\/\/[0-9a-f-]{36}-clip\.jpg$/)
    expect(await media.uploadPoster('icons/x.svg', new Uint8Array([1]))).toBeNull()
  })

  it('keeps the still local when the upload fails', async () => {
    connect()
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    failWith(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const url = await media.uploadPoster(clip.key, new Uint8Array([1]))
    expect(url).toMatch(/^local:\/\//)
    expect((await media.listMedia())[0].poster).toBe(url)
  })
})

describe('deleteMedia', () => {
  it('removes the row, the files and the objects', async () => {
    connect()
    const clip = await upload({ filename: 'clip.mp4', contentType: 'video/mp4' })
    await media.uploadPoster(clip.key, new Uint8Array([1]))
    const file = clip.key.slice('media/'.length)

    await media.deleteMedia(clip.key)

    expect(store.size).toBe(0)
    expect(existsSync(join(userData, 'media', file))).toBe(false)
    expect(existsSync(join(userData, 'media', file.replace(/\.mp4$/, '.jpg')))).toBe(false)
    expect(await media.listMedia()).toEqual([])
  })

  it('leaves the local copy in place when the Worker refuses', async () => {
    connect()
    const asset = await upload()
    failWith(new Error('offline'))
    await expect(media.deleteMedia(asset.key)).rejects.toThrow('offline')
    failWith(null)
    expect(await media.listMedia()).toEqual([asset])
  })

  it('removes a local-only row without asking the Worker', async () => {
    connect()
    const asset = await upload()
    failWith(new Error('offline'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const local = await upload({ filename: 'other.png' })
    await media.deleteMedia(local.key)
    failWith(null)
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
