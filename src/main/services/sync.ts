import { net } from 'electron'
import {
  NotePushResultSchema,
  NotesPageSchema,
  type NotePush,
  type NoteRecord,
  type SyncResult
} from '@shared/domain/sync'
import { apiJson } from './api'
import { flushPending } from './media'
import {
  getAppMeta,
  getDirtyNotes,
  getNoteIncludingDeleted,
  markSynced,
  setAppMeta,
  upsertFromRemote
} from './notes'
import { getSessionToken } from './session'

// ---------------------------------------------------------------------------
// Notes sync against the Worker's `/notes` routes (`worker/README.md`,
// Notes). SQLite is the source of truth for this machine's edits and the
// Worker stamps the order: a cycle pushes every dirty note, sends any media
// still local-only (which may dirty notes again), then pulls what changed
// since the stored cursor and takes each note that is newer than the local
// copy. The renderer never sees any of this beyond `sync:now`, `sync:pushNote`
// and the `sync:changed` notice a pull that changed something sends.
// ---------------------------------------------------------------------------

export type { SyncResult }

/** `app_meta` keys. */
const CURSOR_KEY = 'sync_cursor'
const LAST_SYNC_KEY = 'last_sync_at'

type ChangeListener = () => void
const changeListeners = new Set<ChangeListener>()

/** Hear about a pull that changed local notes. Resolves to the unsubscribe. */
export function onSyncChanged(listener: ChangeListener): () => void {
  changeListeners.add(listener)
  return () => {
    changeListeners.delete(listener)
  }
}

function notifyChanged(): void {
  for (const listener of changeListeners) {
    try {
      listener()
    } catch (error) {
      console.warn('[sync] a change listener failed:', error)
    }
  }
}

/**
 * Send one note, tombstone or not, and clear its queue row once the Worker
 * has it. Resolves false, leaving the note dirty for the next cycle, when
 * there is no session, no such note, or the Worker refused or could not be
 * reached.
 */
export async function pushNote(id: string): Promise<boolean> {
  if (getSessionToken() === null) return false
  const note = getNoteIncludingDeleted(id)
  if (!note) return false

  const push: NotePush = {
    title: note.title,
    body: note.body,
    tags: note.tags,
    createdAt: note.createdAt,
    isDeleted: note.isDeleted
  }
  try {
    const { updatedAt } = NotePushResultSchema.parse(
      await apiJson(`/notes/${encodeURIComponent(id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(push)
      })
    )
    markSynced(id, updatedAt)
    return true
  } catch (error) {
    console.warn(`[sync] push failed for ${id}:`, error)
    return false
  }
}

/** Push everything queued; resolves to how many landed. */
async function pushDirty(): Promise<number> {
  let pushed = 0
  for (const note of getDirtyNotes()) {
    if (await pushNote(note.id)) pushed += 1
  }
  return pushed
}

/** Take a remote note when this machine has none, or an older one. */
function applyRemote(record: NoteRecord): boolean {
  const local = getNoteIncludingDeleted(record.id)
  if (local && record.updatedAt <= local.updatedAt) return false
  upsertFromRemote(record.id, {
    title: record.title,
    body: record.body,
    tags: record.tags,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    isDeleted: record.isDeleted
  })
  return true
}

/**
 * Fetch every note changed since the stored cursor, page by page, and take
 * the ones newer than this machine's. Resolves to how many notes changed
 * locally, having told the change listeners when that is more than none.
 * Rejects when the Worker could not be reached or answered badly; the
 * cursor stays at the last page that was taken whole.
 */
export async function pullNotes(): Promise<number> {
  let cursor = getAppMeta(CURSOR_KEY)
  let changed = 0
  try {
    for (;;) {
      const query = cursor === null ? '' : `?cursor=${encodeURIComponent(cursor)}`
      const page = NotesPageSchema.parse(await apiJson(`/notes${query}`))
      for (const record of page.notes) {
        if (applyRemote(record)) changed += 1
      }
      if (page.cursor !== null && page.cursor !== cursor) {
        setAppMeta(CURSOR_KEY, page.cursor)
        cursor = page.cursor
      } else if (page.hasMore) {
        // More is waiting but the cursor went nowhere: asking again would loop forever.
        throw new Error('The Worker promised another page without moving the cursor')
      }
      if (!page.hasMore) return changed
    }
  } finally {
    if (changed > 0) notifyChanged()
  }
}

let inFlight: Promise<SyncResult> | null = null

/**
 * One cycle: push, send pending media (and push again if that dirtied
 * anything), pull. Never rejects: a cycle that could not run through says
 * so with `ok: false`. A call while a cycle is running shares that cycle.
 */
export function syncNow(): Promise<SyncResult> {
  if (!inFlight) {
    inFlight = runCycle().finally(() => {
      inFlight = null
    })
  }
  return inFlight
}

async function runCycle(): Promise<SyncResult> {
  if (getSessionToken() === null) return { pushed: 0, pulled: 0, ok: false }
  let pushed = 0
  try {
    pushed += await pushDirty()
    if ((await flushPending()) > 0) pushed += await pushDirty()
    const pulled = await pullNotes()
    setAppMeta(LAST_SYNC_KEY, String(Date.now()))
    return { pushed, pulled, ok: true }
  } catch (error) {
    console.warn('[sync] cycle failed:', error)
    return { pushed, pulled: 0, ok: false }
  }
}

export interface SchedulerOptions {
  intervalMs?: number
  /** Whether the machine has a network; Electron's own answer by default. */
  isOnline?: () => boolean
}

let timer: ReturnType<typeof setInterval> | null = null

/** Run a cycle now and then every `intervalMs`, skipping the ticks spent offline. */
export function startSyncScheduler({
  intervalMs = 60_000,
  isOnline = () => net.isOnline()
}: SchedulerOptions = {}): void {
  stopSyncScheduler()
  const tick = (): void => {
    if (isOnline()) void syncNow()
  }
  tick()
  timer = setInterval(tick, intervalMs)
}

export function stopSyncScheduler(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}
