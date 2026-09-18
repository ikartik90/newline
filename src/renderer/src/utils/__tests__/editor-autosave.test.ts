import { describe, it, expect, beforeEach } from 'vitest'
import { autosaveKey, readAutosave, writeAutosave, clearAutosave } from '../editor-autosave'
import type { Document } from '@shared/domain/document'

const DOC: Document = {
  type: 'doc',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'hi' }] }]
}

describe('editor-autosave', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  describe('autosaveKey', () => {
    it('keys an existing note by its id', () => {
      expect(autosaveKey('note-123')).toBe('newline-editor-autosave:note-123')
    })

    it('keys a brand-new note under one shared "new" slot', () => {
      expect(autosaveKey(null)).toBe('newline-editor-autosave:new')
    })
  })

  it('round-trips a snapshot through write and read', () => {
    const key = autosaveKey('note-1')
    writeAutosave(key, {
      title: 'Draft title',
      noteId: 'note-1',
      document: DOC,
      savedAt: 123
    })

    const restored = readAutosave(key)
    expect(restored).toEqual({
      version: 1,
      title: 'Draft title',
      noteId: 'note-1',
      document: DOC,
      savedAt: 123
    })
  })

  it('returns null when nothing is stored', () => {
    expect(readAutosave(autosaveKey('missing'))).toBeNull()
  })

  it('returns null for corrupt JSON', () => {
    const key = autosaveKey('note-2')
    window.localStorage.setItem(key, '{not json')
    expect(readAutosave(key)).toBeNull()
  })

  it('rejects a snapshot written under an incompatible schema version', () => {
    const key = autosaveKey('note-3')
    window.localStorage.setItem(key, JSON.stringify({ version: 0, title: 'old', document: DOC }))
    expect(readAutosave(key)).toBeNull()
  })

  it('rejects a snapshot with no document to restore', () => {
    const key = autosaveKey('note-5')
    window.localStorage.setItem(key, JSON.stringify({ version: 1, title: 'x', document: null }))
    expect(readAutosave(key)).toBeNull()
  })

  it('clears a stored snapshot', () => {
    const key = autosaveKey('note-4')
    writeAutosave(key, {
      title: '',
      noteId: 'note-4',
      document: DOC,
      savedAt: 1
    })
    expect(readAutosave(key)).not.toBeNull()

    clearAutosave(key)
    expect(readAutosave(key)).toBeNull()
  })
})
