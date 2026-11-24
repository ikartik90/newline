import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useState,
  useRef,
  type CSSProperties,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '@/hooks/use-dismiss'
import { scrollBoundary } from '@/hooks/use-scroll-handoff'
import { choosePlacement } from '@/utils/popover-placement'

// ---------------------------------------------------------------------------
// Popover — the positioned, dismissable shell behind every floating menu.
//
// The platform supplies the layering and the positioning: a `popover="manual"`
// element in the top layer, shown with its anchor as the `source`, so CSS anchor
// positioning places it (`[data-popover]` in main.css: the side, the 4px gap)
// and keeps it on the anchor through scroll and resize. Which side and end have
// room is ours to say (`useAnchoredPlacement`), checked again as it scrolls.
// The shell supplies the chrome every floating surface shares and the dismiss
// behaviour (`useDismiss`, so Escape closes one layer at a time across every
// surface in the app). Mount it to open, unmount it to close — there is no
// `open` prop.
//
// Two anchor modes:
//   • rect-anchored — pass `rect` (+ optionally `anchorName`); Popover renders
//     a zero-size ABSOLUTELY positioned anchor at `rect` and positions against
//     it. The anchor is laid out in the flow of Popover's positioned ancestor —
//     the editor's `<article>` (`position: relative`) — so it scrolls WITH the
//     article content, and the popover tracks it. Consequently `rect` must be
//     in ARTICLE-relative coordinates (the callers convert). Used by the
//     selection/link/bullet/number toolbars.
//   • element-anchored — pass `anchor`: an element, a ref, a function, or a CSS
//     selector, resolved again on every render so the popover follows it to
//     another element (e.g. the editor's `[data-slash-anchor]`). Used by the
//     slash menu.
//
// The container's `role`/`aria-label` are the caller's, since the shell carries
// no domain identity.
// ---------------------------------------------------------------------------

export interface PopoverRect {
  /** Coordinates relative to the editor's `<article>` (Popover's positioned
   *  ancestor), so the absolute anchor scrolls with the article content. */
  left: number
  top: number
  width: number
  height: number
}

/** An element to anchor to, or a way of finding one when the popover positions. */
export type PopoverAnchor = Element | RefObject<Element | null> | (() => Element | null) | string

export type PopoverSide = 'top' | 'bottom'
export type PopoverAlign = 'center' | 'start' | 'end'

export interface PopoverProps {
  /** Article-relative rect to anchor against. */
  rect?: PopoverRect
  /**
   * CSS anchor-name (a dashed-ident, e.g. `--selection-popover`) exposed on the
   * synthesized anchor, for a stylesheet that positions something else against
   * the same target. Positioning here no longer needs it.
   */
  anchorName?: string
  /** What to anchor against when there is no `rect`. */
  anchor?: PopoverAnchor
  /** Which side of the anchor to open on; flips when there is no room. Default `top`. */
  side?: PopoverSide
  /** `center` centres on the target (text selection / link); `start` left-aligns
   *  to it (list-marker menus, the slash menu). Default `center`. */
  align?: PopoverAlign
  /** Extra chrome for the container — layout, a width, a different clip. */
  className?: string
  role?: string
  ariaLabel?: string
  /** Dismiss on scroll/resize — for menus anchored to a click-captured rect. */
  dismissOnReflow?: boolean
  /**
   * CSS selector for the trigger that opened this popover, exempted from the
   * outside-pointerdown dismiss so a toggling trigger can close it. See
   * {@link useDismiss}.
   */
  ignoreSelector?: string
  /**
   * Whether a press outside dismisses (default true). Off for a surface that
   * stands over what it configures and is closed deliberately — see
   * {@link useDismiss}.
   */
  dismissOnOutsidePointer?: boolean
  /**
   * Inline styles for the container — for a position the stylesheet cannot
   * state because it is measured at open time (the colour picker's pinned
   * `top`; see `usePickerPin`).
   */
  style?: CSSProperties
  /**
   * The container element, handed out as it mounts. For a caller that has to
   * MEASURE the popover — again, the picker's clamp. The dismiss logic keeps
   * its own ref regardless, so this cannot take the shell's away.
   */
  containerRef?: (node: HTMLDivElement | null) => void
  onDismiss: () => void
  children: ReactNode
}

// The `selectionPopover` recipe: the elevation and a clip, on the surface: a sheet, so its
// fields stand a step up, on surface 2. No edge of its own; cornered round the buttons it holds
// 2px in, concentric with them. Layout is the caller's — a rail and a column list want different
// things from the same shell.
const chromeStyle =
  'bg-bg-sheet bg-level-1 rounded-toolbar overflow-hidden max-w-[min(100vw,var(--size-article-content))] shadow-[0_4px_16px_var(--shadow-sheet)] outline-none'

/**
 * A toolbar floating in the shell: 2px clear of its options all round, which makes its height,
 * its options 1px apart and cornered as an icon button is. A pressed option is its chip alone,
 * with no edge.
 */
export const POPOVER_TOOLBAR =
  'flex items-center w-max h-(--size-toolbar) p-0.5 ' +
  '[&_[role=toolbar]]:gap-px [&_button[aria-pressed=true]]:after:border-0'

/** The space between a popover and its anchor (`[data-popover]`'s margin in main.css). */
const POPOVER_GAP = 4

function resolveAnchor(anchor: PopoverAnchor | undefined): Element | null {
  if (anchor === undefined) return null
  if (typeof anchor === 'string') return document.querySelector(anchor)
  if (typeof anchor === 'function') return anchor()
  if (anchor instanceof Element) return anchor
  return anchor.current
}

