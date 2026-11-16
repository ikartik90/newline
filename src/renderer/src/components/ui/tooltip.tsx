import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type ReactElement,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'

// ---------------------------------------------------------------------------
// Tooltip — the cursor-following hover tooltip (a leading label ∣ hairline ∣
// trailing 14px glyph). It carries no position or visibility of its own: a
// HOST (Button.Tooltip / Link.Tooltip, which ARE this component) renders it
// inside `ActionTooltipHost`, which opens it on the trigger's hover and keeps a
// point at the cursor for it to hang from.
//
//   <Button aria-label="Delete">
//     <TrashIcon />
//     <Button.Tooltip>
//       <Tooltip.Text>Delete</Tooltip.Text>
//       <TrashIcon />
//     </Button.Tooltip>
//   </Button>
//
// A `popover="hint"` in the top layer, portalled to the body: the box is drawn
// at the VISITOR'S CURSOR, routinely outside whatever element it labels, and
// nothing it is dropped inside may clip it. `[data-tooltip]` in main.css hangs
// it from the cursor point and flips or slides it to stay on screen.
// ---------------------------------------------------------------------------

/** What a host hands its tooltip: the box's id, whether it is up, and the two elements it drives. */
export interface TooltipHost {
  id: string
  open: boolean
  /** The dashed-ident the cursor point is anchored as. */
  anchorName: string
  /** A manual popover rather than a hint, so it can stand beside another. */
  held: boolean
  boxRef: RefObject<HTMLDivElement | null>
  cursorRef: RefObject<HTMLDivElement | null>
}

export const TooltipHostContext = createContext<TooltipHost | null>(null)

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// The `tooltip` recipe: 20px tall, 4px padding/gap, hairline, caption type, on
// the neutral step above the surface. The cursor trails the box by its offset,
// so it never intercepts the pointer. It fades in from `@starting-style` and
// out with `display` held to the end of the fade.
const boxStyle =
  'flex items-center gap-1 h-5 px-1 overflow-hidden rounded-sm border border-border-divider bg-bg-sheet text-style-caption whitespace-nowrap pointer-events-none transition-[opacity,filter,display,overlay] transition-discrete duration-150 ease-out opacity-0 blur-[1px] open:opacity-100 open:blur-[0px] starting:open:opacity-0 starting:open:blur-[1px] [&_svg]:shrink-0 [&_svg]:size-(--size-tooltip-icon)'

// The label and icons a control's at rest: ink 2.
const inkStyle = 'text-ink-tooltip-default'

const dividerStyle = 'shrink-0 w-0 h-4 border-l border-border-divider'

export interface TooltipTextProps {
  children: ReactNode
  className?: string
}

/** The tooltip's leading label — the accessible name still lives on the trigger. */
function TooltipText({ children, className }: TooltipTextProps) {
  return <span className={className}>{children}</span>
}

function isTooltipText(node: ReactNode): node is ReactElement {
  return isValidElement(node) && node.type === TooltipText
}

export interface TooltipProps {
  children: ReactNode
  className?: string
}

/**
 * The tooltip surface. A hairline is inserted automatically between the label
 * and any trailing content (an icon); `aria-hidden` because it's decorative —
 * screen readers get the trigger's `aria-label`. Must be rendered by a host
 * (inside `ActionTooltipHost`): `Button.Tooltip` and `Link.Tooltip` are the two.
 */
function TooltipRoot({ children, className }: TooltipProps) {
  const host = useContext(TooltipHostContext)
  if (!host) return null
  const items = Children.toArray(children)
  const label = items.find(isTooltipText)
  const rest = items.filter((child) => !isTooltipText(child))

  // Kept mounted so the box exists before the first hover — it is decorative,
  // hidden, and wanted the moment the cursor arrives, not a frame later.
  return createPortal(
    <>
      <div
        ref={host.cursorRef}
        data-tooltip-cursor=""
        aria-hidden
        style={{
          anchorName: host.anchorName,
          position: 'fixed',
          left: 0,
          top: 0,
          width: 0,
          height: 0,
          pointerEvents: 'none'
        }}
      />
      <div
        ref={host.boxRef}
        id={host.id}
        popover={host.held ? 'manual' : 'hint'}
        data-tooltip=""
        data-open={host.open ? '' : undefined}
        aria-hidden
        className={cx(boxStyle, inkStyle, className)}
      >
        {label}
        {rest.length > 0 && <span className={dividerStyle} aria-hidden />}
        {rest}
      </div>
    </>,
    document.body
  )
}

export const Tooltip = Object.assign(TooltipRoot, { Text: TooltipText })
