import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/database'
import { createNote, deleteNote, markSynced, setAppMeta } from '../notes'
import { getSyncStatus } from '../sync-status'

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

beforeEach(() => {
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM app_meta')
})

describe('getSyncStatus', () => {
  it('starts with nothing pending and no sync yet', () => {
    expect(getSyncStatus()).toEqual({ pendingCount: 0, failedCount: 0, lastSyncedAt: null })
  })

  it('counts the queue by status, a tombstone included', () => {
    const synced = createNote('Synced')
    markSynced(synced.id)
    createNote('Dirty')
    const gone = createNote('Gone')
    markSynced(gone.id)
    deleteNote(gone.id)
    getDb()
      .prepare(
        `INSERT INTO sync_queue (entity_type, entity_id, action, created_at, status)
         VALUES ('note', 'x', 'upsert', 1, 'failed')`
      )
      .run()
    expect(getSyncStatus()).toMatchObject({ pendingCount: 2, failedCount: 1 })
  })

  it('reads when the last cycle with the Worker finished', () => {
    setAppMeta('last_sync_at', '1700000000000')
    expect(getSyncStatus().lastSyncedAt).toBe(1_700_000_000_000)
  })
})
