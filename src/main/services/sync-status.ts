import { getDb } from '../db/database'

export interface SyncStatus {
  pendingCount: number
  failedCount: number
  /** When the last cycle with the Worker ran through (`sync.ts`), or null before any has. */
  lastSyncedAt: number | null
}

export function getSyncStatus(): SyncStatus {
  const db = getDb()

  const pending = db
    .prepare("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'pending'")
    .get() as { count: number }

  const failed = db
    .prepare("SELECT COUNT(*) as count FROM sync_queue WHERE status = 'failed'")
    .get() as { count: number }

  const meta = db.prepare("SELECT value FROM app_meta WHERE key = 'last_sync_at'").get() as
    | { value: string }
    | undefined

  return {
    pendingCount: pending.count,
    failedCount: failed.count,
    lastSyncedAt: meta ? parseInt(meta.value, 10) : null
  }
}
