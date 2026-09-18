import { vi } from 'vitest'
import { NotePushSchema, type NoteRecord } from '@shared/domain/sync'

// ---------------------------------------------------------------------------
// A stand-in for the Worker's `/notes` routes (`worker/README.md`, Notes)
// behind `fetch`: the user's notes in a Map, a clock that stamps every PUT,
// and the keyset cursor the real one pages with. A test installs it with
//
//   vi.stubGlobal('fetch', fetchMock)
//   vi.stubEnv('MAIN_VITE_API_URL', BASE_URL)
//
// then seeds or reads `store`, and reads `requests` for what sync.ts sent.
// ---------------------------------------------------------------------------

export const BASE_URL = 'https://api.example.com'

export const store = new Map<string, NoteRecord>()

/** One request as the Worker would have seen it, oldest first. */
export interface SeenRequest {
  method: string
  path: string
  query: URLSearchParams
  headers: Headers
  body: unknown
}

export const requests: SeenRequest[] = []

/**
 * The Worker's clock: the stamp of the last write. It reads the wall clock,
 * as the real one does, and never stamps two writes alike.
 */
let clock = Date.now()
let pageLimit = 500
let failure: Error | null = null
let refusal: { status: number; code: string } | null = null
const refusedNotes = new Map<string, { status: number; code: string }>()

function tick(): number {
  clock = Math.max(clock + 1, Date.now())
  return clock
}

export function resetFakeNotesWorker(): void {
  store.clear()
  requests.length = 0
  clock = Date.now()
  pageLimit = 500
  failure = null
  refusal = null
  refusedNotes.clear()
  fetchMock.mockReset()
}

/** Make every request reject until reset: the machine is offline. */
export function failWith(error: Error | null): void {
  failure = error
}

/** Make the Worker answer every request with this error until reset. */
export function refuseWith(status: number, code: string): void
export function refuseWith(status: null): void
export function refuseWith(status: number | null, code = 'error'): void {
  refusal = status === null ? null : { status, code }
}

/** Make the Worker refuse PUTs of one note, as it would a body it cannot take. */
export function refuseNote(id: string, status: number, code: string): void {
  refusedNotes.set(id, { status, code })
}

/** How many notes one page carries; the real default is 500. */
export function setPageLimit(limit: number): void {
  pageLimit = limit
}

/**
 * A note as another device left it. Without `updatedAt` the clock stamps it,
 * as a PUT would; with one, the clock catches up so later writes stay newer.
 */
export function seed(record: Omit<NoteRecord, 'updatedAt'> & { updatedAt?: number }): NoteRecord {
  const updatedAt = record.updatedAt ?? tick()
  clock = Math.max(clock, updatedAt)
  const stored: NoteRecord = { ...record, updatedAt }
  store.set(stored.id, stored)
  return stored
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' }
  })
}

function encodeCursor(note: NoteRecord): string {
  return Buffer.from(`${note.updatedAt}:${note.id}`).toString('base64url')
}

function decodeCursor(cursor: string): { updatedAt: number; id: string } | null {
  const text = Buffer.from(cursor, 'base64url').toString()
  const colon = text.indexOf(':')
  if (colon === -1) return null
  const updatedAt = Number(text.slice(0, colon))
  return Number.isInteger(updatedAt) ? { updatedAt, id: text.slice(colon + 1) } : null
}

function byStamp(a: NoteRecord, b: NoteRecord): number {
  return a.updatedAt - b.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
}

function listPage(cursor: string | null): Response {
  const after = cursor === null ? null : decodeCursor(cursor)
  if (cursor !== null && after === null) return json({ error: 'bad_request' }, 400)
  const rest = [...store.values()]
    .sort(byStamp)
    .filter(
      (note) =>
        after === null ||
        note.updatedAt > after.updatedAt ||
        (note.updatedAt === after.updatedAt && note.id > after.id)
    )
  const notes = rest.slice(0, pageLimit)
  const last = notes.at(-1)
  return json({
    notes,
    cursor: last ? encodeCursor(last) : cursor,
    hasMore: rest.length > notes.length
  })
}

function putNote(id: string, body: unknown): Response {
  const refused = refusedNotes.get(id)
  if (refused) return json({ error: refused.code }, refused.status)
  const parsed = NotePushSchema.safeParse(body)
  if (!parsed.success) return json({ error: 'invalid_body' }, 400)
  const updatedAt = tick()
  store.set(id, { id, ...parsed.data, updatedAt })
  return json({ id, updatedAt })
}

export const fetchMock = vi.fn(
  async (input: string | URL | Request, init: RequestInit = {}): Promise<Response> => {
    const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    const url = new URL(href)
    const method = init.method ?? 'GET'
    const headers = new Headers(init.headers)
    const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
    requests.push({ method, path: url.pathname, query: url.searchParams, headers, body })

    if (failure) throw failure
    if (refusal) return json({ error: refusal.code }, refusal.status)
    if (!headers.get('Authorization')?.startsWith('Bearer ')) {
      return json({ error: 'unauthorized' }, 401)
    }

    const one = url.pathname.match(/^\/notes\/([^/]+)$/)
    if (method === 'PUT' && one) return putNote(decodeURIComponent(one[1]), body)
    if (method === 'GET' && url.pathname === '/notes')
      return listPage(url.searchParams.get('cursor'))
    return json({ error: 'not_found' }, 404)
  }
)
