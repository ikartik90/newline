import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip'
import { CURSOR_TOOLTIP_OFFSET } from '@/hooks/use-cursor-tooltip'

// ---------------------------------------------------------------------------
// Tooltip — the cursor-following hover tooltip (a leading label ∣ hairline ∣
// trailing 14px glyph). It carries no position or visibility of its own: a
// HOST (Button.Tooltip / Link.Tooltip, which ARE this component) renders it
// inside a Base UI tooltip root wired to the trigger's hover, and Base UI
// portals it to the body and trails it after the cursor.
//
//   <Button aria-label="Delete">
//     <TrashIcon />
//     <Button.Tooltip>
//       <Tooltip.Text>Delete</Tooltip.Text>
//       <TrashIcon />
//     </Button.Tooltip>
//   </Button>
//
// PORTALLED TO THE BODY, always. The box is drawn at the VISITOR'S CURSOR — a
// point on the page at large, routinely outside whatever element it labels —
// and an ancestor that clips would paint it nowhere. The escape lives here
// rather than in each host because a host cannot know what it will be dropped
// inside, and every one of them wants the same answer.
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// The `tooltip` recipe: 20px tall, 4px padding/gap, hairline, caption type, on
// the neutral step above the surface. The cursor trails the box by its offset,
// so it never intercepts the pointer. Base UI marks the entry and exit frames
// with `data-starting-style` / `data-ending-style`, which drive the fade.
const boxStyle =
  'flex items-center gap-1 h-5 px-1 overflow-hidden rounded-sm border-[0.5px] border-divider bg-surface text-fg-body text-style-caption whitespace-nowrap pointer-events-none transition-[opacity,filter] duration-150 ease-out data-[starting-style]:opacity-0 data-[starting-style]:blur-[1px] data-[ending-style]:opacity-0 data-[ending-style]:blur-[1px] [&_svg]:shrink-0 [&_svg]:size-(--size-tooltip-icon)'

// Opt-in, for the tooltip that makes an OFFER rather than naming a control.
// Brand type on the opaque brand surface the popovers already use: the box
// covers whatever it is drawn over, so the fill cannot be a translucent wash.
// The bright hue again at 25% for the hairline, as a focused field draws its
// frame — a neutral hairline would still read as the default tooltip.
const brandStyle = 'bg-field-popover text-field-fg-active border-field-border-active'

const dividerStyle = 'shrink-0 w-0 h-4 border-l-[0.5px] border-divider'

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

export type TooltipTone = 'brand'

export interface TooltipProps {
  children: ReactNode
  className?: string
  tone?: TooltipTone
}

/**
 * The tooltip surface. A hairline is inserted automatically between the label
 * and any trailing content (an icon); `aria-hidden` because it's decorative —
 * screen readers get the trigger's `aria-label`. Must be rendered by a host
 * (inside a Base UI tooltip root): `Button.Tooltip` and `Link.Tooltip` are the
 * two.
 */
function TooltipRoot({ children, className, tone }: TooltipProps) {
  const items = Children.toArray(children)
  const label = items.find(isTooltipText)
  const rest = items.filter((child) => !isTooltipText(child))

  return (
    // Kept mounted so the box exists before the first hover — it is decorative,
    // hidden, and wanted the moment the cursor arrives, not a frame later.
    <BaseTooltip.Portal keepMounted>
      <BaseTooltip.Positioner
        // Bottom-right of the pointer glyph, hung by its top-left corner.
        side="bottom"
        align="start"
        sideOffset={CURSOR_TOOLTIP_OFFSET.y}
        alignOffset={CURSOR_TOOLTIP_OFFSET.x}
        collisionPadding={4}
        className="z-50"
      >
        <BaseTooltip.Popup
          aria-hidden
          data-tone={tone}
          className={cx(boxStyle, tone === 'brand' && brandStyle, className)}
        >
          {label}
          {rest.length > 0 && <span className={dividerStyle} aria-hidden />}
          {rest}
        </BaseTooltip.Popup>
      </BaseTooltip.Positioner>
    </BaseTooltip.Portal>
  )
}

export const Tooltip = Object.assign(TooltipRoot, { Text: TooltipText })
