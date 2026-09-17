import { beforeEach, describe, expect, it } from 'vitest'
import type { Document } from '@shared/domain/document'
import { EMPTY_DOCUMENT, useEditorStore } from '../editor'

const DOC: Document = {
  type: 'doc',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'hello' }] }]
}

const DOC2: Document = {
  type: 'doc',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'world' }] }]
}

describe('useEditorStore', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  describe('initial state', () => {
    it('starts empty, clean, with no note and no history', () => {
      const s = useEditorStore.getState()
      expect(s.title).toBe('')
      expect(s.noteId).toBeNull()
      expect(s.document).toEqual(EMPTY_DOCUMENT)
      expect(s.isDirty).toBe(false)
      expect(s.history).toEqual([])
      expect(s.historyIndex).toBe(-1)
    })
  })

  describe('setTitle / setDocument', () => {
    it('update their field and mark the store dirty', () => {
      useEditorStore.getState().setTitle('My note')
      expect(useEditorStore.getState().title).toBe('My note')
      expect(useEditorStore.getState().isDirty).toBe(true)

      useEditorStore.getState().setDirty(false)
      useEditorStore.getState().setDocument(DOC)
      expect(useEditorStore.getState().document).toEqual(DOC)
      expect(useEditorStore.getState().isDirty).toBe(true)
    })
  })

  describe('setNoteId', () => {
    it('stores the id without marking the store dirty', () => {
      useEditorStore.getState().setNoteId('abc-123')
      expect(useEditorStore.getState().noteId).toBe('abc-123')
      expect(useEditorStore.getState().isDirty).toBe(false)
    })
  })

  describe('load', () => {
    it('seeds the store from a note, clean, with the first snapshot in history', () => {
      useEditorStore.getState().load({ noteId: 'n1', title: 'T', document: DOC })
      const s = useEditorStore.getState()
      expect(s).toMatchObject({ noteId: 'n1', title: 'T', document: DOC, isDirty: false })
      expect(s.history).toEqual([{ title: 'T', document: DOC }])
      expect(s.historyIndex).toBe(0)
    })
  })

  describe('setDirty', () => {
    it('sets and clears the flag', () => {
      useEditorStore.getState().setDirty(true)
      expect(useEditorStore.getState().isDirty).toBe(true)
      useEditorStore.getState().setDirty(false)
      expect(useEditorStore.getState().isDirty).toBe(false)
    })
  })

  describe('reset', () => {
    it('restores all fields to initial values', () => {
      useEditorStore.getState().setTitle('Draft')
      useEditorStore.getState().setDocument(DOC)
      useEditorStore.getState().setNoteId('xyz')
      useEditorStore.getState().pushHistory({ title: 'Draft', document: DOC })

      useEditorStore.getState().reset()

      const { title, noteId, document, isDirty, history, historyIndex } = useEditorStore.getState()
      expect(title).toBe('')
      expect(noteId).toBeNull()
      expect(document).toEqual(EMPTY_DOCUMENT)
      expect(isDirty).toBe(false)
      expect(history).toEqual([])
      expect(historyIndex).toBe(-1)
    })
  })

  describe('pushHistory', () => {
    it('appends a snapshot and advances historyIndex', () => {
      useEditorStore.getState().pushHistory({ title: 'T', document: DOC })
      expect(useEditorStore.getState().history).toHaveLength(1)
      expect(useEditorStore.getState().historyIndex).toBe(0)
    })

    it('accumulates multiple snapshots in order', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().pushHistory({ title: 'B', document: DOC2 })
      const { history, historyIndex } = useEditorStore.getState()
      expect(history.map((h) => h.title)).toEqual(['A', 'B'])
      expect(historyIndex).toBe(1)
    })

    it('trims the redo stack when a new snapshot is pushed after undoing', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().pushHistory({ title: 'B', document: DOC2 })
      useEditorStore.getState().undo()
      useEditorStore.getState().pushHistory({ title: 'C', document: DOC })
      const { history, historyIndex } = useEditorStore.getState()
      expect(history.map((h) => h.title)).toEqual(['A', 'C'])
      expect(historyIndex).toBe(1)
    })

    it('keeps only the newest hundred snapshots', () => {
      for (let i = 0; i < 105; i++) {
        useEditorStore.getState().pushHistory({ title: String(i), document: DOC })
      }
      const { history, historyIndex } = useEditorStore.getState()
      expect(history).toHaveLength(100)
      expect(history[0].title).toBe('5')
      expect(historyIndex).toBe(99)
    })
  })

  describe('undo', () => {
    it('restores the previous snapshot, decrements the index and marks dirty', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().setTitle('B')
      useEditorStore.getState().pushHistory({ title: 'B', document: DOC2 })
      useEditorStore.getState().setDirty(false)

      useEditorStore.getState().undo()

      const s = useEditorStore.getState()
      expect(s.title).toBe('A')
      expect(s.document).toEqual(DOC)
      expect(s.historyIndex).toBe(0)
      expect(s.isDirty).toBe(true)
    })

    it('is a no-op when already at the oldest snapshot', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().undo()
      expect(useEditorStore.getState().title).toBe('')
      expect(useEditorStore.getState().historyIndex).toBe(0)
    })
  })

  describe('redo', () => {
    it('restores the next snapshot, increments the index and marks dirty', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().pushHistory({ title: 'B', document: DOC2 })
      useEditorStore.getState().undo()
      useEditorStore.getState().setDirty(false)

      useEditorStore.getState().redo()

      const s = useEditorStore.getState()
      expect(s.title).toBe('B')
      expect(s.document).toEqual(DOC2)
      expect(s.historyIndex).toBe(1)
      expect(s.isDirty).toBe(true)
    })

    it('is a no-op when already at the newest snapshot', () => {
      useEditorStore.getState().pushHistory({ title: 'A', document: DOC })
      useEditorStore.getState().redo()
      expect(useEditorStore.getState().historyIndex).toBe(0)
    })
  })
})
