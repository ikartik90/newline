import { useCallback, useEffect, useRef } from 'react'
import { PANEL_INSET_ATTR } from '@/hooks/use-properties-panel-inset'
import { isSyntheticPointer } from '@/utils/synthetic-pointer'

// ---------------------------------------------------------------------------
// The cursor-following positioning engine for a label that trails the pointer
// — an imperative twin of the Base UI-backed `Tooltip`, for a surface that
// positions its own box (a hint over a demo, a label hung under a selected
// tile). Owns POSITIONING only: the consumer owns the `visible` boolean and
// toggles `data-visible` on the element for the show transition.
//
// Position is written imperatively through `ref` (ref + rAF), so tracking the
// pointer never triggers a React re-render on every pointermove. Returns the
// element `ref` and `seed(x, y)` — call `seed` from the pointer event that
// opens the tooltip so it appears in place instead of at a stale spot before
// the first pointermove lands.
//
// ANCHORED is the case where trailing the cursor would answer a question the
// page has already answered. A SELECTED tile is marked in the brand colour, so
// a label following the pointer around it would be pointing at the thing that
// is already pointed at; hung under the tile it reads as that tile's name
// instead. Pass the element and it positions from its rect, tracking SCROLL
// rather than the pointer — the anchor moves with the page, and the box is
// fixed. `seedAnchor(el)` is `seed`'s twin for it.
//
// DOCKED is the case with no cursor to trail: the placement is the
// stylesheet's there (`data-docked`), and all this hook does for it is get out
// of the way — the inline `left`/`top` a previous cursor placement wrote has to
// go, since an inline style outranks the rule that would centre it.
// ---------------------------------------------------------------------------

/** Offsets that place a tooltip at the bottom-right of the pointer glyph. */
export const CURSOR_TOOLTIP_OFFSET = { x: 15, y: 17 } as const

/** Clearance the label keeps from whichever container edge it is running into. */
const EDGE_GAP = 4

/**
 * How far under its anchor a tooltip hangs when it is hung under one rather
 * than trailed from the cursor. Close enough to read as attached to the thing
 * it names — which is the whole point of anchoring it — and clear enough not
 * to look welded on.
 */
export const ANCHORED_TOOLTIP_GAP = 2

/**
 * Extra drop for a label that has been shifted.
 *
 * It slides left rather than swinging to the far side of the cursor, so at the
 * end of that travel it is sitting directly beneath the cursor glyph instead of
 * out beside it. Two pixels is what separates the two again.
 */
const SHIFTED_DROP = 2

export interface TooltipFit {
  /** The label's measured width. */
  width: number
  viewportWidth: number
  /**
   * How much of the viewport's trailing edge is already spoken for — a docked
   * properties panel, which is `position: fixed` and therefore lies OVER the
   * page rather than beside it. Fitting on screen and being seen are two
   * different questions once one of those is up, and this is what separates
   * them. Defaults to none.
   */
  reservedRight?: number
}

/**
 * Places a fixed tooltip at the bottom-right of the pointer.
 *
 * Given the label's width it will also keep it VISIBLE. The offset above is a
 * point on the cursor's bottom edge that the label hangs from by its top-LEFT
 * corner, trailing off to the right.
 *
 * A control in the right-hand gutter opens its label straight into the near
 * edge. It gives up the least it can to fix that: it holds its y, keeps hanging
 * to the right, and SLIDES LEFT by exactly the overflow, coming to rest with
 * `EDGE_GAP` clear of the edge. Having slid, it is under the cursor rather than
 * beside it, and `SHIFTED_DROP` is what puts it back in the clear.
 *
 * That near edge is the viewport's only while nothing is docked over it.
 * `reservedRight` moves it inwards — unless the pointer is ON the rail, where
 * the rail is what is being pointed at and its own controls' labels belong
 * over it. The pointer's own x answers which case this is.
 *
 * The label can still be too wide for the container. Then the slide would
 * carry it off the far edge, and it stops at `EDGE_GAP` from that one instead:
 * it gives up hanging from the cursor before it gives up being readable.
 *
 * Called without `fit` (no measurement to hand) it is the plain offset.
 */
export function getCursorTooltipPosition(clientX: number, clientY: number, fit?: TooltipFit) {
  const top = clientY + CURSOR_TOOLTIP_OFFSET.y
  const anchor = clientX + CURSOR_TOOLTIP_OFFSET.x

  if (!fit) return { left: `${anchor}px`, top: `${top}px` }

  // See above: a pointer inside the reserved strip is on the panel, so the
  // whole viewport is its label's to use.
  const reserved = fit.reservedRight ?? 0
  const onReserved = clientX >= fit.viewportWidth - reserved

  // The furthest right the label may start and still leave the gap. Both the
  // test and the landing place, so the slide can only ever end exactly on the
  // gap it was checking for.
  const usableRight = fit.viewportWidth - (onReserved ? 0 : reserved)
  const rightmost = usableRight - EDGE_GAP - fit.width

  if (anchor <= rightmost) return { left: `${anchor}px`, top: `${top}px` }

  return {
    left: `${Math.max(EDGE_GAP, rightmost)}px`,
    top: `${top + SHIFTED_DROP}px`
  }
}

/** The box a tooltip is hung under — a `DOMRect`, or the three parts of one. */
export interface TooltipAnchor {
  left: number
  width: number
  bottom: number
}

