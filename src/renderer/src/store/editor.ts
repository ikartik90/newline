import { create } from 'zustand'
import { EMPTY_DOCUMENT, type Document } from '@shared/domain/document'

export { EMPTY_DOCUMENT }

/** Maximum number of undo steps retained. */
const MAX_HISTORY = 100

export interface HistorySnapshot {
  title: string
  document: Document
}

interface EditorStore {
  title: string
  /** The note being edited, or null before one is loaded. */
  noteId: string | null
  document: Document
  /** Whether anything has changed since the last save. */
  isDirty: boolean
  /** Ordered list of snapshots from oldest to newest. */
  history: HistorySnapshot[]
  /** Index of the currently active snapshot, or -1 when history is empty. */
  historyIndex: number

  setTitle: (title: string) => void
  setDocument: (document: Document) => void
  setNoteId: (id: string) => void
  setDirty: (dirty: boolean) => void
  /** Seed the store from a note: clean, with the first undo step in place. */
  load: (note: { noteId: string; title: string; document: Document }) => void
  /**
   * Append a snapshot to the history stack. Any snapshots ahead of the
   * current index (the redo stack) are trimmed first.
   */
  pushHistory: (snapshot: HistorySnapshot) => void
  /** Restore the previous snapshot. No-op when already at the oldest entry. */
  undo: () => void
  /** Restore the next snapshot. No-op when already at the newest entry. */
  redo: () => void
  reset: () => void
}

const INITIAL_STATE = {
  title: '',
  noteId: null as string | null,
  document: EMPTY_DOCUMENT,
  isDirty: false,
  history: [] as HistorySnapshot[],
  historyIndex: -1
}

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...INITIAL_STATE,

  setTitle: (title) => set({ title, isDirty: true }),
  setDocument: (document) => set({ document, isDirty: true }),
  setNoteId: (noteId) => set({ noteId }),
  setDirty: (isDirty) => set({ isDirty }),

  load: ({ noteId, title, document }) =>
    set({
      noteId,
      title,
      document,
      isDirty: false,
      history: [{ title, document }],
      historyIndex: 0
    }),

  pushHistory: ({ title, document }) => {
    const { history, historyIndex } = get()
    const trimmed = history.slice(0, historyIndex + 1)
    const next = [...trimmed, { title, document }].slice(-MAX_HISTORY)
    set({ history: next, historyIndex: next.length - 1 })
  },

  undo: () => {
    const { history, historyIndex } = get()
    if (historyIndex <= 0) return
    const idx = historyIndex - 1
    const snap = history[idx]
    set({ title: snap.title, document: snap.document, historyIndex: idx, isDirty: true })
  },

  redo: () => {
    const { history, historyIndex } = get()
    if (historyIndex >= history.length - 1) return
    const idx = historyIndex + 1
    const snap = history[idx]
    set({ title: snap.title, document: snap.document, historyIndex: idx, isDirty: true })
  },

  reset: () => set({ ...INITIAL_STATE })
}))
