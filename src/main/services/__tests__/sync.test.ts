import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDocument } from '@shared/domain/document'
import { getDb } from '../../db/database'
import { flushPending } from '../media'
import * as notes from '../notes'
import { getSessionToken } from '../session'
import * as sync from '../sync'
import {
  BASE_URL,
  failWith,
  fetchMock,
  refuseNote,
  refuseWith,
  requests,
  resetFakeNotesWorker,
  seed,
  setPageLimit,
  store
} from './fake-notes-worker'

// ---------------------------------------------------------------------------
// The sync service against a fake Worker behind `fetch`, with the notes in an
// in-memory database. The session and the media flush are stand-ins: what is
// under test is the traffic and what it does to the rows.
// ---------------------------------------------------------------------------

vi.mock('electron', () => ({ net: { isOnline: vi.fn(() => true) } }))

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

vi.mock('../session', () => ({ getSessionToken: vi.fn((): string | null => 'session-token') }))

vi.mock('../media', () => ({ flushPending: vi.fn(async () => 0) }))

const paragraph = (text: string): string =>
  serializeDocument({
    type: 'doc',
    content: [{ type: 'paragraph', children: [{ type: 'text', text }] }]
  })

/** A note as another device would have pushed it. */
function remote(id: string, title: string, updatedAt?: number) {
  return seed({
    id,
    title,
    body: paragraph(`${title} words`),
    tags: [],
    createdAt: 1,
    isDeleted: false,
    updatedAt
  })
}

const dirtyIds = (): string[] => notes.getDirtyNotes().map((n) => n.id)
const sent = (): string[] => requests.map((r) => `${r.method} ${r.path}`)
/** The cursor the Worker answers with after a page ending on this note. */
const cursorAfter = (id: string): string =>
  Buffer.from(`${store.get(id)!.updatedAt}:${id}`).toString('base64url')
const warn = (): ReturnType<typeof vi.spyOn> =>
  vi.spyOn(console, 'warn').mockImplementation(() => {})

beforeEach(() => {
  resetFakeNotesWorker()
  vi.stubGlobal('fetch', fetchMock)
  vi.stubEnv('MAIN_VITE_API_URL', BASE_URL)
  vi.mocked(getSessionToken).mockReturnValue('session-token')
  vi.mocked(flushPending).mockReset()
  vi.mocked(flushPending).mockResolvedValue(0)
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM app_meta')
})

