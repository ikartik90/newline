import { beforeEach, describe, expect, it, vi } from 'vitest'
import { EMPTY_DOCUMENT, parseDocument, serializeDocument } from '@shared/domain/document'
import { getDb } from '../../db/database'
import * as notes from '../notes'

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

const paragraph = (text: string) =>
  serializeDocument({
    type: 'doc',
    content: [{ type: 'paragraph', children: [{ type: 'text', text }] }]
  })

beforeEach(() => {
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM app_meta')
})

describe('createNote', () => {
  it('stores a document body and derives its plain text', () => {
    const note = notes.createNote('Title', paragraph('Hello there'))
    expect(note.body).toBe(paragraph('Hello there'))
    expect(note.plainText).toBe('Hello there')
    expect(notes.getNote(note.id)).toEqual(note)
  })

  it('converts a legacy markdown body', () => {
    const note = notes.createNote('', '# Heading\n\nwords')
    expect(parseDocument(note.body).content).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'Heading' }] },
      { type: 'paragraph', children: [{ type: 'text', text: 'words' }] }
    ])
    expect(note.plainText).toBe('Heading\nwords')
  })

  it('stores the empty document for no body', () => {
    const note = notes.createNote()
    expect(note.body).toBe(serializeDocument(EMPTY_DOCUMENT))
    expect(note.plainText).toBe('')
  })

  it('queues the note for sync', () => {
    const note = notes.createNote()
    expect(notes.getDirtyNotes().map((n) => n.id)).toEqual([note.id])
  })
})

describe('updateNote', () => {
  it('re-derives plain text when the body changes, and only then', () => {
    const note = notes.createNote('T', paragraph('one'))
    const renamed = notes.updateNote(note.id, { title: 'Renamed' })
    expect(renamed?.plainText).toBe('one')

    const edited = notes.updateNote(note.id, { body: paragraph('two') })
    expect(edited?.plainText).toBe('two')
    expect(edited?.body).toBe(paragraph('two'))
  })

  it('tolerates markdown handed in as a body', () => {
    const note = notes.createNote()
    const edited = notes.updateNote(note.id, { body: '- item' })
    expect(parseDocument(edited!.body).content).toEqual([
      { type: 'bullet_list_item', children: [{ type: 'text', text: 'item' }] }
    ])
  })
})

describe('searchNotes', () => {
  it('matches title, tags and plain text but never the JSON vocabulary', () => {
    const a = notes.createNote('Groceries', paragraph('buy milk'))
    const b = notes.createNote('Work', paragraph('quarterly review'))
    notes.updateNote(b.id, { tags: ['office'] })

    expect(notes.searchNotes('milk').map((n) => n.id)).toEqual([a.id])
    expect(notes.searchNotes('Groc').map((n) => n.id)).toEqual([a.id])
    expect(notes.searchNotes('office').map((n) => n.id)).toEqual([b.id])
    expect(notes.searchNotes('paragraph')).toEqual([])
    expect(notes.searchNotes('   ')).toHaveLength(2)
  })
})

describe('deleteNote / getNoteIncludingDeleted', () => {
  it('keeps a tombstone that only getNoteIncludingDeleted answers with', () => {
    const note = notes.createNote('Gone', paragraph('bye'))
    notes.deleteNote(note.id)
    expect(notes.getNote(note.id)).toBeNull()
    expect(notes.listNotes()).toEqual([])
    const tombstone = notes.getNoteIncludingDeleted(note.id)
    expect(tombstone).toMatchObject({ id: note.id, title: 'Gone', isDeleted: true })
    expect(tombstone!.updatedAt).toBeGreaterThanOrEqual(note.updatedAt)
  })

  it('answers null for a note that never existed', () => {
    expect(notes.getNoteIncludingDeleted('nope')).toBeNull()
  })
})

describe('upsertFromRemote', () => {
  it('inserts a document body with its plain text, stamped as the Worker stamped it', () => {
    notes.upsertFromRemote('r1', {
      title: 'Remote',
      body: paragraph('from the cloud'),
      tags: [],
      createdAt: 5,
      updatedAt: 7,
      isDeleted: false
    })
    const note = notes.getNote('r1')
    expect(note?.plainText).toBe('from the cloud')
    expect(note?.createdAt).toBe(5)
    expect(note?.updatedAt).toBe(7)
    expect(note?.lastSyncedAt).not.toBeNull()
  })

  it('converts a legacy markdown body and updates an existing row', () => {
    notes.createNote('Local', paragraph('local words'))
    const existing = notes.listNotes()[0]
    notes.upsertFromRemote(existing.id, {
      title: 'Local',
      body: '**bold** remote',
      tags: ['t'],
      createdAt: 1,
      updatedAt: existing.updatedAt + 1,
      isDeleted: false
    })
    const note = notes.getNote(existing.id)
    expect(note?.plainText).toBe('bold remote')
    expect(note?.tags).toEqual(['t'])
    expect(note?.updatedAt).toBe(existing.updatedAt + 1)
    expect(notes.searchNotes('remote').map((n) => n.id)).toEqual([existing.id])
  })

  it('turns a local note into a tombstone, and a tombstone back into a note', () => {
    const note = notes.createNote('Mine', paragraph('words'))
    notes.upsertFromRemote(note.id, {
      title: 'Mine',
      body: note.body,
      tags: [],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt + 1,
      isDeleted: true
    })
    expect(notes.getNote(note.id)).toBeNull()
    expect(notes.getNoteIncludingDeleted(note.id)?.isDeleted).toBe(true)

    notes.upsertFromRemote(note.id, {
      title: 'Mine',
      body: note.body,
      tags: [],
      createdAt: note.createdAt,
      updatedAt: note.updatedAt + 2,
      isDeleted: false
    })
    expect(notes.getNote(note.id)?.updatedAt).toBe(note.updatedAt + 2)
  })
})

describe('markSynced / enqueueSyncAction', () => {
  it('clears the queue for a note and lets it be queued again', () => {
    const note = notes.createNote()
    notes.markSynced(note.id)
    expect(notes.getDirtyNotes()).toEqual([])
    notes.enqueueSyncAction(note.id, 'upsert')
    notes.enqueueSyncAction(note.id, 'upsert')
    expect(notes.getDirtyNotes().map((n) => n.id)).toEqual([note.id])
  })

  it("takes the Worker's stamp as the note's updatedAt when it is later", () => {
    const note = notes.createNote()
    notes.markSynced(note.id, note.updatedAt + 50)
    expect(notes.getNote(note.id)?.updatedAt).toBe(note.updatedAt + 50)
    // An edit that landed meanwhile is later still; the stamp never turns time back.
    notes.markSynced(note.id, note.updatedAt - 50)
    expect(notes.getNote(note.id)?.updatedAt).toBe(note.updatedAt + 50)
  })
})

describe('getDirtyNotes', () => {
  it('includes tombstones, so a deletion can be pushed', () => {
    const kept = notes.createNote('Kept')
    const gone = notes.createNote('Gone')
    notes.markSynced(kept.id)
    notes.markSynced(gone.id)
    notes.deleteNote(gone.id)
    const dirty = notes.getDirtyNotes()
    expect(dirty.map((n) => n.id)).toEqual([gone.id])
    expect(dirty[0].isDeleted).toBe(true)
  })
})