/**
 * Stands a `[data-popover]` on the side and at the end of its anchor that have
 * room (`data-placed-side`, `data-placed-align`, which main.css places by), out
 * of the `data-side` and `data-align` it asks for. Returns `place`, to call as
 * the popover shows; while `active`, it is placed again within the frame the
 * anchor scrolls, the window resizes or either of them changes size, so a
 * popover flipped for want of room comes back as soon as there is room again.
 * A popover that moves is shown again in that frame.
 */
export function useAnchoredPlacement(
  ref: RefObject<HTMLElement | null>,
  anchor: () => Element | null | undefined,
  active: boolean
): () => void {
  const anchorOf = useRef(anchor)
  anchorOf.current = anchor

  const place = useCallback(() => {
    const el = ref.current
    const target = anchorOf.current()
    if (!el || !target) return
    const { side, align } = el.dataset
    if (side !== 'top' && side !== 'bottom') return
    const { side: placedSide, align: placedAlign } = choosePlacement({
      anchor: target.getBoundingClientRect(),
      // Untransformed: a menu scales in as it opens.
      size: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: window.innerWidth, height: window.innerHeight },
      side,
      align: align === 'start' || align === 'end' ? align : 'center',
      edge: parseFloat(getComputedStyle(el).getPropertyValue('--popover-edge')) || 4,
      gap: POPOVER_GAP
    })
    if (el.dataset.placedSide === placedSide && el.dataset.placedAlign === placedAlign) return
    const moved = el.dataset.placedSide !== undefined
    el.dataset.placedSide = placedSide
    el.dataset.placedAlign = placedAlign
    if (!moved) return
    // Shown again, or the browser lays it out from the scroll as it stood when
    // it was shown, off its anchor. Hidden and shown in one go, it keeps the focus.
    const focused = document.activeElement
    el.hidePopover()
    el.showPopover({ source: target })
    if (
      focused instanceof HTMLElement &&
      el.contains(focused) &&
      document.activeElement !== focused
    )
      focused.focus({ preventScroll: true })
  }, [ref])

  useEffect(() => {
    if (!active) return
    let frame = 0
    function schedule(): void {
      if (!frame)
        frame = requestAnimationFrame(() => {
          frame = 0
          place()
        })
    }
    window.addEventListener('scroll', schedule, { capture: true, passive: true })
    window.addEventListener('resize', schedule)
    const resized = new ResizeObserver(schedule)
    if (ref.current) resized.observe(ref.current)
    const target = anchorOf.current()
    if (target) resized.observe(target)
    return () => {
      window.removeEventListener('scroll', schedule, { capture: true })
      window.removeEventListener('resize', schedule)
      resized.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [active, place, ref])

  return place
}

/**
 * Keeps `ref`'s popover shown in the top layer while it is mounted, its implicit
 * anchor the element `source` finds, and stood where it has room
 * (`useAnchoredPlacement`). The anchor is fixed when the popover is shown, so a
 * different one shows it again. Unmounting takes it out of the top layer; it is
 * never hidden by hand, which would hand the focus back to where it was when the
 * popover opened.
 */
export function useTopLayerPopover(
  ref: RefObject<HTMLElement | null>,
  source: () => Element | null
): void {
  const shownWith = useRef<Element | null | undefined>(undefined)
  const [anchor, setAnchor] = useState<Element | null>(null)
  const place = useAnchoredPlacement(ref, () => shownWith.current, anchor !== null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const next = source()
    if (shownWith.current === next) return
    if (shownWith.current !== undefined) el.hidePopover()
    el.showPopover(next ? { source: next } : undefined)
    shownWith.current = next
    place()
    setAnchor(next)
  })
}

export function Popover({
  rect,
  anchorName,
  anchor,
  side = 'top',
  align = 'center',
  className,
  role,
  ariaLabel,
  dismissOnReflow = false,
  ignoreSelector,
  dismissOnOutsidePointer,
  style,
  containerRef: onContainer,
  onDismiss,
  children
}: PopoverProps) {
  const anchorRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  useDismiss({
    ref: containerRef,
    onDismiss,
    dismissOnReflow,
    ignoreSelector,
    dismissOnOutsidePointer
  })

  useTopLayerPopover(containerRef, () =>
    rect !== undefined ? anchorRef.current : resolveAnchor(anchor)
  )

  return (
    <>
      {rect && (
        <div
          ref={anchorRef}
          data-popover-anchor=""
          aria-hidden
          style={{
            // Absolute (not fixed): the containing block is the editor's
            // `position: relative` <article>, so the anchor scrolls with the
            // article and the popover tracks it.
            anchorName,
            position: 'absolute',
            left: rect.left,
            top: rect.top,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none'
          }}
        />
      )}
      {createPortal(
        // A floating menu never takes the focus from what it edits: the
        // selection toolbar acts on a selection that has to stay live in the
        // editor, and a manual popover is shown without moving the focus.
        // Where a wheel stops: the surface CLIPS rather than scrolls, and the
        // attribute marks that edge for `useScrollHandoff`.
        <div
          ref={(node) => {
            containerRef.current = node
            onContainer?.(node)
          }}
          popover="manual"
          data-popover=""
          data-side={side}
          data-align={align}
          className={className ? `${chromeStyle} ${className}` : chromeStyle}
          style={style}
          role={role}
          aria-label={ariaLabel}
          {...scrollBoundary}
        >
          {children}
        </div>,
        document.body
      )}
    </>
  )
}
