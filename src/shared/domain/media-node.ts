import { z } from 'zod'

// ---------------------------------------------------------------------------
// Media — a picture or a clip of a note, and the box either one is held in
// while it has nothing to paint.
// ---------------------------------------------------------------------------

const BaseMediaSchema = z.object({
  // The BLOCK's identity, constant across pictures and clips.
  type: z.literal('media'),
  // A public URL once uploaded, or `local://<file>` while it only exists on
  // this machine.
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  // The SOURCE's own pixel size, recorded at insert. Only the ratio is read,
  // to reserve a box before the bytes arrive. Positive integers: a replaced
  // element that has not loaded reports 0, which must never be stored.
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional()
})

/**
 * A picture or a clip, told apart by `kind` rather than by sniffing the URL.
 * A discriminated union so a clip can hold things a picture cannot.
 */
export const MediaNodeSchema = z.discriminatedUnion('kind', [
  BaseMediaSchema.extend({ kind: z.literal('image') }),
  BaseMediaSchema.extend({
    kind: z.literal('video'),
    /** The frame a clip shows where it cannot play. */
    poster: z.string().optional()
  })
])

export type MediaNode = z.infer<typeof MediaNodeSchema>

export type MediaKind = MediaNode['kind']

/** The shape a media object is given while it has nothing to show. */
export const MEDIA_PLACEHOLDER_ASPECT = '3 / 2'

export type MediaShape = Pick<MediaNode, 'width' | 'height'>

/** The `aspect-ratio` to hold the box at until the source can size itself. */
export function mediaReservedAspect(shape: MediaShape): string {
  const { width, height } = shape
  if (!width || !height) return MEDIA_PLACEHOLDER_ASPECT
  return `${width} / ${height}`
}