afterEach(() => {
  sync.stopSyncScheduler()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('pushNote', () => {
  it('PUTs the note as the Worker takes it, then marks it synced with the stamp', async () => {
    const note = notes.createNote('Groceries', paragraph('milk'))
    notes.updateNote(note.id, { tags: ['home'] })

    expect(await sync.pushNote(note.id)).toBe(true)

    expect(requests).toHaveLength(1)
    const [request] = requests
    expect(request.method).toBe('PUT')
    expect(request.path).toBe(`/notes/${note.id}`)
    expect(request.headers.get('Authorization')).toBe('Bearer session-token')
    expect(request.headers.get('Content-Type')).toBe('application/json')
    expect(request.body).toEqual({
      title: 'Groceries',
      body: paragraph('milk'),
      tags: ['home'],
      createdAt: note.createdAt,
      isDeleted: false
    })

    expect(store.get(note.id)).toMatchObject({ title: 'Groceries', tags: ['home'] })
    expect(dirtyIds()).toEqual([])
    const synced = notes.getNote(note.id)!
    expect(synced.lastSyncedAt).not.toBeNull()
    expect(synced.updatedAt).toBe(store.get(note.id)!.updatedAt)
  })

  it('pushes a deletion as a tombstone', async () => {
    const note = notes.createNote('Gone')
    notes.markSynced(note.id)
    notes.deleteNote(note.id)

    expect(await sync.pushNote(note.id)).toBe(true)
    expect(requests[0].body).toMatchObject({ title: 'Gone', isDeleted: true })
    expect(store.get(note.id)?.isDeleted).toBe(true)
    expect(dirtyIds()).toEqual([])
  })

  it('answers false and keeps the note dirty when the Worker refuses it', async () => {
    const warned = warn()
    const note = notes.createNote('Huge')
    refuseWith(413, 'too_large')
    expect(await sync.pushNote(note.id)).toBe(false)
    expect(dirtyIds()).toEqual([note.id])
    expect(notes.getNote(note.id)!.lastSyncedAt).toBeNull()
    expect(warned).toHaveBeenCalled()
  })

  it('answers false and keeps the note dirty when the Worker cannot be reached', async () => {
    warn()
    const note = notes.createNote('Offline')
    failWith(new TypeError('fetch failed'))
    expect(await sync.pushNote(note.id)).toBe(false)
    expect(dirtyIds()).toEqual([note.id])
  })

  it('answers false when the Worker answers with the wrong shape', async () => {
    warn()
    const note = notes.createNote('Odd')
    fetchMock.mockResolvedValueOnce(new Response('{}', { status: 200 }))
    expect(await sync.pushNote(note.id)).toBe(false)
    expect(dirtyIds()).toEqual([note.id])
  })

  it('touches nothing without a session or for a note that does not exist', async () => {
    const note = notes.createNote('Mine')
    vi.mocked(getSessionToken).mockReturnValue(null)
    expect(await sync.pushNote(note.id)).toBe(false)
    vi.mocked(getSessionToken).mockReturnValue('session-token')
    expect(await sync.pushNote('missing')).toBe(false)
    expect(requests).toEqual([])
    expect(dirtyIds()).toEqual([note.id])
  })
})

describe('pullNotes', () => {
  it('takes a note this machine has never seen, stamped as the Worker stamped it', async () => {
    const record = remote('r1', 'Elsewhere', 5_000)

    expect(await sync.pullNotes()).toBe(1)

    expect(requests[0].method).toBe('GET')
    expect(requests[0].path).toBe('/notes')
    expect(requests[0].query.has('cursor')).toBe(false)
    expect(requests[0].headers.get('Authorization')).toBe('Bearer session-token')
    const note = notes.getNote('r1')!
    expect(note).toMatchObject({
      title: 'Elsewhere',
      body: record.body,
      plainText: 'Elsewhere words',
      createdAt: 1,
      updatedAt: 5_000,
      isDeleted: false
    })
    expect(note.lastSyncedAt).not.toBeNull()
    expect(dirtyIds()).toEqual([])
  })

  it('takes a newer copy and leaves an older or equally old one alone', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(10_000)
    const newer = notes.createNote('Newer here')
    const older = notes.createNote('Older here')
    const same = notes.createNote('Same age')
    remote(newer.id, 'Newer there', 20_000)
    remote(older.id, 'Older there', 9_000)
    remote(same.id, 'Same there', 10_000)

    expect(await sync.pullNotes()).toBe(1)

    expect(notes.getNote(newer.id)).toMatchObject({ title: 'Newer there', updatedAt: 20_000 })
    expect(notes.getNote(older.id)).toMatchObject({ title: 'Older here', updatedAt: 10_000 })
    expect(notes.getNote(same.id)).toMatchObject({ title: 'Same age', updatedAt: 10_000 })
  })

  it('takes a remote tombstone over a local note, and compares against a local one', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(10_000)
    const deletedThere = notes.createNote('Deleted there')
    const deletedHere = notes.createNote('Deleted here')
    notes.deleteNote(deletedHere.id)
    seed({
      id: deletedThere.id,
      title: 'Deleted there',
      body: deletedThere.body,
      tags: [],
      createdAt: 1,
      isDeleted: true,
      updatedAt: 20_000
    })
    remote(deletedHere.id, 'Revived stale', 9_000)

    expect(await sync.pullNotes()).toBe(1)

    expect(notes.getNote(deletedThere.id)).toBeNull()
    expect(notes.getNoteIncludingDeleted(deletedThere.id)?.isDeleted).toBe(true)
    expect(notes.getNoteIncludingDeleted(deletedHere.id)?.isDeleted).toBe(true)
  })

  it('stores the cursor and asks from it next time', async () => {
    remote('a', 'A')
    const last = remote('b', 'B')

    expect(await sync.pullNotes()).toBe(2)
    const cursor = notes.getAppMeta('sync_cursor')!
    expect(cursor).toBe(Buffer.from(`${last.updatedAt}:b`).toString('base64url'))

    expect(await sync.pullNotes()).toBe(0)
    expect(requests[1].query.get('cursor')).toBe(cursor)
    expect(notes.getAppMeta('sync_cursor')).toBe(cursor)

    remote('c', 'C')
    expect(await sync.pullNotes()).toBe(1)
    expect(requests[2].query.get('cursor')).toBe(cursor)
    expect(notes.getAppMeta('sync_cursor')).toBe(cursorAfter('c'))
  })

  it('walks every page while there is more', async () => {
    setPageLimit(2)
    for (const id of ['a', 'b', 'c', 'd', 'e']) remote(id, id.toUpperCase())

    expect(await sync.pullNotes()).toBe(5)

    expect(sent()).toEqual(['GET /notes', 'GET /notes', 'GET /notes'])
    expect(requests[0].query.get('cursor')).toBeNull()
    expect(requests[1].query.get('cursor')).toBe(cursorAfter('b'))
    expect(requests[2].query.get('cursor')).toBe(cursorAfter('d'))
    expect(notes.getAppMeta('sync_cursor')).toBe(cursorAfter('e'))
    expect(
      notes
        .listNotes()
        .map((n) => n.title)
        .sort()
    ).toEqual(['A', 'B', 'C', 'D', 'E'])
  })

  it('tells a listener once when something changed, and not when nothing did', async () => {
    const listener = vi.fn()
    const unsubscribe = sync.onSyncChanged(listener)
    setPageLimit(2)
    remote('a', 'A')
    remote('b', 'B')
    remote('c', 'C')

    await sync.pullNotes()
    expect(listener).toHaveBeenCalledTimes(1)

    await sync.pullNotes()
    expect(listener).toHaveBeenCalledTimes(1)

    unsubscribe()
    remote('d', 'D')
    await sync.pullNotes()
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('still tells the listener when a later page fails after an earlier one landed', async () => {
    const listener = vi.fn()
    sync.onSyncChanged(listener)
    setPageLimit(1)
    remote('a', 'A')
    remote('b', 'B')
    fetchMock.mockImplementationOnce(fetchMock.getMockImplementation()!)
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('fetch failed')
    })

    await expect(sync.pullNotes()).rejects.toThrow('fetch failed')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(notes.getNote('a')).not.toBeNull()
    // The cursor sits after the page that landed, so the next pull starts there.
    expect(notes.getAppMeta('sync_cursor')).toBe(cursorAfter('a'))
  })

  it('passes a failure on, leaving the cursor where it was', async () => {
    remote('a', 'A')
    await sync.pullNotes()
    const cursor = notes.getAppMeta('sync_cursor')
    refuseWith(401, 'unauthorized')
    await expect(sync.pullNotes()).rejects.toMatchObject({ status: 401, code: 'unauthorized' })
    expect(notes.getAppMeta('sync_cursor')).toBe(cursor)
  })

  it('refuses a page that promises more without moving the cursor', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ notes: [], cursor: null, hasMore: true }), { status: 200 })
    )
    await expect(sync.pullNotes()).rejects.toThrow(/without moving the cursor/)
  })
})

