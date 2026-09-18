import {
  MAX_NOTE_BODY_LENGTH,
  NOTES_PAGE_DEFAULT_LIMIT,
  NOTES_PAGE_MAX_LIMIT,
  NoteIdSchema,
  NotePushSchema,
  type NotePush
} from '@shared/domain/sync'
import { requireSession } from '../auth/bearer'
import type { AppEnv } from '../env'
import { HttpError, json, readJsonObject } from '../http'
import { decodeCursor, type NoteCursor } from '../notes/cursor'
import { listNotesAfter, putNote } from '../notes/store'
import type { Router } from '../router'

export interface NotesRouteDeps {
  now: () => number
}

function validId(id: string | undefined): string {
  if (!id || !NoteIdSchema.safeParse(id).success) throw new HttpError(400, 'invalid_id')
  return id
}

/**
 * The note a PUT carries. A body over the limit is refused before anything
 * looks inside it; a body that is a string but not a document is
 * `invalid_body`, which the app can act on; anything else malformed is
 * `bad_request`.
 */
function parsePush(input: Record<string, unknown>): NotePush {
  const isString = typeof input.body === 'string'
  if (isString && (input.body as string).length > MAX_NOTE_BODY_LENGTH) {
    throw new HttpError(413, 'too_large')
  }
  const parsed = NotePushSchema.safeParse(input)
  if (parsed.success) return parsed.data
  const onlyBody = isString && parsed.error.issues.every((issue) => issue.path[0] === 'body')
  throw new HttpError(400, onlyBody ? 'invalid_body' : 'bad_request')
}

/** `?cursor=`: absent means from the beginning; one that does not decode is `bad_request`. */
function parseCursor(url: URL): NoteCursor | null {
  const raw = url.searchParams.get('cursor')
  if (raw === null) return null
  const cursor = decodeCursor(raw)
  if (cursor === null) throw new HttpError(400, 'bad_request')
  return cursor
}

/** `?limit=`: a positive integer, clamped to the maximum; absent means the default. */
function parseLimit(url: URL): number {
  const raw = url.searchParams.get('limit')
  if (raw === null) return NOTES_PAGE_DEFAULT_LIMIT
  const limit = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(limit) || limit < 1) throw new HttpError(400, 'bad_request')
  return Math.min(limit, NOTES_PAGE_MAX_LIMIT)
}

export function registerNotesRoutes(router: Router<AppEnv>, deps: NotesRouteDeps): void {
  router.on('PUT', '/notes/:id', async ({ request, env, params }) => {
    const now = deps.now()
    const { user } = await requireSession(env.DB, request, now)
    const id = validId(params.id)
    const push = parsePush(await readJsonObject(request))
    await putNote(env.DB, user.id, id, push, now)
    return json({ id, updatedAt: now })
  })

  router.on('GET', '/notes', async ({ request, env, url }) => {
    const { user } = await requireSession(env.DB, request, deps.now())
    const cursor = parseCursor(url)
    const limit = parseLimit(url)
    return json(await listNotesAfter(env.DB, user.id, cursor, limit))
  })
}
