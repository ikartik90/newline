import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getDb } from '../../db/database'
import * as notes from '../notes'

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

/** A note's body of one line. */
const paragraph = (text: string): string => `${text}\n`

const MDX = [
  '# Heading',
  '',
  'Some <mark>marked</mark> words <Sidenote note="an aside">here</Sidenote>.',
  '',
  '<BlockStyle size="sm" color="muted">',
  'A small line.',
  '</BlockStyle>',
  ''
].join('\n')

beforeEach(() => {
  getDb().exec('DELETE FROM notes; DELETE FROM sync_queue; DELETE FROM app_meta')
})

describe('createNote', () => {
  it('starts a note empty', () => {
    const note = notes.createNote('New')
    expect(note).toMatchObject({ title: 'New', body: '', plainText: '' })
    expect(notes.getNote(note.id)).toEqual(note)
  })

  it('keeps a body as it is handed in, and reads its words for search', () => {
    const note = notes.createNote('Title', MDX)
    expect(note.body).toBe(MDX)
    expect(note.plainText).toBe('Heading\nSome marked words here.\nan aside\nA small line.')
    expect(notes.getNote(note.id)).toEqual(note)
  })

  it('queues the note for sync', () => {
    const note = notes.createNote()
    expect(notes.getDirtyNotes().map((n) => n.id)).toEqual([note.id])
  })
})

describe('updateNote', () => {
  it('re-derives plain text when the body changes, and only then', () => {
    const note = notes.createNote('T', paragraph('one'))
    const renamed = notes.updateNote(note.id, { title: 'Renamed', tags: ['t'] })
    expect(renamed?.plainText).toBe('one')
    expect(renamed?.body).toBe(paragraph('one'))

    const edited = notes.updateNote(note.id, { body: 'Edited *here*.\n' })
    expect(edited?.plainText).toBe('Edited here.')
    expect(edited?.body).toBe('Edited *here*.\n')
  })

  it('keeps a body it cannot read as it came, and still finds its words', () => {
    const broken = 'A line.\n\n<Sidenote note="'
    const note = notes.createNote()
    expect(notes.updateNote(note.id, { body: broken })?.body).toBe(broken)
    expect(notes.searchNotes('line').map((n) => n.id)).toEqual([note.id])
  })
})

describe('searchNotes', () => {
  it("matches title, tags and plain text but never the MDX's own signs", () => {
    const a = notes.createNote('Groceries', MDX)
    const b = notes.createNote('Work', paragraph('quarterly review'))
    notes.updateNote(b.id, { tags: ['office'] })

    expect(notes.searchNotes('marked').map((n) => n.id)).toEqual([a.id])
    expect(notes.searchNotes('aside').map((n) => n.id)).toEqual([a.id])
    expect(notes.searchNotes('Groc').map((n) => n.id)).toEqual([a.id])
    expect(notes.searchNotes('office').map((n) => n.id)).toEqual([b.id])
    expect(notes.searchNotes('BlockStyle')).toEqual([])
    expect(notes.searchNotes('Sidenote')).toEqual([])
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
  it('inserts a body with its plain text, stamped as the Worker stamped it', () => {
    notes.upsertFromRemote('r1', {
      title: 'Remote',
      body: paragraph('from the cloud'),
      tags: [],
      createdAt: 5,
      updatedAt: 7,
      isDeleted: false
    })
    const note = notes.getNote('r1')
    expect(note?.body).toBe(paragraph('from the cloud'))
    expect(note?.plainText).toBe('from the cloud')
    expect(note?.createdAt).toBe(5)
    expect(note?.updatedAt).toBe(7)
    expect(note?.lastSyncedAt).not.toBeNull()
  })

  it('updates an existing row', () => {
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

describe('a note as the app is handed it', () => {
  it('is these fields and no others', () => {
    const note = notes.createNote('T', paragraph('one'))
    expect(Object.keys(notes.getNote(note.id)!).sort()).toEqual([
      'body',
      'createdAt',
      'id',
      'isDeleted',
      'lastSyncedAt',
      'plainText',
      'tags',
      'title',
      'updatedAt'
    ])
  })
})
