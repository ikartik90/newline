import { Media } from '@/components/media'
import { Typography } from '@/components/ui/typography'
import {
  linkCardHref,
  linkCardTitle,
  type LinkCardConfig,
  type LinkCardTone
} from '@shared/domain/link-card'
import type { MediaNode } from '@shared/domain/nodes'

// ---------------------------------------------------------------------------
// LinkCard — a picture with the name of what it points at written across it.
//
// Drawn from its CONFIG rather than from props per part, because in newline
// the card is only ever what its properties panel authored: a picture per
// theme, some words and a destination, every one of them optional. It has to
// be a real thing at every stage of being built — a picture with no words,
// words with no picture, and, while it is being authored, neither and
// nowhere to go.
//
// One landscape tile: the caption sits at the foot on a scrim (frosting, then
// a wash of the surface colour) that exists only where there is a picture to
// separate the words from, and the tone can PIN the band to one theme, since
// a screenshot does not change when the page does.
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// The `linkCard` recipe's root: one shaped box that clips, with the caption
// pinned to the foot and the hairline drawn OVER everything it holds.
const rootStyle = cx(
  'relative flex flex-col justify-end aspect-video w-full min-w-0 rounded-xl overflow-hidden',
  'bg-surface [--field-bg:var(--field-bg-on-surface)] no-underline',
  'after:content-[""] after:absolute after:inset-0 after:rounded-[inherit] after:border-[0.5px] after:border-solid after:border-divider after:pointer-events-none',
  // Over a picture the caption takes the theme's STRONGEST ink — done by
  // reassigning the tokens the words resolve through, so `Typography` need
  // not know it is standing on a picture.
  'data-[covered]:[--fg-body:var(--fg-title)] data-[covered]:[--fg-default:var(--fg-title)]'
)

const interactiveStyle = 'cursor-pointer active:scale-[0.98] transition-transform duration-150'

// The picture and everything laid over it — out of flow, so it fills the card
// without ever being able to stretch it.
const coverStyle = 'absolute inset-0'

// The positioned box the media composes INSIDE, so tree order settles what
// paints over what.
const mediaFrameStyle = 'absolute inset-0'

const mediaStyle = 'block w-full h-full'

// The box the scrim IS and the box the caption sits in — one element, so the
// scrim is `max(a quarter of the card, the words)` without measuring anything.
const scrimStyle = 'relative flex flex-col justify-end min-h-[25%]'

// The tone reassigns the wash's colour and the caption's ink together, so a
// band pinned light stays light words on a light wash whatever the page does.
const toneStyle: Record<LinkCardTone, string> = {
  light:
    '[--bg-surface:var(--color-neutral-200)] [--fg-title:var(--color-neutral-900)] [--fg-body:var(--color-neutral-900)] [--fg-default:var(--color-neutral-900)]',
  dark: '[--bg-surface:var(--color-neutral-800)] [--fg-title:var(--color-neutral-100)] [--fg-body:var(--color-neutral-100)] [--fg-default:var(--color-neutral-100)]'
}

// The frosting: a backdrop blur that fades out towards the top of the band,
// so the picture softens under the words and nowhere else.
const frostStyle =
  'absolute inset-0 backdrop-frost [mask-image:linear-gradient(to_top,black_30%,transparent)] pointer-events-none'

// The tint over the frosting — the card's own plate colour, so the words keep
// the contrast they have always had against it.
const washStyle = 'absolute inset-0 bg-linear-to-t from-surface to-transparent pointer-events-none'

const captionStyle = 'relative flex flex-col gap-1 p-4'

export interface LinkCardProps {
  config: LinkCardConfig
  /**
   * Whether the card can be followed. False on the editor's canvas: the card
   * is scenery there, and a plain box is drawn — not focusable, not
   * followable — since Enter on a focused link navigates as well as a click.
   */
  interactive?: boolean
  className?: string
}

