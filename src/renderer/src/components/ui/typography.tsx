import type { HTMLAttributes, ReactNode } from 'react'

export type TypographyType =
  | 'title'
  | 'subheading'
  | 'bodyLarge'
  | 'bodySmall'
  | 'quote'
  | 'caption'
  | 'sidenote'

export type TypographyTag =
  | 'h1'
  | 'h2'
  | 'h3'
  | 'h4'
  | 'h5'
  | 'h6'
  | 'p'
  | 'span'
  | 'blockquote'
  | 'figcaption'
  | 'small'
  | 'cite'
  | 'label'

type Wrap = 'pretty' | 'balance'

// Single home for all typography styles: the text style, the ink, and how the
// lines wrap. Each type resolves to ONE colour and ONE wrap so no two utilities
// for the same property ever land on an element — that would be settled by
// stylesheet order, not by this table.
//
// `pretty` is right for prose that runs on — it guards the last line and leaves
// the rest alone. A title, a subheading and a caption are a line or two set on
// their own (a caption centred under something), where what matters is that the
// lines come out even, so those balance.
const TYPE_STYLES: Record<TypographyType, { style: string; color: string; wrap: Wrap }> = {
  title: { style: 'text-style-title', color: 'text-fg-title', wrap: 'balance' },
  subheading: { style: 'text-style-subheading', color: 'text-fg', wrap: 'balance' },
  bodyLarge: { style: 'text-style-body-lg', color: 'text-fg-body', wrap: 'pretty' },
  bodySmall: { style: 'text-style-body-sm', color: 'text-fg-body', wrap: 'pretty' },
  quote: { style: 'text-style-quote', color: 'text-fg', wrap: 'pretty' },
  caption: { style: 'text-style-caption', color: 'text-fg', wrap: 'balance' },
  sidenote: { style: 'text-style-sidenote', color: 'text-fg', wrap: 'pretty' }
}

const WRAP_CLASS: Record<Wrap, string> = {
  pretty: '[text-wrap:pretty]',
  balance: '[text-wrap:balance]'
}

export interface TypographyStyleOptions {
  type: TypographyType
  /** Even out the lines instead of the type's own wrapping. */
  wrap?: 'balance'
}

/** The Tailwind classes for a type — for an element that is not a `Typography`. */
export function typographyStyles({ type, wrap }: TypographyStyleOptions): string {
  const { style, color, wrap: own } = TYPE_STYLES[type]
  return `${style} ${color} ${WRAP_CLASS[wrap ?? own]}`
}

export interface TypographyProps extends HTMLAttributes<HTMLElement> {
  tag: TypographyTag
  type: TypographyType
  /** Even out the lines instead of the type's own wrapping. */
  wrap?: 'balance'
  children: ReactNode
  className?: string
}

export function Typography({
  tag: Tag,
  type,
  wrap,
  children,
  className,
  ...rest
}: TypographyProps) {
  const classes = typographyStyles({ type, wrap })
  return (
    <Tag className={className ? `${classes} ${className}` : classes} {...rest}>
      {children}
    </Tag>
  )
}
