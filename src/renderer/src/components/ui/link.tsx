import { forwardRef, type AnchorHTMLAttributes, type PointerEvent, type Ref } from 'react'
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
// Link — an <a> that NAVIGATES, the sibling of Button (button.tsx). Same
// composition (bare icon, `Link.Text` label, `Link.Tooltip`) and the same
// shared `action` look, so a link and a button are visually identical; only
// their semantics differ — which is exactly why they're kept as two components.
//
//   <Link href="https://…" target="_blank" aria-label="Source">
//     <GotoIcon />
//     <Link.Text>Source</Link.Text>
//   </Link>
//
// Always a plain <a> — there is no client-side router in the app — with a safe
// `rel` defaulted for `target="_blank"`.
// ---------------------------------------------------------------------------

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  /**
   * Override the look. Left unset it's inferred from the children: a `Link.Text`
   * (or bare string) label ⇒ `text`, an icon alone ⇒ `icon`. Set it for `link`.
   */
  variant?: ActionVariant
  /**
   * Fill prominence, independent of `variant` (the shape). Left unset it
   * defaults to `secondary` for text links and `tertiary` for icon links.
   */
  emphasis?: ActionEmphasis
  /** The chip's scale — see `Button`. */
  size?: ActionSize
}

function LinkRoot(
  {
    href,
    variant,
    emphasis,
    size = 'md',
    className,
    children,
    target,
    rel,
    onPointerEnter,
    onPointerLeave,
    ...rest
  }: LinkProps,
  ref: Ref<HTMLAnchorElement>
) {
  const { content, hasText, tooltip, hasTooltip, visible, show, hide } = useActionTooltip(children)
  const resolvedVariant = variant ?? (hasText ? 'text' : 'icon')
  const resolvedEmphasis = emphasis ?? (resolvedVariant === 'text' ? 'secondary' : 'tertiary')
  // Never ship a target="_blank" without the reverse-tabnabbing guard.
  const safeRel = rel ?? (target === '_blank' ? 'noopener noreferrer' : undefined)
  const styles = actionStyles({ variant: resolvedVariant, emphasis: resolvedEmphasis, size })

  const anchor = (
    <a
      ref={ref}
      href={href}
      target={target}
      rel={safeRel}
      className={className ? `${styles} ${className}` : styles}
      data-variant={resolvedVariant}
      data-emphasis={resolvedEmphasis}
      data-size={size}
      data-tooltip-visible={visible || undefined}
      onPointerEnter={(event: PointerEvent<HTMLAnchorElement>) => {
        onPointerEnter?.(event)
        if (hasTooltip) show(event)
      }}
      onPointerLeave={(event: PointerEvent<HTMLAnchorElement>) => {
        onPointerLeave?.(event)
        if (hasTooltip) hide()
      }}
      {...rest}
    >
      {content}
    </a>
  )

  if (!hasTooltip) return anchor
  return (
    <ActionTooltipHost open={visible} onClose={hide} trigger={anchor}>
      {tooltip}
    </ActionTooltipHost>
  )
}

export const Link = Object.assign(forwardRef(LinkRoot), {
  Text: ActionText,
  Tooltip
})
