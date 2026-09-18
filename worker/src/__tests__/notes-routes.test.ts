import { env } from 'cloudflare:workers'
import { describe, expect, it } from 'vitest'
import {
  MAX_NOTE_BODY_LENGTH,
  NOTES_PAGE_DEFAULT_LIMIT,
  NOTES_PAGE_MAX_LIMIT,
  NotePushResultSchema,
  NotesPageSchema,
  type NotePush,
  type NotePushResult,
  type NotesPage
} from '@shared/domain/sync'
import type { App } from '../app'
import { encodeCursor } from '../notes/cursor'
import { call, signedInUser, testApp, type SignedInUser } from './helpers'

const NOTE_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const NOW = Date.UTC(2026, 8, 17, 12)

const DOCUMENT = JSON.stringify({
  type: 'doc',
  content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello' }] }]
})
const EMPTY_DOCUMENT = JSON.stringify({ type: 'doc', content: [] })

/** What the app sends for a note; the clock stands still unless a test says otherwise. */
function push(overrides: Partial<NotePush> = {}): NotePush {
  return {
    title: 'Hello',
    body: DOCUMENT,
    tags: ['work', 'ideas'],
    createdAt: NOW - 60_000,
    isDeleted: false,
    ...overrides
  }
}

function frozenApp(): App {
  return testApp({ now: () => NOW })
}

/** An app whose clock moves a second per request, so every PUT gets its own stamp. */
function tickingApp(): App {
  let clock = NOW
  return testApp({ now: () => (clock += 1000) })
}

