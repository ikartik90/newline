import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { buildMainCss, declarationsOf } from './support/tailwind-build'

// A list's markers are ink alone, ink 2: the number, the check and the cross
// stand on nothing, and the plain bullet is a 4px dot.
describe('list markers', () => {
  it('draws the number, the check and the cross on no chip', async () => {
    const built = await buildMainCss(['list-marker', 'list-bullet-circle'])
    for (const name of ['list-marker', 'list-bullet-circle']) {
      // The box's own, not the glyph's: the check is its `::after`, painted.
      const own = declarationsOf(built, name).split(/&|\{/)[0]
      expect(own).toMatch(/display/)
      expect(own).not.toMatch(/background|border-radius/)
    }
  })

  it('inks the number, the bullet, the check and the cross in ink 2', async () => {
    expect(css).toMatch(/--ink-list-marker: var\(--ink-2\);/)
    // Declared once: the ink scale flips with the theme.
    expect(css.match(/--ink-list-marker:/g)).toHaveLength(1)
    const built = await buildMainCss(['list-marker', 'list-bullet', 'list-bullet-circle'])
    for (const name of ['list-marker', 'list-bullet', 'list-bullet-circle']) {
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
    const built = await buildMainCss([
      'text-style-prose',
      'list-marker-box',
      'list-bullet',
      'list-bullet-icon'
    ])
    const prose = declarationsOf(built, 'text-style-prose')
    const of = (property: string, rule: string) =>
      new RegExp(`${property}: ([^;]+);`).exec(rule)![1]
    for (const name of ['list-marker-box', 'list-bullet', 'list-bullet-icon']) {
      const own = declarationsOf(built, name).split(/&|\{/)[0]
      expect(of('font-family', own)).toBe(of('font-family', prose))
      expect(of('font-size', own)).toBe(of('font-size', prose))
      expect(own).toContain('font-variant-numeric: tabular-nums;')
    }
    // The ordinal itself takes the column's size rather than a smaller one, and
    // the text's weight.
    const ordinal = declarationsOf(await buildMainCss(['list-marker']), 'list-marker')
    expect(ordinal).not.toMatch(/font-size/)
    expect(of('font-weight', ordinal)).toBe(of('font-weight', prose))
  })

  // A check, a cross or a bullet has no baseline: it centres on a box as tall
  // as its item's first line, the prose's line.
  it('stands every marker in a box as tall as the prose line', async () => {
    const built = await buildMainCss([
      'text-style-prose',
      'list-marker-box',
      'list-bullet',
      'list-bullet-icon'
    ])
    const prose = declarationsOf(built, 'text-style-prose')
    const line = /line-height: ([^;]+);/.exec(prose)![1]
    expect(css).toContain(`--size-list-marker-line: ${line};`)
    for (const name of ['list-marker-box', 'list-bullet', 'list-bullet-icon']) {
      expect(declarationsOf(built, name).split(/&|\{/)[0]).toContain(
        'height: var(--size-list-marker-line);'
      )
    }
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
  it('centres a bullet, a check and a cross on the ones digit', async () => {
    expect(css).toMatch(
      /--size-list-marker-ones: calc\(var\(--size-list-marker-period\) \+ 0\.5ch\);/
    )
    const built = await buildMainCss(['list-bullet', 'list-bullet-icon', 'list-bullet-circle'])
    for (const name of ['list-bullet', 'list-bullet-icon']) {
      expect(declarationsOf(built, name)).toContain('justify-content: flex-end;')
    }
    expect(declarationsOf(built, 'list-bullet')).toContain(
      'margin-inline-end: calc(var(--size-list-marker-ones) - var(--size-list-bullet) / 2);'
    )
    expect(declarationsOf(built, 'list-bullet-circle')).toContain(
      'margin-inline-end: calc(var(--size-list-marker-ones) - 8px);'
    )
  })
})
