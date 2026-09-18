import { describe, expect, it } from 'vitest'
import { EMPTY_DOCUMENT, serializeDocument } from '../document'
import {
  MAX_NOTE_BODY_LENGTH,
  NoteBodySchema,
  NoteIdSchema,
  NotePushSchema,
  NoteRecordSchema,
  NotesPageSchema,
  isDocumentJson
} from '../sync'

const body = serializeDocument({
  type: 'doc',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'hello' }] }]
})

describe('isDocumentJson', () => {
  it('accepts a serialized document, empty or not', () => {
    expect(isDocumentJson(body)).toBe(true)
    expect(isDocumentJson(serializeDocument(EMPTY_DOCUMENT))).toBe(true)
  })

  it('refuses markdown, other JSON and broken JSON', () => {
    expect(isDocumentJson('# A heading')).toBe(false)
    expect(isDocumentJson('{"type":"note"}')).toBe(false)
    expect(isDocumentJson('{"type":"doc","content":[{"type":"mystery"}]}')).toBe(false)
    expect(isDocumentJson('{')).toBe(false)
  })
})

describe('NoteBodySchema', () => {
  it('is a document within the size limit', () => {
    expect(NoteBodySchema.safeParse(body).success).toBe(true)
    expect(NoteBodySchema.safeParse('plain text').success).toBe(false)
    expect(NoteBodySchema.safeParse('x'.repeat(MAX_NOTE_BODY_LENGTH + 1)).success).toBe(false)
  })
})

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

  it('refuses an updatedAt from the client, empty tags and a bad body', () => {
    expect(NotePushSchema.parse({ ...push, updatedAt: 5 })).toEqual(push)
    expect(NotePushSchema.safeParse({ ...push, tags: [''] }).success).toBe(false)
    expect(NotePushSchema.safeParse({ ...push, body: 'nope' }).success).toBe(false)
    expect(NotePushSchema.safeParse({ ...push, createdAt: -1 }).success).toBe(false)
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
