import { Timestamp } from 'firebase/firestore'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDocument } from '@shared/domain/document'
import { pushNoteNow, startSyncService, stopSyncService } from '../sync-service'

const firestore = vi.hoisted(() => ({
  setDoc: vi.fn(async () => {}),
  getDocs: vi.fn(async () => ({ docs: [] as unknown[] }))
}))

vi.mock('firebase/firestore', () => {
  class Timestamp {
    constructor(readonly millis: number) {}
    static fromMillis(millis: number): Timestamp {
      return new Timestamp(millis)
    }
    toMillis(): number {
      return this.millis
    }
  }
  return {
    collection: vi.fn((_db: unknown, ...path: string[]) => ({ path })),
    doc: vi.fn((ref: unknown, id: string) => ({ ref, id })),
    setDoc: firestore.setDoc,
    getDocs: firestore.getDocs,
    query: vi.fn((ref: unknown) => ref),
    where: vi.fn(),
    orderBy: vi.fn(),
    Timestamp,
    serverTimestamp: vi.fn(() => 'server-time')
  }
})

vi.mock('../firebase', () => ({ db: {}, auth: {} }))

const paragraph = (text: string): string =>
  serializeDocument({
    type: 'doc',
    content: [{ type: 'paragraph', children: [{ type: 'text', text }] }]
  })

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'T',
    body: paragraph('hi'),
    plainText: 'hi',
    tags: [],
    createdAt: 1,
    updatedAt: 2,
    lastSyncedAt: null,
    isDeleted: false,
    ...overrides
  }
}

function remoteDoc(id: string, body: string, updatedAt: number) {
  return {
    id,
    data: () => ({
      title: id,
      body,
      tags: [],
      createdAt: Timestamp.fromMillis(1),
      updatedAt: Timestamp.fromMillis(updatedAt),
      isDeleted: false
    })
  }
}

const api = {
  notes: {
    dirty: vi.fn(async (): Promise<Note[]> => []),
    markSynced: vi.fn(async () => {}),
    get: vi.fn(async (): Promise<Note | null> => null),
    upsertFromRemote: vi.fn(async () => {})
  },
  meta: {
    get: vi.fn(async (): Promise<string | null> => null),
    set: vi.fn(async () => {})
  },
  media: {
    flushPending: vi.fn(async () => 0)
  }
}

/** The cycle `startSyncService` kicks off ends by stamping the sync time. */
const cycleDone = () =>
  vi.waitFor(() => expect(api.meta.set).toHaveBeenCalledWith('last_full_sync', expect.any(String)))

beforeEach(() => {
  vi.clearAllMocks()
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true })
})

afterEach(() => {
  stopSyncService()
})

describe('push', () => {
  it('sends a dirty note with its JSON body and marks it synced', async () => {
    api.notes.dirty.mockResolvedValueOnce([note()])
    startSyncService('uid')
    await cycleDone()

    expect(firestore.setDoc).toHaveBeenCalledWith(
      { ref: { path: ['users', 'uid', 'notes'] }, id: 'n1' },
      expect.objectContaining({ title: 'T', body: paragraph('hi'), isDeleted: false })
    )
    expect(api.notes.markSynced).toHaveBeenCalledWith('n1')
  })

  it('flushes pending media after pushing, and pushes again if anything landed', async () => {
    api.notes.dirty.mockResolvedValueOnce([note()]).mockResolvedValueOnce([note({ id: 'n2' })])
    api.media.flushPending.mockResolvedValueOnce(1)
    startSyncService('uid')
    await cycleDone()

    const [firstPush] = firestore.setDoc.mock.invocationCallOrder
    const [flush] = api.media.flushPending.mock.invocationCallOrder
    expect(flush).toBeGreaterThan(firstPush)
    expect(api.notes.dirty).toHaveBeenCalledTimes(2)
    expect(api.notes.markSynced).toHaveBeenLastCalledWith('n2')
  })

  it('pushes one note on demand', async () => {
    startSyncService('uid')
    await cycleDone()
    expect(await pushNoteNow(note({ id: 'now' }))).toBe(true)
    expect(api.notes.markSynced).toHaveBeenCalledWith('now')
  })
})

describe('pull', () => {
  it('converts a legacy markdown body and keeps a document body as it is', async () => {
    firestore.getDocs.mockResolvedValueOnce({
      docs: [remoteDoc('md', '# Legacy', 10), remoteDoc('json', paragraph('kept'), 10)]
    })
    startSyncService('uid')
    await cycleDone()

    expect(api.notes.upsertFromRemote).toHaveBeenCalledWith(
      'md',
      expect.objectContaining({
        body: serializeDocument({
          type: 'doc',
          content: [{ type: 'heading', level: 1, children: [{ type: 'text', text: 'Legacy' }] }]
        }),
        createdAt: 1
      })
    )
    expect(api.notes.upsertFromRemote).toHaveBeenCalledWith(
      'json',
      expect.objectContaining({ body: paragraph('kept') })
    )
  })

  it('leaves a note alone when the local copy is newer', async () => {
    firestore.getDocs.mockResolvedValueOnce({ docs: [remoteDoc('n1', '# old', 5)] })
    api.notes.get.mockResolvedValueOnce(note({ updatedAt: 50 }))
    startSyncService('uid')
    await cycleDone()
    expect(api.notes.upsertFromRemote).not.toHaveBeenCalled()
  })
})