export function LinkCard({ config, interactive = true, className }: LinkCardProps) {
  const href = linkCardHref(config)
  const light = config.media?.light
  const dark = config.media?.dark
  const title = config.content?.title?.trim() || undefined
  const meta = config.content?.meta?.trim() || undefined
  const tone = config.content?.tone
  const newTab = config.link?.newTab ?? false

  // Either picture counts: a card given only a dark one has a picture in
  // exactly the theme it was given for.
  const covered = Boolean(light || dark)
  // A card with neither word draws no caption box at all — an empty one is a
  // strip of dead space with a scrim shading nothing.
  const captioned = Boolean(title || meta)
  const grounded = config.content?.scrim ?? covered

  const body = (
    <>
      {/* The media is DECORATIVE: the link is named by the words, or by where
          it goes where there are none, and a card that read the picture out
          before its own title would say the picture twice. */}
      <div data-link-card-cover="" className={coverStyle} role="presentation" aria-hidden="true">
        {/* Hidden per theme only where there are TWO. One picture serves both
            themes and must not be hidden in either. */}
        <CardCover media={light} className={dark ? 'dark:hidden' : undefined} />
        {dark && <CardCover media={dark} className={light ? 'hidden dark:block' : undefined} />}
      </div>
      {/* Written in the order they PAINT: the frosting that softens the
          picture, the wash that tints what the frosting produced, and the
          caption over both. */}
      {(captioned || grounded) && (
        <div
          data-link-card-scrim=""
          data-tone={tone}
          className={cx(scrimStyle, tone && toneStyle[tone])}
        >
          {grounded && (
            <>
              <span data-link-card-frost="" className={frostStyle} />
              <span data-link-card-wash="" className={washStyle} />
            </>
          )}
          {captioned && (
            <div data-link-card-caption="" className={captionStyle}>
              {/* Above the title: the title is what the card is called and
                  belongs on the last line before the card's edge. */}
              {meta && (
                <Typography tag="p" type="caption">
                  {meta}
                </Typography>
              )}
              {title && (
                <Typography tag="h2" type="bodyLarge">
                  {title}
                </Typography>
              )}
            </div>
          )}
        </div>
      )}
    </>
  )

  const shared = {
    'data-link-card': '',
    // Whether this tile is a picture or a plate, said once on the card itself.
    'data-covered': covered ? '' : undefined
  }

  // A card with no destination is not a link at all: an anchor with no href
  // is a link to the page you are already on. And on the canvas the card is
  // scenery — a box rather than a control.
  if (!interactive || !href) {
    return (
      <div {...shared} className={cx(rootStyle, className)}>
        {body}
      </div>
    )
  }

  return (
    <a
      {...shared}
      href={href}
      className={cx(rootStyle, interactiveStyle, className)}
      // The name of a card that shows no words. Never set alongside a title,
      // which would win over the visible text.
      aria-label={!title && !meta ? linkCardTitle(config) : undefined}
      target={newTab ? '_blank' : undefined}
      // Never `_blank` without it: the opened page otherwise gets a live
      // handle on this one through `window.opener`.
      rel={newTab ? 'noopener noreferrer' : undefined}
    >
      {body}
    </a>
  )
}

/**
 * One picture in the positioned box it composes inside. Its own component
 * because the card draws this up to twice — once per theme — and the two must
 * be identical in every respect but which of them is showing.
 */
function CardCover({
  media,
  className
}: {
  media: MediaNode | undefined
  /** Which theme this copy is for, where there are two. */
  className?: string
}) {
  if (!media) return null
  return (
    <div data-link-card-media-frame="" className={cx(mediaFrameStyle, className)}>
      <Media
        src={media.src}
        alt=""
        kind={media.kind}
        className={mediaStyle}
        // The fit, the inset and the corner off the object itself — the same
        // three the editor previewed, resolving as shares of THIS box.
        layout={media}
        // The still, where the clip has one: a card is the surface that needs
        // it most, since its cover may be megabytes of screen recording.
        poster={media.kind === 'video' ? media.poster : undefined}
        // And the source's own shape, so the box is held from the first paint.
        width={media.width}
        height={media.height}
      />
    </div>
  )
}
