import { useLayoutEffect } from 'react'

// ---------------------------------------------------------------------------
// The page's own inset while a properties panel is docked.
//
// The panel is `position: fixed` at the viewport's edge, which means it takes
// no space: left alone it lies OVER whatever it is inspecting. Making room is
// therefore the page's job, not the panel's, and this is the one bit of state
// the two share — a mark on <body> that the page's stylesheet turns into the
// inset (`body[data-properties-panel] { padding-inline-end: … }`).
//
// A mark rather than a measured width, and on the BODY rather than on each
// consumer, because the answer has to be the same everywhere the panel can
// open. A consumer that reserved the width itself would be another place for
// it to be reserved slightly differently.
// ---------------------------------------------------------------------------

/** The attribute the page keys the inset off. */
export const PANEL_INSET_ATTR = 'data-properties-panel'

/** The attribute that takes the inset's 200ms slide off, for one frame. */
export const PANEL_INSET_INSTANT_ATTR = 'data-properties-panel-instant'

/**
 * The attribute a page puts on its own root to reserve the inset in its first
 * markup, for the width its panel is about to take — for a page that opens
 * with a panel already up, so the first paint is already inset:
 *
 * ```tsx
 * <main data-properties-panel-reserved={open || undefined}>
 * ```
 */
export const PANEL_RESERVED_ATTR = 'data-properties-panel-reserved'

/**
 * How long after a press a panel still counts as having been OPENED by it.
 *
 * 500ms because that is the window the layout-shift metric itself forgives
 * input under: a page that moves because the reader asked it to is not a page
 * that moved under them. Borrowing the number keeps the one judgement made
 * here — did they ask for this? — the same judgement the score makes.
 */
const INPUT_WINDOW = 500

/**
 * When the reader last did something, or `-Infinity` on a page they have not
 * touched yet.
 *
 * Module scope because the thing being remembered is the DOCUMENT's, not any
 * one React tree's — the press that opens an inspector lands on the page, and
 * the panel that answers it is mounted a tick later somewhere else entirely.
 */
let lastInput = -Infinity
let listening = false

/**
 * Start remembering presses.
 *
 * At module load rather than from the effect, and that ordering is the whole
 * point: the press that opens an inspector lands BEFORE the panel answering it
 * has mounted, so a listener attached by the first claim would miss the very
 * press it needs to recognise.
 */
function watchInput(): void {
  if (listening || typeof document === 'undefined') return
  listening = true

  const mark = () => (lastInput = performance.now())
  // Capture, so a handler that stops the event still counts as a press, and
  // passive because nothing here will ever cancel one.
  for (const type of ['pointerdown', 'keydown'])
    document.addEventListener(type, mark, { capture: true, passive: true })
}

watchInput()

/**
 * How many panels are currently asking for the inset.
 *
 * Counted rather than set-and-cleared: the mark is ONE bit of global state with
 * more than one possible claimant, and a panel closing while another is still
 * open would otherwise clear the inset out from under it.
 */
let claims = 0

/** What a caller may say about how its inset should arrive. */
interface InsetOptions {
  /**
   * Whether the page should SLIDE into the inset rather than simply be in it.
   *
   * True everywhere by default, because it is true of every panel the reader
   * opens: the page is making room for something they just asked for, and the
   * two moving together across 200ms is the point.
   *
   * Pass `false` when the panel arrives WITH the content it insets — a page
   * whose rail and whose subject both appear at once. There is nothing on
   * screen to slide there, and sliding it anyway is a layout animation: it
   * walks the page sideways across a dozen painted frames, every one of them
   * a layout shift.
   *
   * Only ever a statement about the panel a page OPENS with. A reader who
   * closes the rail and opens it again gets the slide regardless — see
   * `INPUT_WINDOW`, which is what tells the two apart.
   */
  animate?: boolean
}

/**
 * Reserve the docked panel's width on the page for as long as `active`.
 *
 * Pass the panel's LIVE state, not its mounted-ness: a panel that has been
 * dismissed is still on screen for the length of its slide, and the page should
 * be reclaiming the width across those same 200ms rather than snapping open
 * once the node has gone.
 *
 * A LAYOUT effect, and that is worth its own line: the mark is worth a panel's
 * width of page padding, so claiming it passively lands the inset a frame
 * after the panel has been painted and slides the page sideways under the
 * reader. Claimed before the frame is painted, a panel that arrives with its
 * own content is already inset in the frame it first appears in.
 */
export function usePropertiesPanelInset(
  active: boolean,
  { animate = true }: InsetOptions = {}
): void {
  useLayoutEffect(() => {
    if (!active) return

    claims += 1
    const { body } = document
    // The reader's own opens always slide, whatever the caller said: `animate`
    // describes the panel a page OPENS WITH, and by the time they have pressed
    // something there is a page on screen for the inset to move.
    const instant = !animate && performance.now() - lastInput > INPUT_WINDOW
    // Both marks in the same breath, so the padding resolves once with the
    // transition already off — set them the other way round and the browser has
    // a value to animate from before it is told not to.
    if (instant) body.setAttribute(PANEL_INSET_INSTANT_ATTR, '')
    body.setAttribute(PANEL_INSET_ATTR, '')

    // Handed back on the next frame. The padding is where it was going by then,
    // so dropping the mark moves nothing — it just leaves whatever the reader
    // does next free to slide.
    const frame = instant
      ? requestAnimationFrame(() => body.removeAttribute(PANEL_INSET_INSTANT_ATTR))
      : null

    return () => {
      if (frame !== null) cancelAnimationFrame(frame)
      body.removeAttribute(PANEL_INSET_INSTANT_ATTR)
      claims -= 1
      if (claims === 0) body.removeAttribute(PANEL_INSET_ATTR)
    }
  }, [active, animate])
}