function putNote(who: SignedInUser, id: string, body: unknown, app: App = frozenApp()) {
  return call(app, `/notes/${id}`, {
    method: 'PUT',
    headers: { ...who.auth, 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
}

async function putOk(
  who: SignedInUser,
  id: string,
  body: NotePush,
  app?: App
): Promise<NotePushResult> {
  const response = await putNote(who, id, body, app)
  expect(response.status).toBe(200)
  return NotePushResultSchema.parse(await response.json())
}

function listNotes(who: SignedInUser, query = '', app: App = frozenApp()) {
  return call(app, `/notes${query}`, { headers: who.auth })
}

async function listOk(who: SignedInUser, query = '', app?: App): Promise<NotesPage> {
  const response = await listNotes(who, query, app)
  expect(response.status).toBe(200)
  return NotesPageSchema.parse(await response.json())
}

async function storedRow(who: SignedInUser, id: string) {
  return env.DB.prepare(
    `SELECT title, body, tags, created_at, updated_at, is_deleted
     FROM notes WHERE user_id = ? AND id = ?`
  )
    .bind(who.user.id, id)
    .first()
}

/** Rows written straight to D1, all stamped `NOW`, ids `n0000`… in order. */
async function seedNotes(who: SignedInUser, count: number): Promise<void> {
  const insert = env.DB.prepare(
    `INSERT INTO notes (user_id, id, title, body, tags, created_at, updated_at, is_deleted)
     VALUES (?, ?, '', ?, '[]', ?, ?, 0)`
  )
  const statements = Array.from({ length: count }, (_, i) =>
    insert.bind(who.user.id, `n${String(i).padStart(4, '0')}`, EMPTY_DOCUMENT, NOW, NOW)
  )
  for (let i = 0; i < statements.length; i += 100) {
    await env.DB.batch(statements.slice(i, i + 100))
  }
}

function base64url(text: string): string {
  return btoa(text).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

describe('PUT /notes/<id>', () => {
  it('creates the note, stamped with the Worker’s clock', async () => {
    const who = await signedInUser()

    const result = await putOk(who, NOTE_ID, push())

    expect(result).toEqual({ id: NOTE_ID, updatedAt: NOW })
    await expect(storedRow(who, NOTE_ID)).resolves.toEqual({
      title: 'Hello',
      body: DOCUMENT,
      tags: '["work","ideas"]',
      created_at: NOW - 60_000,
      updated_at: NOW,
      is_deleted: 0
    })
    const { notes } = await listOk(who)
    expect(notes).toEqual([{ id: NOTE_ID, ...push(), updatedAt: NOW }])
  })

  it('replaces the note whole and re-stamps it', async () => {
    const app = tickingApp()
    const who = await signedInUser()
    const first = await putOk(who, NOTE_ID, push(), app)

    const second = await putOk(
      who,
      NOTE_ID,
      push({ title: 'Renamed', body: EMPTY_DOCUMENT, tags: [] }),
      app
    )

    expect(second.id).toBe(NOTE_ID)
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt)
    const { notes } = await listOk(who, '', app)
    expect(notes).toEqual([
      {
        id: NOTE_ID,
        title: 'Renamed',
        body: EMPTY_DOCUMENT,
        tags: [],
        createdAt: NOW - 60_000,
        updatedAt: second.updatedAt,
        isDeleted: false
      }
    ])
  })

  it('round-trips a tombstone', async () => {
    const who = await signedInUser()
    await putOk(who, NOTE_ID, push())

    await putOk(who, NOTE_ID, push({ isDeleted: true }))

    const { notes } = await listOk(who)
    expect(notes.map((note) => [note.id, note.isDeleted])).toEqual([[NOTE_ID, true]])
    expect((await storedRow(who, NOTE_ID))?.is_deleted).toBe(1)
  })

  it.each(['has.dot', 'sp ace', 'x'.repeat(65)])('is 400 invalid_id for %j', async (id) => {
    const who = await signedInUser()

    const response = await putNote(who, id, push())

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_id' })
  })

  it.each([
    ['markdown', '# Hello\n\nworld'],
    ['a JSON object that is not a document', JSON.stringify({ hello: 'world' })],
    [
      'a document with an unknown block',
      JSON.stringify({ type: 'doc', content: [{ type: 'nope' }] })
    ]
  ])('is 400 invalid_body for %s, storing nothing', async (_, body) => {
    const who = await signedInUser()

    const response = await putNote(who, NOTE_ID, push({ body }))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'invalid_body' })
    await expect(storedRow(who, NOTE_ID)).resolves.toBeNull()
  })

  it.each(['title', 'body', 'tags', 'createdAt', 'isDeleted'] as const)(
    'is 400 bad_request without %s',
    async (field) => {
      const who = await signedInUser()

      const response = await putNote(who, NOTE_ID, { ...push(), [field]: undefined })

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
    }
  )

  it.each([
    ['an empty tag', push({ tags: [''] })],
    ['a body that is not a string', { ...push(), body: { type: 'doc', content: [] } }],
    ['a fractional createdAt', push({ createdAt: 1.5 })],
    ['a JSON array', []]
  ])('is 400 bad_request for %s', async (_, body) => {
    const who = await signedInUser()

    const response = await putNote(who, NOTE_ID, body)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })

  it('is 413 too_large for a body over the limit, before looking at what it is', async () => {
    const who = await signedInUser()

    const response = await putNote(
      who,
      NOTE_ID,
      push({ body: 'x'.repeat(MAX_NOTE_BODY_LENGTH + 1) })
    )

    expect(response.status).toBe(413)
    await expect(response.json()).resolves.toEqual({ error: 'too_large' })
    await expect(storedRow(who, NOTE_ID)).resolves.toBeNull()
  })
})

describe('GET /notes', () => {
  it('lists every note from the beginning, oldest change first, with the cursor after the last', async () => {
    const app = tickingApp()
    const who = await signedInUser()
    await putOk(who, 'b', push({ title: 'B' }), app)
    const a = await putOk(who, 'a', push({ title: 'A' }), app)
    const c = await putOk(who, 'c', push({ title: 'C' }), app)
    const bAgain = await putOk(who, 'b', push({ title: 'B again' }), app)

    const page = await listOk(who, '', app)

    expect(page.notes.map((note) => note.title)).toEqual(['A', 'C', 'B again'])
    expect(page.notes.map((note) => note.updatedAt)).toEqual([
      a.updatedAt,
      c.updatedAt,
      bAgain.updatedAt
    ])
    expect(page.cursor).toBe(encodeCursor({ updatedAt: bAgain.updatedAt, id: 'b' }))
    expect(page.hasMore).toBe(false)
  })

  it('lists only what changed after the cursor', async () => {
    const app = tickingApp()
    const who = await signedInUser()
    await putOk(who, 'a', push({ title: 'A' }), app)
    const { cursor } = await listOk(who, '', app)
    const d = await putOk(who, 'd', push({ title: 'D' }), app)

    const page = await listOk(who, `?cursor=${cursor}`, app)

    expect(page.notes.map((note) => note.title)).toEqual(['D'])
    expect(page.cursor).toBe(encodeCursor({ updatedAt: d.updatedAt, id: 'd' }))
    expect(page.hasMore).toBe(false)
  })

  it('pages with limit=2 over five notes stamped in the same millisecond, skipping and repeating none', async () => {
    const app = frozenApp()
    const who = await signedInUser()
    for (const id of ['e', 'c', 'a', 'd', 'b']) await putOk(who, id, push({ title: id }), app)

    const first = await listOk(who, '?limit=2', app)
    const second = await listOk(who, `?limit=2&cursor=${first.cursor}`, app)
    const third = await listOk(who, `?limit=2&cursor=${second.cursor}`, app)

    expect(first.notes.map((note) => note.id)).toEqual(['a', 'b'])
    expect(first.cursor).toBe(encodeCursor({ updatedAt: NOW, id: 'b' }))
    expect(first.hasMore).toBe(true)
    expect(second.notes.map((note) => note.id)).toEqual(['c', 'd'])
    expect(second.cursor).toBe(encodeCursor({ updatedAt: NOW, id: 'd' }))
    expect(second.hasMore).toBe(true)
    expect(third.notes.map((note) => note.id)).toEqual(['e'])
    expect(third.cursor).toBe(encodeCursor({ updatedAt: NOW, id: 'e' }))
    expect(third.hasMore).toBe(false)
  })

  it('echoes the sent cursor on an empty page, and null when none was sent', async () => {
    const who = await signedInUser()

    await expect(listOk(who)).resolves.toEqual({ notes: [], cursor: null, hasMore: false })

    await putOk(who, 'a', push())
    const { cursor } = await listOk(who)
    await expect(listOk(who, `?cursor=${cursor}`)).resolves.toEqual({
      notes: [],
      cursor,
      hasMore: false
    })
  })

  it(`defaults the page to ${NOTES_PAGE_DEFAULT_LIMIT} and clamps limit to ${NOTES_PAGE_MAX_LIMIT}`, async () => {
    const who = await signedInUser()
    await seedNotes(who, NOTES_PAGE_MAX_LIMIT + 1)

    const byDefault = await listOk(who)
    const clamped = await listOk(who, '?limit=5000')
    const rest = await listOk(who, `?limit=5000&cursor=${clamped.cursor}`)

    expect(byDefault.notes).toHaveLength(NOTES_PAGE_DEFAULT_LIMIT)
    expect(byDefault.hasMore).toBe(true)
    expect(clamped.notes).toHaveLength(NOTES_PAGE_MAX_LIMIT)
    expect(clamped.notes.at(-1)?.id).toBe('n0999')
    expect(clamped.hasMore).toBe(true)
    expect(rest.notes.map((note) => note.id)).toEqual(['n1000'])
    expect(rest.hasMore).toBe(false)
  })

  it.each(['0', '-1', 'abc', '1.5', ''])('is 400 bad_request for limit=%s', async (limit) => {
    const who = await signedInUser()

    const response = await listNotes(who, `?limit=${limit}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })

  it.each([
    ['not base64url', '!!!'],
    ['an empty string', ''],
    ['no colon', base64url('nocolon')],
    ['a non-integer timestamp', base64url('abc:id')],
    ['an id that is not a note id', base64url('5:bad id')]
  ])('is 400 bad_request for a cursor that is %s', async (_, cursor) => {
    const who = await signedInUser()

    const response = await listNotes(who, `?cursor=${encodeURIComponent(cursor)}`)

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({ error: 'bad_request' })
  })

  it('never lists another user’s notes, even under the same id', async () => {
    const owner = await signedInUser()
    const other = await signedInUser()
    await putOk(owner, NOTE_ID, push({ title: 'Mine' }))
    await putOk(other, NOTE_ID, push({ title: 'Theirs' }))

    const mine = await listOk(owner)
    const theirs = await listOk(other)

    expect(mine.notes.map((note) => note.title)).toEqual(['Mine'])
    expect(theirs.notes.map((note) => note.title)).toEqual(['Theirs'])
  })
})

describe('without a session', () => {
  it.each([
    ['PUT', `/notes/${NOTE_ID}`],
    ['GET', '/notes']
  ])('%s %s is 401 unauthorized', async (method, path) => {
    const anonymous = await call(testApp(), path, { method })
    const forged = await call(testApp(), path, {
      method,
      headers: { authorization: 'Bearer nobody-minted-this' }
    })

    expect(anonymous.status).toBe(401)
    await expect(anonymous.json()).resolves.toEqual({ error: 'unauthorized' })
    expect(forged.status).toBe(401)
  })
})
