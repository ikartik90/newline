import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'

// The lines a note draws on its words: the strike through them, and the
// underlines of an underlined word, a link and a sidenote.
const rule = (name: string): string =>
  css.slice(css.indexOf(`@utility ${name} {`)).split(/\n}\n/)[0]

const offsetOf = (declarations: string): string | undefined =>
  /text-underline-offset: ([^;]+);/.exec(declarations)?.[1]

const MUTED = 'text-decoration-color: color-mix(in srgb, var(--ink-body) 50%, transparent);'

describe("the lines on a note's words", () => {
  // `line-through` stands a third of the ascent over the baseline, near the
  // top of a serif's x, and nothing moves it.
  it('strikes through the middle of the x-height, with an underline raised to it', () => {
    const strike = rule('article-strikethrough')
    expect(strike).toContain('text-decoration-line: underline;')
    expect(strike).not.toContain('line-through;')
    // Half an ex over the baseline, less half the line's own thickness.
    expect(strike).toContain('text-underline-offset: calc(-0.5ex - round(down, 0.05em, 0.25px));')
    // An underline steps round the ink it meets; a strike crosses all of it.
    expect(strike).toContain('text-decoration-skip-ink: none;')
    // As thick as it was: the browser's own.
    expect(strike).not.toContain('text-decoration-thickness')
  })

  it("draws a link's underline and a sidenote's where an underlined word's is", () => {
    const underline = offsetOf(rule('article-underline'))
    expect(underline).toBe('0.15em')
    expect(offsetOf(rule('article-link'))).toBe(underline)
    expect(offsetOf(rule('article-sidenote-text'))).toBe(underline)
  })

  it("keeps a link's underline 1px and muted, and the highlight under the pointer", () => {
    const [resting, hovered] = rule('article-link').split('&:hover')
    expect(resting).toContain('text-decoration-line: underline;')
    expect(resting).toContain('text-decoration-style: solid;')
    expect(resting).toContain('text-decoration-thickness: 1px;')
    expect(resting).toContain(MUTED)
    expect(resting).toMatch(/transition:[^;]*text-decoration-color 150ms ease;/)
    // A bar in the background sits under the box, wherever the font's descent ends.
    expect(resting).not.toContain('background')
    expect(resting).not.toContain('padding')
    expect(hovered).toContain('text-decoration-color: var(--border-link-hover);')
  })

  it("keeps a sidenote's underline dotted, 1px and muted", () => {
    const dotted = rule('article-sidenote-text')
    expect(dotted).toContain('text-decoration-line: underline;')
    expect(dotted).toContain('text-decoration-style: dotted;')
    expect(dotted).toContain('text-decoration-thickness: 1px;')
    expect(dotted).toContain(MUTED)
  })

  // The number stands outside its sidenote's words, so it says so itself.
  it("keeps the pointer an arrow over a sidenote's number", () => {
    expect(rule('article-sidenote-ref')).toContain('cursor: default;')
  })
})
