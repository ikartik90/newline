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
 * One ink per token role. The two brand hues are the same in both themes (as
 * they are in kartik.to's Panda tokens); the two `fg` tokens follow `.dark`, so
 * plain code and comments stay legible on either canvas.
 */
const SYNTAX_ROLE_CLASS: Record<SyntaxTokenRole, string> = {
  primary: 'text-brand-pink',
  secondary: 'text-brand-orange',
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
