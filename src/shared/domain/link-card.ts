import { z } from 'zod'
import { MediaNodeSchema } from './media-node'

// ---------------------------------------------------------------------------
// The link card's configuration — a picture, some words and a destination.
//
// Grouped by SECTION rather than flattened, because the sections are the
// properties: the rail adds and removes them, and an absent key is a section
// that was never added. Nothing is required: a card that has been placed but
// not yet filled in is a real record.
// ---------------------------------------------------------------------------

/** The tone the caption is drawn in, and the ground it stands on. */
export const LinkCardToneSchema = z.enum(['light', 'dark'])

export type LinkCardTone = z.infer<typeof LinkCardToneSchema>

/**
 * The picture, per theme. `dark` is optional: absent means "use the light
 * one". Whole media nodes, so the card's picture carries fit, inset and corner.
 */
export const LinkCardMediaSchema = z.object({
  light: MediaNodeSchema.optional(),
  dark: MediaNodeSchema.optional()
})

export type LinkCardMedia = z.infer<typeof LinkCardMediaSchema>

/** The words on the card, and the ground they stand on. */
export const LinkCardContentSchema = z.object({
  title: z.string().optional(),
  /** The line above the title. */
  meta: z.string().optional(),
  scrim: z.boolean().optional(),
  tone: LinkCardToneSchema.optional()
})

export type LinkCardContent = z.infer<typeof LinkCardContentSchema>

/** Which sort of place the card goes. */
export const LinkTargetKindSchema = z.enum(['external', 'document'])

export type LinkTargetKind = z.infer<typeof LinkTargetKindSchema>

const newTab = z.boolean().optional()

/**
 * Where the card goes, and WHICH SORT of place that is. The kind is stored
 * because a PDF in the bucket and a third-party page are both absolute URLs
 * and only the author knows which they meant. The href is optional: you say
 * what sort of link you want, then you go and find it.
 */
export const LinkCardLinkSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('external'), href: z.url().optional(), newTab }),
  z.object({ kind: z.literal('document'), href: z.url().optional(), newTab })
])

export type LinkCardLink = z.infer<typeof LinkCardLinkSchema>

export const LinkCardConfigSchema = z.object({
  media: LinkCardMediaSchema.optional(),
  content: LinkCardContentSchema.optional(),
  link: LinkCardLinkSchema.optional()
})

export type LinkCardConfig = z.infer<typeof LinkCardConfigSchema>

/** Where this card goes, or nothing for one not yet pointed anywhere. */
export function linkCardHref(config: LinkCardConfig): string | undefined {
  return config.link?.href
}

/**
 * What the card is CALLED — the words on it, failing that where it goes. A
 * picture-only card still needs an accessible name.
 */
export function linkCardTitle(config: LinkCardConfig): string | undefined {
  const written = config.content?.title?.trim()
  if (written) return written
  return config.link?.href || undefined
}
