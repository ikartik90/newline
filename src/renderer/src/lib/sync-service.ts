import {
  collection,
  doc,
  setDoc,
  getDocs,
  query,
  where,
  orderBy,
  Timestamp,
  serverTimestamp,
  type FieldValue
} from 'firebase/firestore'
import { serializeDocument } from '@shared/domain/document'
import { bodyToDocument, looksLikeDocumentJson } from '@shared/markdown/markdown-to-document'
import { db as firestore } from './firebase'

interface FirestoreNote {
  title: string
  body: string
  tags: string[]
  createdAt: Timestamp
  updatedAt: Timestamp
  isDeleted: boolean
}

/** What a write sends: the server stamps `updatedAt`, so it goes up as a sentinel. */
type FirestoreNoteWrite = Omit<FirestoreNote, 'updatedAt'> & { updatedAt: FieldValue }

let syncIntervalId: ReturnType<typeof setInterval> | null = null
let currentUid: string | null = null

export function startSyncService(uid: string): void {
  if (syncIntervalId) stopSyncService()
  currentUid = uid

  const run = () => syncCycle()
  run()
  syncIntervalId = setInterval(run, 60_000)
  window.addEventListener('online', run)
}

export function stopSyncService(): void {
  if (syncIntervalId) {
    clearInterval(syncIntervalId)
    syncIntervalId = null
  }
  currentUid = null
}

export async function pushNoteNow(note: Note): Promise<boolean> {
  if (!currentUid || !navigator.onLine) return false

  try {
    const notesRef = collection(firestore, 'users', currentUid, 'notes')
    await setDoc(doc(notesRef, note.id), {
      title: note.title,
      body: note.body,
      tags: note.tags,
      createdAt: Timestamp.fromMillis(note.createdAt),
      updatedAt: serverTimestamp(),
      isDeleted: note.isDeleted
    } satisfies FirestoreNoteWrite)

    await window.api.notes.markSynced(note.id)
    return true
  } catch (err) {
    console.error(`[sync] immediate push failed for ${note.id}:`, err)
    return false
  }
}

async function syncCycle(): Promise<void> {
  if (!navigator.onLine || !currentUid) return

  try {
    await pushChanges(currentUid)
    await flushPendingMedia(currentUid)
    await pullChanges(currentUid)
  } catch (err) {
    console.error('[sync] cycle failed:', err)
  }
}

/**
 * Send any media saved while offline. A landed upload rewrites the notes
 * that point at it, so those go up in this cycle rather than the next.
 */
async function flushPendingMedia(uid: string): Promise<void> {
  if (!navigator.onLine) return
  const landed = await window.api.media.flushPending()
  if (landed > 0) await pushChanges(uid)
}

async function pushChanges(uid: string): Promise<void> {
  const dirtyNotes = await window.api.notes.dirty()
  if (dirtyNotes.length === 0) return

  const notesRef = collection(firestore, 'users', uid, 'notes')

  for (const note of dirtyNotes) {
    try {
      await setDoc(doc(notesRef, note.id), {
        title: note.title,
        body: note.body,
        tags: note.tags,
        createdAt: Timestamp.fromMillis(note.createdAt),
        updatedAt: serverTimestamp(),
        isDeleted: note.isDeleted
      } satisfies FirestoreNoteWrite)

      await window.api.notes.markSynced(note.id)
    } catch (err) {
      console.error(`[sync] push failed for ${note.id}:`, err)
    }
  }
}

/**
 * A remote body as the store takes it. A body that is not a document is
 * markdown an older client wrote, converted here so main only ever sees JSON.
 */
function storedBody(body: string | undefined): string {
  const remote = body ?? ''
  return looksLikeDocumentJson(remote) ? remote : serializeDocument(bodyToDocument(remote))
}

async function pullChanges(uid: string): Promise<void> {
  const notesRef = collection(firestore, 'users', uid, 'notes')

  const lastSyncStr = await window.api.meta.get('last_full_sync')
  const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : null

  const constraints = lastSync
    ? [where('updatedAt', '>', Timestamp.fromMillis(lastSync)), orderBy('updatedAt')]
    : [orderBy('updatedAt')]

  const snapshot = await getDocs(query(notesRef, ...constraints))

  for (const remoteDoc of snapshot.docs) {
    const remote = remoteDoc.data() as FirestoreNote
    const remoteUpdatedAt = remote.updatedAt?.toMillis() ?? 0
    const localNote = await window.api.notes.get(remoteDoc.id)

    if (!localNote || remoteUpdatedAt > localNote.updatedAt) {
      await window.api.notes.upsertFromRemote(remoteDoc.id, {
        title: remote.title,
        body: storedBody(remote.body),
        tags: remote.tags,
        createdAt: remote.createdAt?.toMillis() ?? Date.now(),
        isDeleted: remote.isDeleted ?? false
      })
    }
  }

  await window.api.meta.set('last_full_sync', String(Date.now()))
}
