import { describe, expect, it } from 'vitest'
import {
  MAX_NOTE_BODY_LENGTH,
  NoteIdSchema,
  NotePushSchema,
  NoteRecordSchema,
  NotesPageSchema
} from '../sync'

const body = '# A heading\n\nhello\n'

describe('NoteIdSchema', () => {
  it('takes a uuid and refuses path characters', () => {
    expect(NoteIdSchema.safeParse('0f8fad5b-d9cb-469f-a165-70867728950e').success).toBe(true)
    expect(NoteIdSchema.safeParse('a/b').success).toBe(false)
    expect(NoteIdSchema.safeParse('').success).toBe(false)
    expect(NoteIdSchema.safeParse('x'.repeat(65)).success).toBe(false)
  })
})

describe('NotePushSchema', () => {
  const push = { title: 'T', body, tags: ['a', 'b'], createdAt: 1, isDeleted: false }

  it('parses what the app sends', () => {
    expect(NotePushSchema.parse(push)).toEqual(push)
  })

  it('leaves out an updatedAt from the client, and refuses empty tags and a bad date', () => {
    expect(NotePushSchema.parse({ ...push, updatedAt: 5 })).toEqual(push)
    expect(NotePushSchema.safeParse({ ...push, tags: [''] }).success).toBe(false)
    expect(NotePushSchema.safeParse({ ...push, createdAt: -1 }).success).toBe(false)
  })

  // No one who carries a body reads it.
  it('takes a body as text, whatever it holds, within the size limit', () => {
    const odd = { ...push, body: '# A heading\n\n<Unknown tag' }
    expect(NotePushSchema.parse(odd)).toEqual(odd)
    expect(NotePushSchema.parse({ ...push, body: '' }).body).toBe('')
    expect(
      NotePushSchema.safeParse({ ...push, body: 'x'.repeat(MAX_NOTE_BODY_LENGTH + 1) }).success
    ).toBe(false)
    expect(NotePushSchema.safeParse({ ...push, body: undefined }).success).toBe(false)
  })
})

describe('NoteRecordSchema and NotesPageSchema', () => {
  const record = {
    id: 'n-1',
    title: '',
    body,
    tags: [],
    createdAt: 1,
    updatedAt: 2,
    isDeleted: true
  }

  it('parses a listed note and a page', () => {
    expect(NoteRecordSchema.parse(record)).toEqual(record)
    expect(NotesPageSchema.parse({ notes: [record], cursor: 'abc', hasMore: true })).toEqual({
      notes: [record],
      cursor: 'abc',
      hasMore: true
    })
    expect(NotesPageSchema.parse({ notes: [], cursor: null, hasMore: false }).cursor).toBeNull()
  })

  it('needs the stamp, the cursor and the flag', () => {
    const unstamped = { ...record, updatedAt: undefined }
    expect(NoteRecordSchema.safeParse(unstamped).success).toBe(false)
    expect(NotesPageSchema.safeParse({ notes: [], cursor: null }).success).toBe(false)
    expect(NotesPageSchema.safeParse({ notes: [], hasMore: false }).success).toBe(false)
  })
})
