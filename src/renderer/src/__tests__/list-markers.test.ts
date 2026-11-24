import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { buildMainCss, declarationsOf } from './support/tailwind-build'

// A list's markers are ink alone, ink 2: the number stands on nothing, and the
// bullet is a 4px dot.
describe('list markers', () => {
  it('draws the number on no chip', async () => {
    const own = declarationsOf(await buildMainCss(['list-marker']), 'list-marker')
    expect(own).toMatch(/display/)
    expect(own).not.toMatch(/background|border-radius/)
  })

  it('inks the number and the bullet in ink 2', async () => {
    expect(css).toMatch(/--ink-list-marker: var\(--ink-2\);/)
    // Declared once: the ink scale flips with the theme.
    expect(css.match(/--ink-list-marker:/g)).toHaveLength(1)
    const built = await buildMainCss(['list-marker', 'list-bullet'])
    for (const name of ['list-marker', 'list-bullet']) {
      const rule = declarationsOf(built, name)
      expect(rule).toMatch(/var\(--ink-list-marker\)/)
      expect(rule).not.toMatch(/highlight/)
    }
  })

  it('has no surface of its own', () => {
    expect(css).not.toMatch(/bg-list-marker/)
  })

  it('dots a plain bullet at 4px', () => {
    expect(css).toMatch(/--size-list-bullet:\s*4px;/)
  })

  // Every column of markers is set as the list's text is, in its font, size and
  // weight, figures tabular, so a digit's width is `1ch` there and the columns
  // line up on it.
  it('numbers in tabular figures, in the font, size and weight of the text they number', async () => {
    const built = await buildMainCss(['text-style-paragraph-md', 'list-marker-box', 'list-bullet'])
    const paragraph = declarationsOf(built, 'text-style-paragraph-md')
    const of = (property: string, rule: string) =>
      new RegExp(`${property}: ([^;]+);`).exec(rule)![1]
    for (const name of ['list-marker-box', 'list-bullet']) {
      const own = declarationsOf(built, name).split(/&|\{/)[0]
      expect(of('font-family', own)).toBe(of('font-family', paragraph))
      expect(of('font-size', own)).toBe(of('font-size', paragraph))
      expect(own).toContain('font-variant-numeric: tabular-nums;')
    }
    // The ordinal itself takes the column's size rather than a smaller one, and
    // the text's weight.
    const ordinal = declarationsOf(await buildMainCss(['list-marker']), 'list-marker')
    expect(ordinal).not.toMatch(/font-size/)
    expect(of('font-weight', ordinal)).toBe(of('font-weight', paragraph))
  })

  // A bullet has no baseline: it centres on a box as tall as its item's first
  // line, the paragraph's.
  it("stands every marker in a box as tall as the paragraph's line", async () => {
    const built = await buildMainCss(['text-style-paragraph-md', 'list-marker-box', 'list-bullet'])
    const paragraph = declarationsOf(built, 'text-style-paragraph-md')
    const line = /line-height: ([^;]+);/.exec(paragraph)![1]
    expect(css).toContain(`--size-list-marker-line: ${line};`)
    for (const name of ['list-marker-box', 'list-bullet']) {
      expect(declarationsOf(built, name).split(/&|\{/)[0]).toContain(
        'height: var(--size-list-marker-line);'
      )
    }
  })

  // The number's own line is the paragraph's, so its digits stand level with
  // the words they number.
  it("sets a number on the paragraph's line", async () => {
    const built = await buildMainCss(['text-style-paragraph-md', 'list-marker'])
    const line = /line-height: ([^;]+);/.exec(declarationsOf(built, 'text-style-paragraph-md'))![1]
    expect(declarationsOf(built, 'list-marker')).toContain(`line-height: ${line};`)
  })

  // The period hangs in a fixed slot at the column's end, so every number,
  // however wide, ends on the same line.
  it('right-aligns numbers on the period', async () => {
    const built = await buildMainCss(['list-marker-box', 'list-marker-period'])
    expect(declarationsOf(built, 'list-marker-box')).toContain('justify-content: flex-end;')
    expect(declarationsOf(built, 'list-marker-period')).toMatch(
      /display: inline-block;[\s\S]*width: var\(--size-list-marker-period\);/
    )
  })

  // A list's items stand half a block's gap apart, 8px of the article's 16px.
  it('spaces list items at half the gap between blocks', () => {
    expect(css).toMatch(/article \{[^}]*gap: 16px;/)
    expect(css).toMatch(
      /article > \[data-list-item\] \+ \[data-list-item\] \{\s*margin-block-start: -8px;\s*\}/
    )
  })

  // Half a digit in from where the numbers end: over a numbered list's ones.
  it('centres a bullet on the ones digit', async () => {
    expect(css).toMatch(
      /--size-list-marker-ones: calc\(var\(--size-list-marker-period\) \+ 0\.5ch\);/
    )
    const bullet = declarationsOf(await buildMainCss(['list-bullet']), 'list-bullet')
    expect(bullet).toContain('justify-content: flex-end;')
    expect(bullet).toContain(
      'margin-inline-end: calc(var(--size-list-marker-ones) - var(--size-list-bullet) / 2);'
    )
  })
})
