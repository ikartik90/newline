import type { CSSProperties } from 'react'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// Media — a picture or a clip, and the box either one sits in.
//
// Ported from kartik.to's `domain/nodes.ts`. The shader background effect and
// the legacy `type: "image"` migration are left behind: no newline document
// predates `kind`, and there is no shader stage to paint behind a picture.
// ---------------------------------------------------------------------------

/**
 * How the media fills the box it is given. Two values rather than the CSS
 * property's five: `cover` crops to fill, `contain` fits the whole frame.
 */
export const MediaFitSchema = z.enum(['cover', 'contain'])

export type MediaFit = z.infer<typeof MediaFitSchema>

export const DEFAULT_MEDIA_FIT: MediaFit = 'cover'

/** The padding slider's grid: eleven stops at 8px. */
export const MEDIA_PADDING_STEP = 8
export const MEDIA_PADDING_MAX = 80

/**
 * The container width a padding value is authored AGAINST. Padding is stored
 * as the pixels it should come to in a container this wide, and rendered as
 * the equivalent percentage, so the same picture keeps its proportions
 * wherever it is shown. 640 is the article's content column.
 */
export const MEDIA_PADDING_REFERENCE = 640

/** The corner slider's grid: eleven stops at 2px, capped at the roundest corner. */
export const MEDIA_RADIUS_STEP = 2
export const MEDIA_RADIUS_MAX = 20

/** What a picture nobody has rounded is: square. */
export const DEFAULT_MEDIA_RADIUS = 0

const BaseMediaSchema = z.object({
  // The BLOCK's identity, constant across pictures and clips.
  type: z.literal('media'),
  // A public URL once uploaded, or `local://<file>` while it only exists on
  // this machine.
  src: z.string(),
  alt: z.string().optional(),
  caption: z.string().optional(),
  objectFit: MediaFitSchema.optional(),
  // Snapped to the slider's own grid; px at `MEDIA_PADDING_REFERENCE`.
  padding: z.number().min(0).max(MEDIA_PADDING_MAX).multipleOf(MEDIA_PADDING_STEP).optional(),
  // Absent is zero — square.
  borderRadius: z.number().min(0).max(MEDIA_RADIUS_MAX).multipleOf(MEDIA_RADIUS_STEP).optional(),
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

/** The two layout properties as the style the media element wears. */
export type MediaLayout = Pick<MediaNode, 'objectFit' | 'padding' | 'borderRadius'>

/** Is there anything to lay out at all? A zero corner answers no. */
export function hasMediaLayout(media: MediaLayout): boolean {
  return Boolean(media.padding) || Boolean(media.borderRadius)
}

/** The corner as the length CSS should draw it: `0`, or a share of the frame's width. */
function mediaRadiusValue(media: MediaLayout): string | number {
  const radius = media.borderRadius ?? DEFAULT_MEDIA_RADIUS
  if (radius === 0) return DEFAULT_MEDIA_RADIUS
  return `${(radius / MEDIA_PADDING_REFERENCE) * 100}cqw`
}

/** The corner in pixels, against a width the caller has measured. */
export function mediaRadiusPx(media: MediaLayout, width: number = MEDIA_PADDING_REFERENCE): number {
  const radius = media.borderRadius ?? DEFAULT_MEDIA_RADIUS
  return (radius / MEDIA_PADDING_REFERENCE) * width
}

/** The inset in pixels, against a width the caller has measured. */
export function mediaInsetPx(media: MediaLayout, width: number = MEDIA_PADDING_REFERENCE): number {
  return ((media.padding ?? 0) / MEDIA_PADDING_REFERENCE) * width
}

/** How much of its box an inset picture is — `1` when nothing surrounds it. */
export function mediaPictureShare(media: MediaLayout): number {
  return 1 - (2 * (media.padding ?? 0)) / MEDIA_PADDING_REFERENCE
}

/**
 * What a HEIGHT budget has to be divided by to leave room for the bands above
 * and below the picture. The bands are the same pixels on every side while
 * the height they eat into is not the width they came out of.
 */
export function mediaHeightBudgetFactor(media: MediaLayout, aspect: number = 1): number {
  const padding = media.padding ?? 0
  if (!padding) return 1
  const share = (padding / MEDIA_PADDING_REFERENCE) * aspect
  return 1 + (2 * share) / mediaPictureShare(media)
}

/** The container an enlarged picture implies, recovered from the picture's width. */
export function mediaContainerWidth(media: MediaLayout, pictureWidth: number): number {
  return pictureWidth / mediaPictureShare(media)
}

/**
 * The FRAME's style — the query container the corner is measured against.
 * Only a corner needs it; an inset is a percentage of the containing block.
 */
export function mediaFrameStyle(media: MediaLayout): CSSProperties {
  if (!media.borderRadius) return { display: 'contents' }
  return {
    containerType: 'inline-size',
    // Containment does not apply to a non-atomic inline box.
    display: 'block',
    width: '100%',
    height: '100%'
  }
}

/** The INNER box — the inset itself, and the centring a `contain` picture needs. */
export function mediaBoxStyle(media: MediaLayout): CSSProperties {
  if (!hasMediaLayout(media)) return { display: 'contents' }
  return {
    padding: `${((media.padding ?? 0) / MEDIA_PADDING_REFERENCE) * 100}%`,
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  }
}

/** The OBJECT's style — the picture itself. */
export function mediaObjectStyle(media: MediaLayout): CSSProperties {
  const objectFit = media.objectFit ?? DEFAULT_MEDIA_FIT
  return {
    objectFit,
    ...(hasMediaLayout(media) && objectFit === 'contain'
      ? { width: 'auto', height: 'auto', maxWidth: '100%', maxHeight: '100%' }
      : {}),
    // ALWAYS stated, zero included, so no surface can round it with a class.
    borderRadius: mediaRadiusValue(media)
  }
}

/** The shape a media object is given while it has nothing to show. */
export const MEDIA_PLACEHOLDER_ASPECT = '3 / 2'

export type MediaShape = Pick<MediaNode, 'width' | 'height'>

/** The `aspect-ratio` to hold the box at until the source can size itself. */
export function mediaReservedAspect(shape: MediaShape): string {
  const { width, height } = shape
  if (!width || !height) return MEDIA_PLACEHOLDER_ASPECT
  return `${width} / ${height}`
}

/**
 * The style that HOLDS a media object's box while its source has nothing to
 * paint. Applied on top of `mediaObjectStyle` and dropped once loaded.
 */
export function mediaReservationStyle(shape: MediaShape, media?: MediaLayout): CSSProperties {
  const reserved: CSSProperties = { aspectRatio: mediaReservedAspect(shape) }
  const sizedToItsContent =
    media && hasMediaLayout(media) && (media.objectFit ?? DEFAULT_MEDIA_FIT) === 'contain'
  return sizedToItsContent ? { ...reserved, width: '100%', height: 'auto' } : reserved
}
