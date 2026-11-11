import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { HighlightedCode } from '../highlighted-code'

afterEach(cleanup)

describe('HighlightedCode', () => {
  it('renders plain code, with no token spans, for a language it cannot highlight', () => {
    const { container } = render(<HighlightedCode code="print('hi')" language="python" />)
    const code = container.querySelector('code')
    expect(code?.textContent).toBe("print('hi')")
    expect(code?.querySelector('span')).toBeNull()
  })

  it('renders plain code when no language is given', () => {
    const { container } = render(<HighlightedCode code="const x = 1" />)
    expect(container.querySelector('code')?.querySelector('span')).toBeNull()
  })

  it('splits a known language into role-tagged spans that re-join to the source', () => {
    const source = "const value = 'ok';"
    const { container } = render(<HighlightedCode code={source} language="javascript" />)
    const spans = Array.from(container.querySelectorAll('code > span'))
    expect(spans.length).toBeGreaterThan(1)
    expect(spans.map((span) => span.textContent).join('')).toBe(source)
    expect(spans.map((span) => span.getAttribute('data-syntax-role'))).toContain('primary')
    expect(spans.map((span) => span.getAttribute('data-syntax-role'))).toContain('secondary')
  })

  it('inks both accented roles in the one accent, apart from plain code and comments', () => {
    // A JS string, not a JSX attribute literal — the latter keeps `\n` as two
    // characters, and the comment would then swallow the whole line.
    const source = "// note\nconst value = 'ok';"
    const { container } = render(<HighlightedCode code={source} language="javascript" />)
    const classOf = (role: string) =>
      container.querySelector(`[data-syntax-role="${role}"]`)?.className ?? ''
    // Code has one accent, the prose's, for both accented roles.
    expect(classOf('primary')).toContain('text-fg-highlight')
    expect(classOf('secondary')).toContain('text-fg-highlight')
    expect(classOf('neutral')).toContain('text-fg')
    expect(classOf('comment')).toContain('text-fg-body')
    expect(new Set(['primary', 'neutral', 'comment'].map(classOf)).size).toBe(3)
  })

  it('accepts language aliases the way the highlighter does', () => {
    const { container } = render(<HighlightedCode code="let a = 1" language="ts" />)
    expect(container.querySelectorAll('code > span').length).toBeGreaterThan(0)
  })

  it('passes className through to the <code> element either way', () => {
    const plain = render(<HighlightedCode code="x" language="python" className="text-style-code" />)
    expect(plain.container.querySelector('code')?.className).toBe('text-style-code')
    cleanup()

    const lit = render(<HighlightedCode code="x" language="css" className="text-style-code" />)
    expect(lit.container.querySelector('code')?.className).toBe('text-style-code')
  })
})