describe('syncNow', () => {
  it('does nothing without a session', async () => {
    notes.createNote('Mine')
    vi.mocked(getSessionToken).mockReturnValue(null)
    expect(await sync.syncNow()).toEqual({ pushed: 0, pulled: 0, ok: false })
    expect(requests).toEqual([])
    expect(notes.getAppMeta('last_sync_at')).toBeNull()
  })

  it('pushes, sends pending media, then pulls, and stamps the cycle', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(1_700_000_000_000)
    const first = notes.createNote('First')
    const second = notes.createNote('Second')
    remote('r1', 'Elsewhere')

    expect(await sync.syncNow()).toEqual({ pushed: 2, pulled: 1, ok: true })

    expect(sent()).toEqual([`PUT /notes/${first.id}`, `PUT /notes/${second.id}`, 'GET /notes'])
    const [firstPut, secondPut, get] = fetchMock.mock.invocationCallOrder
    const [flush] = vi.mocked(flushPending).mock.invocationCallOrder
    expect(flush).toBeGreaterThan(secondPut)
    expect(flush).toBeGreaterThan(firstPut)
    expect(flush).toBeLessThan(get)

    expect(dirtyIds()).toEqual([])
    expect(notes.getNote('r1')).not.toBeNull()
    expect(notes.getAppMeta('last_sync_at')).toBe('1700000000000')
  })

  it('does not take its own pushes back as changes', async () => {
    notes.createNote('Mine')
    expect(await sync.syncNow()).toEqual({ pushed: 1, pulled: 0, ok: true })
    expect(await sync.syncNow()).toEqual({ pushed: 0, pulled: 0, ok: true })
  })

  it('pushes again when the media flush dirtied a note', async () => {
    const note = notes.createNote('With a picture')
    vi.mocked(flushPending).mockImplementation(async () => {
      // As `media.ts` does once an upload lands: the note now points at the copy.
      notes.updateNote(note.id, { body: paragraph('public url') })
      return 1
    })

    expect(await sync.syncNow()).toEqual({ pushed: 2, pulled: 0, ok: true })
    expect(sent()).toEqual([`PUT /notes/${note.id}`, `PUT /notes/${note.id}`, 'GET /notes'])
    expect(store.get(note.id)?.body).toBe(paragraph('public url'))
    expect(dirtyIds()).toEqual([])
  })

  it('carries on past a note the Worker refuses, leaving it dirty', async () => {
    warn()
    const fine = notes.createNote('Fine')
    const refused = notes.createNote('Refused')
    refuseNote(refused.id, 413, 'too_large')
    remote('r1', 'Elsewhere')

    expect(await sync.syncNow()).toEqual({ pushed: 1, pulled: 1, ok: true })
    expect(dirtyIds()).toEqual([refused.id])
    expect(store.has(fine.id)).toBe(true)
  })

  it('reports a cycle the Worker could not carry, without throwing', async () => {
    const warned = warn()
    const note = notes.createNote('Mine')
    failWith(new TypeError('fetch failed'))

    expect(await sync.syncNow()).toEqual({ pushed: 0, pulled: 0, ok: false })
    expect(dirtyIds()).toEqual([note.id])
    expect(notes.getAppMeta('last_sync_at')).toBeNull()
    expect(warned).toHaveBeenCalled()
  })

  it('shares one run between calls made while it is under way', async () => {
    notes.createNote('Mine')
    let release!: () => void
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    const real = fetchMock.getMockImplementation()!
    fetchMock.mockImplementationOnce(async (input, init) => {
      await held
      return real(input, init)
    })

    const first = sync.syncNow()
    const second = sync.syncNow()
    expect(second).toBe(first)
    release()
    expect(await first).toEqual({ pushed: 1, pulled: 0, ok: true })
    expect(sent()).toEqual([`PUT /notes/${notes.listNotes()[0].id}`, 'GET /notes'])

    // Once it is over, the next call is a new cycle.
    const third = sync.syncNow()
    expect(third).not.toBe(first)
    expect(await third).toEqual({ pushed: 0, pulled: 0, ok: true })
  })
})

describe('startSyncScheduler', () => {
  it('runs a cycle at once and on every interval while online, until stopped', async () => {
    vi.useFakeTimers()
    const isOnline = vi.fn(() => true)

    sync.startSyncScheduler({ intervalMs: 1_000, isOnline })
    await vi.advanceTimersByTimeAsync(0)
    expect(sent()).toEqual(['GET /notes'])

    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent()).toEqual(['GET /notes', 'GET /notes'])

    isOnline.mockReturnValue(false)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent()).toHaveLength(2)

    isOnline.mockReturnValue(true)
    sync.stopSyncScheduler()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(sent()).toHaveLength(2)
  })

  it('replaces an earlier schedule rather than running two', async () => {
    vi.useFakeTimers()
    sync.startSyncScheduler({ intervalMs: 1_000, isOnline: () => true })
    sync.startSyncScheduler({ intervalMs: 1_000, isOnline: () => true })
    // The two immediate ticks land on one shared cycle; then one interval, not two.
    await vi.advanceTimersByTimeAsync(0)
    expect(sent()).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1_000)
    expect(sent()).toHaveLength(2)
  })
})
