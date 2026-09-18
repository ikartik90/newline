import { z } from 'zod'
import { DocumentSchema } from './document'

// ---------------------------------------------------------------------------
// What crosses between the app and the Worker's `/notes` routes
// (`worker/README.md`, Notes). Both sides import these, so a note is accepted
// by exactly the rules it was sent under.
// ---------------------------------------------------------------------------

/** The app's note ids are uuids; anything path-safe of a sane length is allowed. */
export const NOTE_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/

export const MAX_NOTE_TITLE_LENGTH = 1000
export const MAX_NOTE_TAGS = 100
export const MAX_NOTE_TAG_LENGTH = 64
/** Characters of body JSON. Media are URLs, so a real note is far smaller. */
export const MAX_NOTE_BODY_LENGTH = 1_000_000

/** True when a stored body is a document the editor can open. */
export function isDocumentJson(body: string): boolean {
  try {
    return DocumentSchema.safeParse(JSON.parse(body)).success
  } catch {
    return false
  }
}

export const NoteIdSchema = z.string().regex(NOTE_ID_PATTERN)

/** A body as it travels: the Document's JSON text, checked to be one. */
export const NoteBodySchema = z
  .string()
  .max(MAX_NOTE_BODY_LENGTH)
  .refine(isDocumentJson, 'body must be a document')

/** What a PUT carries; the Worker stamps `updatedAt` itself. */
export const NotePushSchema = z.object({
  title: z.string().max(MAX_NOTE_TITLE_LENGTH),
  body: NoteBodySchema,
  tags: z.array(z.string().min(1).max(MAX_NOTE_TAG_LENGTH)).max(MAX_NOTE_TAGS),
  createdAt: z.number().int().nonnegative(),
  isDeleted: z.boolean()
})
export type NotePush = z.infer<typeof NotePushSchema>

export const NotePushResultSchema = z.object({
  id: NoteIdSchema,
  updatedAt: z.number().int().nonnegative()
})
export type NotePushResult = z.infer<typeof NotePushResultSchema>

/** A note as the Worker lists it. */
export const NoteRecordSchema = NotePushSchema.extend({
  id: NoteIdSchema,
  updatedAt: z.number().int().nonnegative()
})
export type NoteRecord = z.infer<typeof NoteRecordSchema>

/**
 * One page of `GET /notes`. `cursor` is the position after the last note
 * returned (the one that was sent, or null, when the page is empty): what the
 * app stores and sends next time. `hasMore` says a further page exists now.
 */
export const NotesPageSchema = z.object({
  notes: z.array(NoteRecordSchema),
  cursor: z.string().nullable(),
  hasMore: z.boolean()
})
export type NotesPage = z.infer<typeof NotesPageSchema>

export const NOTES_PAGE_DEFAULT_LIMIT = 500
export const NOTES_PAGE_MAX_LIMIT = 1000

/**
 * What one sync cycle did, as main reports it over `sync:now`. `pushed` is
 * how many dirty notes landed, `pulled` how many local notes a pull changed,
 * and `ok` whether the cycle ran through: it is false without a session and
 * when the Worker could not be reached.
 */
export interface SyncResult {
  pushed: number
  pulled: number
  ok: boolean
}
