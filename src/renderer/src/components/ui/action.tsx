import {
  Children,
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import { Tooltip, TooltipHostContext, type TooltipHost } from './tooltip'

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
 * subtler hover wash; `glass` is the secondary chip at 60%, blurred, for an
 * icon button that floats ON a picture, where there is no surface behind the
 * glyph to hold it down; `primary` is the secondary flipped, for the one action
 * a surface is for.
 */
export type ActionEmphasis = 'primary' | 'secondary' | 'tertiary' | 'glass'

export interface ActionStyleOptions {
  variant: ActionVariant
  emphasis: ActionEmphasis
}

// Composed icons track the resolved text colour and hold a 20px box.
const baseStyle =
  'cursor-pointer appearance-none border-none no-underline w-fit transition-[transform,background-color,color] duration-150 ease-out active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none [&_svg]:block [&_svg]:size-5 [&_svg]:shrink-0'

// The standalone CTA: a 28px/body-sm chip, as tall as an icon button, on an 8px
// inset that hugs its label, with an 80px floor so a short one (Cancel / OK) is
// still substantial.
const textStyle =
  'inline-flex items-center justify-center gap-2 min-w-20 h-7 px-2 rounded-lg text-style-body-sm'
const textEmphasis: Record<ActionEmphasis, string> = {
  primary:
    'bg-surface-button-primary-default text-glyph-button-primary-default hover:bg-surface-button-primary-hover',
  // Secondary and tertiary rest in the control ink, one step softer than body
  // ink; an icon beside the label follows it.
  secondary:
    'bg-surface-button-secondary-default text-glyph-control hover:bg-surface-button-secondary-hover',
  tertiary: 'bg-transparent text-glyph-control hover:bg-surface-field-hover',
  glass:
    'bg-surface-button-secondary-default/60 backdrop-frost text-glyph-body hover:bg-surface-button-secondary-hover/60'
}

// The compact toolbar chip: a 20px glyph on a 4px inset, cornered as the
// shell's own sidebar toggle and settings button are, `color: inherit` so
// the surface owns the glyph hue. The hover wash is for buttons that are NOT
// on: an on toggle (`aria-pressed`) wears the brand chip every pressed toggle
// in the system wears, and hover cannot reach past it — the press still can,
// as a fill rather than the base's scale, since scaling drags a lone glyph off
// the pixel grid.
const iconStyle =
  'relative inline-flex items-center justify-center gap-1 p-1 rounded-xl text-inherit text-style-body-sm active:transform-none active:bg-surface-field-pressed aria-pressed:bg-surface-field-active aria-pressed:text-glyph-field-active [html[data-keyboard-focus]_&]:focus-visible:shadow-[inset_0_0_0_1.5px_var(--color-outline-focus)]'
// An icon button is tertiary or glass — never a filled or branded chip.
type IconEmphasis = Extract<ActionEmphasis, 'tertiary' | 'glass'>
const iconEmphasis: Record<IconEmphasis, string> = {
  // Its glyph at rest takes the icon ink, one step softer on a sheet.
  tertiary:
    'bg-transparent not-aria-pressed:hover:bg-surface-field-hover not-aria-pressed:[&_svg]:text-glyph-icon',
  // The one chip that floats ON a picture: the surface at 75% and the app's
  // one blur keep the glyph legible over whatever moves underneath; opaque on
  // hover, the chip comes forward as you reach for it.
  glass:
    'bg-surface-button-secondary-default/60 backdrop-frost text-glyph-body hover:bg-surface-button-secondary-hover/60'
}

/**
 * The emphasis an action wears: `secondary` for text, `tertiary` for an icon. An icon
 * asked for `primary` or `secondary` gets `tertiary`, since it has only that and glass.
 */
export function resolveEmphasis(variant: ActionVariant, emphasis?: ActionEmphasis): ActionEmphasis {
  if (variant !== 'icon') return emphasis ?? (variant === 'text' ? 'secondary' : 'tertiary')
  return emphasis === 'glass' ? 'glass' : 'tertiary'
}

// The inline underlined affordance, in the brand ink.
const linkStyle =
  'inline p-0 bg-transparent text-glyph-highlight text-style-body-sm underline underline-offset-[3px] align-baseline active:transform-none'

/** The Tailwind classes for an action's look — shared by Button and Link. */
export function actionStyles({ variant, emphasis }: ActionStyleOptions): string {
  switch (variant) {
    case 'text':
      return `${baseStyle} ${textStyle} ${textEmphasis[emphasis]}`
    case 'icon':
      return `${baseStyle} ${iconStyle} ${iconEmphasis[emphasis === 'glass' ? 'glass' : 'tertiary']}`
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
  /** Whether the label is up — the host's own hover state. */
  open: boolean
  onClose: () => void
  /** The rendered trigger — the `<button>` or `<a>` itself, ref and all. */
  trigger: ReactElement<TriggerProps>
  /** The `Tooltip` element found among the children. */
  children: ReactNode
  /**
   * Held open beside others (a specimen): a manual popover, since showing a hint
   * hides every other hint.
   */
  held?: boolean
}

interface TriggerProps {
  ref?: Ref<HTMLElement>
  onPointerEnter?: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerMove?: (event: ReactPointerEvent<HTMLElement>) => void
  onPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void
}

function setRef<T>(ref: Ref<T> | undefined, value: T) {
  if (typeof ref === 'function') ref(value)
  else if (ref) ref.current = value
}

/**
 * Pairs a trigger with its `Tooltip`: the trigger names the box with
 * `interestfor`, and the box, a `popover="hint"`, hangs from a point kept at
 * the cursor. The OPEN state stays the host's: the browser's own interest is
 * refused (it would open on keyboard focus, which has no cursor to trail);
 * only its dismissals — Escape, a press outside — are honoured, and a press on
 * the trigger closes it too.
 */
export function ActionTooltipHost({
  open,
  onClose,
  trigger,
  children,
  held = false
}: ActionTooltipHostProps) {
  const id = `tooltip-${useId().replace(/[^\w-]/g, '')}`
  const anchorName = `--${id}`
  const triggerRef = useRef<HTMLElement | null>(null)
  const boxRef = useRef<HTMLDivElement | null>(null)
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const shown = useRef(false)

  useLayoutEffect(() => {
    const box = boxRef.current
    if (!box || open === shown.current) return
    // The trigger as the source: the box hangs from it until a pointer places the cursor point.
    if (open) box.showPopover({ source: triggerRef.current ?? undefined })
    else box.hidePopover()
    shown.current = open
  }, [open])

  useEffect(() => {
    const box = boxRef.current
    if (!box) return
    const onToggle = (event: Event) => {
      if ((event as ToggleEvent).newState !== 'closed') return
      shown.current = false
      onClose()
    }
    const refuse = (event: Event) => event.preventDefault()
    box.addEventListener('toggle', onToggle)
    box.addEventListener('interest', refuse)
    return () => {
      box.removeEventListener('toggle', onToggle)
      box.removeEventListener('interest', refuse)
    }
  }, [onClose])

  // Written straight to the elements, so trailing the pointer never re-renders.
  const place = (event: ReactPointerEvent) => {
    const cursor = cursorRef.current
    if (!cursor) return
    cursor.style.left = `${event.clientX}px`
    cursor.style.top = `${event.clientY}px`
    boxRef.current?.style.setProperty('position-anchor', anchorName)
  }

  const { ref, onPointerEnter, onPointerMove, onPointerDown } = trigger.props
  const host = useMemo<TooltipHost>(
    () => ({ id, open, anchorName, held, boxRef, cursorRef }),
    [id, open, anchorName, held]
  )
  return (
    <TooltipHostContext value={host}>
      {cloneElement(trigger, {
        interestfor: id,
        ref: (node: HTMLElement | null) => {
          triggerRef.current = node
          setRef(ref, node)
        },
        onPointerEnter: (event: ReactPointerEvent<HTMLElement>) => {
          if (event.pointerType !== 'touch') place(event)
          onPointerEnter?.(event)
        },
        onPointerMove: (event: ReactPointerEvent<HTMLElement>) => {
          if (event.pointerType !== 'touch') place(event)
          onPointerMove?.(event)
        },
        onPointerDown: (event: ReactPointerEvent<HTMLElement>) => {
          onPointerDown?.(event)
          onClose()
        }
      } as TriggerProps & { interestfor: string })}
      {children}
    </TooltipHostContext>
  )
}
