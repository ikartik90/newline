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
    expect(css).toMatch(/--glyph-list-marker: var\(--ink-2\);/)
    // Declared once: the ink scale flips with the theme.
    expect(css.match(/--glyph-list-marker:/g)).toHaveLength(1)
    const built = await buildMainCss(['list-marker', 'list-bullet', 'list-bullet-circle'])
    for (const name of ['list-marker', 'list-bullet', 'list-bullet-circle']) {
      const rule = declarationsOf(built, name)
      expect(rule).toMatch(/var\(--glyph-list-marker\)/)
      expect(rule).not.toMatch(/surface-branded/)
    }
  })

  it('has no surface of its own', () => {
    expect(css).not.toMatch(/surface-list-marker/)
  })

  it('dots a plain bullet at 4px', () => {
    expect(css).toMatch(/--size-list-bullet:\s*4px;/)
  })

  // Every column of markers is set as the list's text is, figures tabular,
  // so a digit's width is `1ch` there and the columns line up on it.
  it('numbers in tabular figures, at the size of the text they number', async () => {
    const built = await buildMainCss([
      'text-style-body-sm',
      'list-marker-box',
      'list-bullet',
      'list-bullet-icon'
    ])
    const textSize = /font-size: ([^;]+);/.exec(declarationsOf(built, 'text-style-body-sm'))![1]
    for (const name of ['list-marker-box', 'list-bullet', 'list-bullet-icon']) {
      const own = declarationsOf(built, name).split(/&|\{/)[0]
      expect(own).toContain(`font-size: ${textSize};`)
      expect(own).toContain('font-variant-numeric: tabular-nums;')
      expect(own).toContain('font-family: var(--font-sans);')
    }
    // The ordinal itself takes the column's size rather than a smaller one.
    expect(declarationsOf(built, 'list-marker')).not.toMatch(/font-size/)
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
