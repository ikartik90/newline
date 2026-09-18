import { forwardRef, type ButtonHTMLAttributes, type PointerEvent, type Ref } from 'react'
import {
  ActionText,
  ActionTooltipHost,
  actionStyles,
  useActionTooltip,
  type ActionEmphasis,
  type ActionSize,
  type ActionVariant
} from './action'
import { Tooltip } from './tooltip'

// ---------------------------------------------------------------------------
// Button — a <button> that ACTS, composed like OptionList.Option: a bare icon
// child, an optional `Button.Text` label, and an optional `Button.Tooltip` (the
// shared cursor-following tooltip) for icon buttons that want a hint.
//
//   <Button aria-label="Delete">          {/* icon button */}
//     <TrashIcon />
//     <Button.Tooltip>
//       <Tooltip.Text>Delete</Tooltip.Text>
//       <TrashIcon />
//     </Button.Tooltip>
//   </Button>
//
//   <Button onClick={save}>               {/* text button */}
//     <SaveIcon />
//     <Button.Text>Save changes</Button.Text>
//   </Button>
//
// The look is the shared `action` style: a `Button.Text` (or bare string) child
// ⇒ the 40px/8px `text` chip; an icon alone ⇒ the 28px `icon` chip that matches
// a toolbar button. Pass `variant` only to override that inference — notably
// `variant="link"` for the inline underlined affordance; `size="sm"` takes the
// text chip down to 32px / body-sm. The resolved axes are stamped as
// `data-variant` / `data-emphasis` / `data-size` for a stylesheet or a test.
// The accessible name stays on the button (`aria-label`); the tooltip is
// decorative. Its sibling twin that navigates is `Link` (link.tsx).
// ---------------------------------------------------------------------------

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * Override the look. Left unset it's inferred from the children: a `Button.Text`
   * (or bare string) label ⇒ `text`, an icon alone ⇒ `icon`. Set it for `link`.
   */
  variant?: ActionVariant
  /**
   * Fill prominence, independent of `variant` (the shape). Left unset it
   * defaults to `secondary` for text buttons and `tertiary` for icon buttons.
   */
  emphasis?: ActionEmphasis
  /**
   * The chip's scale, independent of both axes above. `md` (default) is the
   * 40px chip; `sm` is the 32px one. Applies to the `text` shape — an icon
   * button is always the toolbar chip.
   */
  size?: ActionSize
}

function ButtonRoot(
  {
    variant,
    emphasis,
    size = 'md',
    className,
    type = 'button',
    children,
    onPointerEnter,
    onPointerLeave,
    ...rest
  }: ButtonProps,
  ref: Ref<HTMLButtonElement>
) {
  const { content, hasText, tooltip, hasTooltip, visible, show, hide } = useActionTooltip(children)
  const resolvedVariant = variant ?? (hasText ? 'text' : 'icon')
  const resolvedEmphasis = emphasis ?? (resolvedVariant === 'text' ? 'secondary' : 'tertiary')
  const styles = actionStyles({ variant: resolvedVariant, emphasis: resolvedEmphasis, size })

  const button = (
    <button
      ref={ref}
      type={type}
      className={className ? `${styles} ${className}` : styles}
      data-variant={resolvedVariant}
      data-emphasis={resolvedEmphasis}
      data-size={size}
      onPointerEnter={(event: PointerEvent<HTMLButtonElement>) => {
        onPointerEnter?.(event)
        if (hasTooltip) show(event)
      }}
      onPointerLeave={(event: PointerEvent<HTMLButtonElement>) => {
        onPointerLeave?.(event)
        if (hasTooltip) hide()
      }}
      // Says the tooltip is up, for anything drawn INSTEAD of it — see
      // `MenuButton`'s shortcut chip. A sibling keying off `:hover` would be
      // answering a different question from the tooltip's own, and the two
      // drift apart on any event the browser and React see differently.
      data-tooltip-visible={visible || undefined}
      // WebKit's default sequential focus order reaches form fields and
      // anything carrying an EXPLICIT tabindex, and nothing else — a bare
      // <button> is skipped. Written down, the button is in the order in both
      // engines; an explicit 0 puts it exactly where its DOM position already
      // put it, and it is BEFORE the spread so a caller taking the button out
      // of the order (`tabIndex={-1}`, a roving toolbar) still wins.
      tabIndex={0}
      {...rest}
    >
      {content}
    </button>
  )

  if (!hasTooltip) return button
  return (
    <ActionTooltipHost open={visible} onClose={hide} trigger={button}>
      {tooltip}
    </ActionTooltipHost>
  )
}

export const Button = Object.assign(forwardRef(ButtonRoot), {
  Text: ActionText,
  Tooltip
})
