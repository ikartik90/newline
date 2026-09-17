import { useMemo, useRef, type CSSProperties, type ReactNode, type RefObject } from 'react'
import { Popover as BasePopover } from '@base-ui/react/popover'
import { useDismiss } from '@/hooks/use-dismiss'
import { scrollBoundary } from '@/hooks/use-scroll-handoff'

// ---------------------------------------------------------------------------
// Popover — the positioned, dismissable shell behind every floating menu.
//
// Base UI supplies the portal and the positioning (flip when there's no room,
// track the anchor through scroll and resize); the shell supplies the chrome
// every floating surface shares and the dismiss behaviour (`useDismiss`, so
// Escape closes one layer at a time across every surface in the app). Mount it
// to open, unmount it to close — there is no `open` prop, exactly as before.
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
//     selector resolved when the popover positions (e.g. the editor's
//     `[data-slash-anchor]`). Used by the slash menu.
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

// The `selectionPopover` recipe: the hairline, the elevation and a clip, on the
// surface. Fields inside take the on-surface fill. Layout is the caller's — a
// rail and a column list want different things from the same shell.
const chromeStyle =
  'bg-surface [--color-field:var(--color-field-on-surface)] rounded-md border-[0.5px] border-divider overflow-hidden max-w-[min(100vw,var(--size-article-content))] shadow-[0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)] outline-none'

/** Base UI's own open/close requests are ignored: `useDismiss` owns dismissal. */
const keepOpen = () => {}

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

  // A rect positions against the synthesized anchor below; a selector is
  // resolved lazily so the target need not exist before the popover does.
  const hasRect = rect !== undefined
  const resolvedAnchor = useMemo(() => {
    if (hasRect) return anchorRef
    if (typeof anchor === 'string') return () => document.querySelector(anchor)
    return anchor ?? null
  }, [hasRect, anchor])

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
      <BasePopover.Root open onOpenChange={keepOpen} modal={false}>
        <BasePopover.Portal>
          <BasePopover.Positioner
            anchor={resolvedAnchor}
            side={side}
            align={align}
            // The 4px the recipe keeps between the rail and its target.
            sideOffset={4}
            collisionPadding={4}
            collisionAvoidance={{ side: 'flip', align: 'shift' }}
            className="z-50"
          >
            {/*
              A floating menu never takes the focus from what it edits: the
              selection toolbar acts on a selection that has to stay live in
              the editor. Where a wheel stops: the surface CLIPS rather than
              scrolls, and the attribute marks that edge for `useScrollHandoff`.
            */}
            <BasePopover.Popup
              ref={(node) => {
                containerRef.current = node
                onContainer?.(node)
              }}
              initialFocus={false}
              finalFocus={false}
              className={className ? `${chromeStyle} ${className}` : chromeStyle}
              style={style}
              role={role}
              aria-label={ariaLabel}
              {...scrollBoundary}
            >
              {children}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      </BasePopover.Root>
    </>
  )
}
