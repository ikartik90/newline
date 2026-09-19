import {
  Children,
  isValidElement,
  useCallback,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { Tooltip } from './tooltip'

// ---------------------------------------------------------------------------
// The parts shared by the two actionable primitives — Button (a <button> that
// ACTS) and Link (an <a> that NAVIGATES). They render identically and share the
// `action` look below; only the root element and its semantics differ, so the
// shared TYPES + label + styles + tooltip host live here once.
// ---------------------------------------------------------------------------

/** The look a Button/Link takes — the shape axis. */
export type ActionVariant = 'text' | 'icon' | 'link'

/**
 * The fill prominence a Button/Link takes, orthogonal to `variant` (the shape).
 * `secondary` is the filled chip; `tertiary` has no resting fill and its own
 * subtler hover wash; `glass` is the translucent, blurred chip for an icon
 * button that floats ON a picture, where there is no surface behind the glyph
 * to hold it down; `primary` is the branded chip for the one action a surface
 * is for.
 */
export type ActionEmphasis = 'primary' | 'secondary' | 'tertiary' | 'glass'

/**
 * The scale a Button/Link takes, orthogonal to both axes above. `md` is the
 * 40px chip; `sm` the 32px one. Only the `text` shape has two sizes: an icon
 * button has one inset (a smaller icon is a smaller glyph in the same chip),
 * and a link is inline text.
 */
export type ActionSize = 'md' | 'sm'

export interface ActionStyleOptions {
  variant: ActionVariant
  emphasis: ActionEmphasis
  size: ActionSize
}

// Composed icons track the resolved text colour and hold a 20px box.
const baseStyle =
  'cursor-pointer appearance-none border-none no-underline w-fit transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:block [&_svg]:size-5 [&_svg]:shrink-0'

// The standalone CTA: a chip that hugs its label with an 80px floor so a short
// one (Cancel / OK) is still substantial. `md` is the 40px/body-lg chip on a
// 12px inset; `sm` is 32px/body-sm on 8px — at that height the wider inset
// reads as a stretched pill rather than a smaller button.
const textStyle = 'inline-flex items-center justify-center gap-2 min-w-20 rounded-md'
const textSize: Record<ActionSize, string> = {
  md: 'h-10 px-3 text-style-body-lg',
  sm: 'h-8 px-2 text-style-body-sm'
}
const textEmphasis: Record<ActionEmphasis, string> = {
  primary: 'bg-branded text-fg-branded',
  secondary: 'bg-button-secondary text-fg-body hover:bg-button-secondary-hover',
  tertiary: 'bg-transparent text-fg-body hover:bg-field-hover',
  glass: 'bg-surface-glass backdrop-frost text-fg-body hover:bg-surface'
}

// The compact toolbar chip: a 20px glyph on a 4px inset, `color: inherit` so
// the surface owns the glyph hue. The hover wash is for buttons that are NOT
// on: an on toggle (`aria-pressed`) wears the brand chip every pressed toggle
// in the system wears, and hover cannot reach past it — the press still can,
// as a fill rather than the base's scale, since scaling drags a lone glyph off
// the pixel grid.
const iconStyle =
  'relative inline-flex items-center justify-center gap-1 p-1 rounded-sm text-inherit text-style-body-sm active:transform-none active:bg-field-pressed aria-pressed:bg-field-active aria-pressed:text-field-fg-active [html[data-keyboard-focus]_&]:focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-focus-ring)]'
const iconEmphasis: Record<ActionEmphasis, string> = {
  primary: 'bg-branded text-fg-branded',
  // Tertiary by nature: transparent at rest, the neutral wash on hover.
  secondary: 'bg-transparent not-aria-pressed:hover:bg-field-hover',
  tertiary: 'bg-transparent not-aria-pressed:hover:bg-field-hover',
  // The one chip that floats ON a picture: the surface at 75% and the app's
  // one blur keep the glyph legible over whatever moves underneath; opaque on
  // hover, the chip comes forward as you reach for it.
  glass: 'bg-surface-glass backdrop-frost text-fg-body hover:bg-surface'
}

// The inline underlined affordance, in the brand ink.
const linkStyle =
  'inline p-0 bg-transparent text-fg-highlight text-style-body-sm underline underline-offset-[3px] align-baseline active:transform-none'

/** The Tailwind classes for an action's look — shared by Button and Link. */
export function actionStyles({ variant, emphasis, size }: ActionStyleOptions): string {
  switch (variant) {
    case 'text':
      return `${baseStyle} ${textStyle} ${textSize[size]} ${textEmphasis[emphasis]}`
    case 'icon':
      return `${baseStyle} ${iconStyle} ${iconEmphasis[emphasis]}`
    case 'link':
      return `${baseStyle} ${linkStyle}`
  }
}

export interface ActionTextProps {
  children: ReactNode
  className?: string
}

/** The visible label of a text Button/Link (`Button.Text` / `Link.Text`). */
export function ActionText({ children, className }: ActionTextProps) {
  return <span className={className}>{children}</span>
}

const isActionText = (node: ReactNode) =>
  (isValidElement(node) && node.type === ActionText) ||
  typeof node === 'string' ||
  typeof node === 'number'

const isActionTooltip = (node: ReactNode) => isValidElement(node) && node.type === Tooltip

/**
 * Splits an action's children into the rendered CONTENT (icon + label) and its
 * optional `.Tooltip`, and owns whether that tooltip is up. `hasText` feeds the
 * text-vs-icon variant inference; `show`/`hide` are wired to the trigger's
 * pointer enter/leave by the host, which renders the pair through
 * {@link ActionTooltipHost}.
 *
 * `show` takes the POINTER EVENT rather than a flag so the one rule about which
 * pointers may open a label lives here, once, for both hosts.
 */
export function useActionTooltip(children: ReactNode) {
  const items = Children.toArray(children)
  const tooltip = items.find(isActionTooltip) ?? null
  const content = items.filter((child) => !isActionTooltip(child))
  const hasText = content.some(isActionText)

  const [hovered, setHovered] = useState(false)

  // A finger never opens the label. This tooltip is drawn AT THE CURSOR and
  // names what the cursor is resting on — neither of which a touch has: the
  // tap is over before the label lands, and the name it carries is already the
  // trigger's `aria-label`. Left ungated it appears AFTER the interaction and
  // stays there, since nothing on a touchscreen corresponds to leaving.
  //
  // Checked per EVENT rather than per device: a laptop with a touchscreen
  // answers `(hover: hover)` truthfully for its trackpad while the hand that
  // just tapped it was still a finger. `pointerenter` also arrives BEFORE the
  // mouse events the engine synthesises after a tap.
  const show = useCallback((event: ReactPointerEvent) => {
    if (event.pointerType === 'touch') return
    setHovered(true)
  }, [])
  const hide = useCallback(() => setHovered(false), [])

  return {
    content,
    hasText,
    tooltip,
    hasTooltip: tooltip !== null,
    /**
     * Whether the label is up.
     *
     * Exposed so that anything drawn INSTEAD of the tooltip can be driven off
     * the same fact rather than off `:hover`. The two look equivalent and are
     * not: `:hover` is the browser's answer, recomputed on its own schedule and
     * sticky when the DOM changes under a still pointer, while this is React's,
     * set from `pointerenter`/`pointerleave`. A face that hides on one while its
     * replacement appears on the other will eventually show both at once.
     */
    visible: hovered,
    show,
    hide
  }
}

export interface ActionTooltipHostProps {
  /** Whether the label is up — the host's own hover state, never Base UI's. */
  open: boolean
  onClose: () => void
  /** The rendered trigger — the `<button>` or `<a>` itself, ref and all. */
  trigger: ReactElement
  /** The `Tooltip` element found among the children. */
  children: ReactNode
}

/**
 * Wraps a trigger and its `Tooltip` in Base UI's tooltip root, which supplies
 * the portal, the positioning and the cursor tracking. The OPEN state stays the
 * host's: Base UI's own hover/focus opening is ignored (it would open on a tap's
 * synthesised mouse events and on keyboard focus, neither of which has a cursor
 * to trail); only its requests to close — Escape — are honoured.
 */
export function ActionTooltipHost({ open, onClose, trigger, children }: ActionTooltipHostProps) {
  return (
    <BaseTooltip.Root
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
      trackCursorAxis="both"
    >
      <BaseTooltip.Trigger render={trigger} />
      {children}
    </BaseTooltip.Root>
  )
}
