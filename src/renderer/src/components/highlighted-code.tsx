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

/** Code has one accent, the prose's: both accented roles take it. */
const SYNTAX_ROLE_CLASS: Record<SyntaxTokenRole, string> = {
  primary: 'text-fg-highlight',
  secondary: 'text-fg-highlight',
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
