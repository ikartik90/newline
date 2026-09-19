import {
  highlightCode,
  normalizeCodeLanguage,
  type SyntaxTokenRole
} from '@/utils/syntax-highlight'

interface HighlightedCodeProps {
  code: string
  language?: string
  className?: string
}

/**
 * One ink per token role, every one of them theme-following. The brand hues
 * are NOT: they are the same in both themes, and orange on the light code
 * block measures 1.36:1 — every string and number in a snippet disappeared.
 * `primary` takes the prose accent, which flips pink/orange; `secondary` is
 * its own token, because syntax needs two accents per theme and the brand
 * only has one.
 */
const SYNTAX_ROLE_CLASS: Record<SyntaxTokenRole, string> = {
  primary: 'text-fg-highlight',
  secondary: 'text-syntax-secondary',
  neutral: 'text-fg',
  comment: 'text-fg-body'
}

export function HighlightedCode({ code, language, className }: HighlightedCodeProps) {
  const normalized = normalizeCodeLanguage(language)

  if (!normalized) {
    return <code className={className}>{code}</code>
  }

  const tokens = highlightCode(code, language)

  return (
    <code className={className}>
      {tokens.map((token, index) => (
        <span
          key={`${index}-${token.text.slice(0, 12)}`}
          className={SYNTAX_ROLE_CLASS[token.role]}
          data-syntax-role={token.role}
        >
          {token.text}
        </span>
      ))}
    </code>
  )
}
