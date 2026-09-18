import type { HTMLAttributes, ReactNode } from 'react'

// ---------------------------------------------------------------------------
// Notice — an inline informational callout: a leading status icon beside a
// short run of prose on a subtle neutral wash. Composed the way the rest of the
// library composes (icon-as-child, like Button):
//
//   <Notice>
//     <Notice.Icon>
//       <InfoIcon />
//     </Notice.Icon>
//     <Notice.Label>
//       This shift starts on <strong>Tuesday</strong>.
//     </Notice.Label>
//   </Notice>
//
// The root owns the fill + row layout and the single `color` the icon inherits;
// the label reads as 75% prose with its <strong> runs stepped back up to the
// full accent. Purely presentational. The icon is decorative (aria-hidden); the
// meaning lives in the label. Pass `role`/`aria-live` through the root when the
// message updates live.
// ---------------------------------------------------------------------------

const cx = (...parts: Array<string | false | null | undefined>) => parts.filter(Boolean).join(' ')

// 4px between the icon and the prose, on an 8px inset; `field-fg` is the field
// family's resting accent, the one source the icon and emphasized runs inherit.
const rootStyle = 'flex items-start gap-1 w-full px-2 py-2 rounded-sm bg-notice text-field-fg'

const iconStyle = 'block shrink-0 size-5 [&_svg]:block [&_svg]:size-full'

// Body prose sits a step below the accent; the emphasized runs step back up to
// full colour and weight.
const labelStyle =
  'flex-1 min-w-0 text-style-sidenote text-field-fg/75 break-words [&_strong]:text-field-fg [&_strong]:font-bold [&_b]:text-field-fg [&_b]:font-bold'

export interface NoticeProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

function NoticeRoot({ className, children, ...rest }: NoticeProps) {
  return (
    <div className={cx(rootStyle, className)} {...rest}>
      {children}
    </div>
  )
}

export interface NoticeIconProps extends HTMLAttributes<HTMLSpanElement> {
  /** The glyph — a bare `<Icon/>`, sized and tinted by the slot. */
  children: ReactNode
}

/** Leading icon slot — decorative, so it's hidden from assistive tech. */
function NoticeIcon({ className, children, ...rest }: NoticeIconProps) {
  return (
    <span aria-hidden className={cx(iconStyle, className)} {...rest}>
      {children}
    </span>
  )
}

export interface NoticeLabelProps extends HTMLAttributes<HTMLParagraphElement> {
  children: ReactNode
}

/** The message — wrap the salient bits in `<strong>` to emphasize them. */
function NoticeLabel({ className, children, ...rest }: NoticeLabelProps) {
  return (
    <p className={cx(labelStyle, className)} {...rest}>
      {children}
    </p>
  )
}

export const Notice = Object.assign(NoticeRoot, {
  Icon: NoticeIcon,
  Label: NoticeLabel
})
