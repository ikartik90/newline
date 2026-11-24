import type { HTMLAttributes, ReactNode } from 'react'

export type TypographyType =
  | 'heading1'
  | 'heading2'
  | 'bodyLarge'
  | 'bodySmall'
  | 'paragraph'
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
// the rest alone. A heading and a caption are a line or two set on
// their own (a caption centred under something), where what matters is that the
// lines come out even, so those balance.
const TYPE_STYLES: Record<TypographyType, { style: string; color: string; wrap: Wrap }> = {
  heading1: { style: 'text-style-heading-1', color: 'text-ink-title', wrap: 'balance' },
  heading2: { style: 'text-style-heading-2', color: 'text-ink-body', wrap: 'balance' },
  bodyLarge: { style: 'text-style-body-lg', color: 'text-ink-body', wrap: 'pretty' },
  bodySmall: { style: 'text-style-body-sm', color: 'text-ink-body', wrap: 'pretty' },
  // A note's paragraphs, in the serif.
  paragraph: { style: 'text-style-paragraph-md', color: 'text-ink-paragraph', wrap: 'pretty' },
  caption: { style: 'text-style-caption', color: 'text-ink-body', wrap: 'balance' },
  sidenote: { style: 'text-style-sidenote', color: 'text-ink-body', wrap: 'pretty' }
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