/**
 * Places a fixed tooltip centred under the element it names.
 *
 * Same edge rules as {@link getCursorTooltipPosition} — it slides in to leave
 * `EDGE_GAP`, and measures the near edge against a docked panel rather than
 * the viewport. Two differences, both because there is no cursor in this one:
 * it can run into EITHER edge, being centred rather than hung to one side; and
 * having slid, it does not drop, since there is no glyph to clear. The panel
 * exception is gone too — an anchored label has no pointer to be on the rail.
 */
export function getAnchoredTooltipPosition(anchor: TooltipAnchor, fit?: TooltipFit) {
  const top = anchor.bottom + ANCHORED_TOOLTIP_GAP

  if (!fit) return { left: `${anchor.left}px`, top: `${top}px` }

  const centred = anchor.left + anchor.width / 2 - fit.width / 2
  const usableRight = fit.viewportWidth - (fit.reservedRight ?? 0)
  const rightmost = usableRight - EDGE_GAP - fit.width

  // Far edge last, so a label too wide for the space left gives up the near
  // edge rather than running off the start of the line.
  const left = Math.max(EDGE_GAP, Math.min(centred, rightmost))

  return { left: `${left}px`, top: `${top}px` }
}

/**
 * How much of the viewport's trailing edge a docked properties panel is holding.
 *
 * Read from the body's own inset rather than measured off the panel: that
 * padding IS the app's answer to the question (one rule in main.css, keyed off
 * the mark `usePropertiesPanelInset` sets), so a tooltip and the page it is
 * drawn over cannot disagree about where the usable edge is.
 *
 * Gated on the attribute so the common case is one attribute check per frame:
 * the computed-style read only happens on a page that actually has a rail up.
 * Mid-slide it returns the interpolated width, which is the right answer — the
 * label tracks the panel in rather than jumping when it lands.
 */
export function reservedRightInset(): number {
  if (!document.body.hasAttribute(PANEL_INSET_ATTR)) return 0
  return parseFloat(getComputedStyle(document.body).paddingInlineEnd) || 0
}

export function useCursorTooltip(
  visible: boolean,
  docked = false,
  /** Hang it under this element instead of the cursor — see the note above. */
  anchor?: HTMLElement | null
) {
  const ref = useRef<HTMLElement | null>(null)
  const pointerRef = useRef({ x: 0, y: 0 })
  const anchorRef = useRef<HTMLElement | null>(anchor ?? null)
  const rafRef = useRef(0)

  const position = useCallback(() => {
    rafRef.current = 0
    const el = ref.current
    if (!el) return
    // `offsetWidth` is the label at its natural width — read before writing,
    // and only ever compared against the usable edge, so this is one
    // measurement per frame that already had to touch layout, not a
    // read-write-read.
    const fit = {
      width: el.offsetWidth,
      viewportWidth: window.innerWidth,
      reservedRight: reservedRightInset()
    }
    const anchored = anchorRef.current
    const { left, top } = anchored
      ? getAnchoredTooltipPosition(anchored.getBoundingClientRect(), fit)
      : getCursorTooltipPosition(pointerRef.current.x, pointerRef.current.y, fit)
    el.style.left = left
    el.style.top = top
  }, [])

  const schedule = useCallback(() => {
    if (!rafRef.current) rafRef.current = requestAnimationFrame(position)
  }, [position])

  useEffect(() => {
    if (!docked) return
    const el = ref.current
    if (!el) return
    el.style.left = ''
    el.style.top = ''
  }, [docked, visible])

  // The prop is the truth about which mode this is; the ref is what `position`
  // reads inside a rAF. Kept in step here, and repositioned on the way past so
  // an anchor that changes while the label is up follows it.
  useEffect(() => {
    anchorRef.current = anchor ?? null
    // Never while docked: that placement is the stylesheet's, and an inline
    // `left`/`top` written here would outrank the rule that centres it — the
    // very thing the effect above clears. It runs first, so this would undo it.
    if (visible && !docked) position()
  }, [anchor, visible, docked, position])

  // An anchor is a box in the PAGE and the label is fixed to the viewport, so
  // everything that moves the page under it has to move the label with it.
  // Scroll in the capture phase, because the scroller is some ancestor of the
  // anchor rather than the window and a scroll event does not bubble.
  useEffect(() => {
    if (!visible || docked || !anchor) return

    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    return () => {
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [visible, docked, anchor, schedule])

  useEffect(() => {
    if (!visible || docked) return

    function onPointerMove(event: PointerEvent) {
      // A scripted walkthrough drags by dispatching this very event at its OWN
      // stand-in cursor. This tooltip belongs to whatever the REAL pointer is
      // resting on, so following the show would tear the label off the thing
      // it names.
      if (isSyntheticPointer(event)) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      // An anchored label is placed from its element, not from here — but the
      // pointer is still RECORDED, because the anchor can be taken away while
      // the label is up (deselecting the tile it hangs under) and the box then
      // has to have somewhere current to go. Tracked and not followed.
      if (!anchorRef.current) schedule()
    }

    window.addEventListener('pointermove', onPointerMove)
    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
    }
  }, [visible, docked, schedule])

  const seed = useCallback(
    (x: number, y: number) => {
      pointerRef.current = { x, y }
      // A trigger with no anchor of its own takes the label off the last one:
      // moving from an anchored trigger to a plain one otherwise leaves the
      // box hanging under the element the pointer has already left.
      anchorRef.current = null
      position()
    },
    [position]
  )

  /** `seed`'s twin for the anchored mode — see the note at the top. */
  const seedAnchor = useCallback(
    (element: HTMLElement) => {
      anchorRef.current = element
      position()
    },
    [position]
  )

  return { ref, seed, seedAnchor }
}
