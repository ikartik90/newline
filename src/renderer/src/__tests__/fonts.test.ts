import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { buildMainCss, declarationsOf } from './support/tailwind-build'

// The type is Overused Grotesk for the interface and headings, EB Garamond for
// a note's prose and JetBrains Mono for code, in a block and inside a line.
const faces = css.match(/@font-face\s*\{[^}]*\}/g) ?? []
const facesOf = (family: string) =>
  faces.filter((face) => face.includes(`font-family: '${family}';`))

describe('the faces', () => {
  it('has EB Garamond upright and italic across its weights', () => {
    const [upright, italic, ...rest] = facesOf('EB Garamond')
    expect(rest).toHaveLength(0)
    expect(upright).toMatch(/font-style: normal;/)
    expect(upright).toMatch(/font-weight: 400 800;/)
    expect(upright).toContain("url('./fonts/EBGaramond-Variable.woff2')")
    expect(italic).toMatch(/font-style: italic;/)
    expect(italic).toMatch(/font-weight: 400 800;/)
    expect(italic).toContain("url('./fonts/EBGaramond-Italic-Variable.woff2')")
  })

  it('has Overused Grotesk and JetBrains Mono upright across their weights', () => {
    const [grotesk, ...moreGrotesk] = facesOf('Overused Grotesk')
    const [mono, ...moreMono] = facesOf('JetBrains Mono')
    expect([...moreGrotesk, ...moreMono]).toHaveLength(0)
    expect(grotesk).toContain("url('./fonts/OverusedGrotesk-Variable.woff2')")
    expect(grotesk).toMatch(/font-weight: 200 900;/)
    expect(mono).toContain("url('./fonts/JetBrainsMono-Variable.woff2')")
    expect(mono).toMatch(/font-weight: 100 800;/)
  })

  it('names every face in a font token', () => {
    expect(css).toMatch(/--font-sans: 'Overused Grotesk', /)
    expect(css).toMatch(/--font-serif: 'EB Garamond', /)
    expect(css).toMatch(/--font-mono: 'JetBrains Mono', /)
    expect(css).not.toMatch(/--font-pixel:/)
  })

  it('declares no face it does not use', () => {
    const families = new Set(faces.map((face) => /font-family: '([^']+)';/.exec(face)![1]))
    expect([...families].sort()).toEqual(['EB Garamond', 'JetBrains Mono', 'Overused Grotesk'])
  })
})

describe('the text styles', () => {
  it('sets the prose style at 18px on a 28px line, in the regular weight', async () => {
    const built = await buildMainCss(['text-style-prose', 'text-style-body-sm'])
    const prose = declarationsOf(built, 'text-style-prose')
    expect(prose).toContain('font-family: var(--font-serif);')
    expect(prose).toContain('font-size: 1.125rem;')
    expect(prose).toContain('line-height: 1.75rem;')
    expect(prose).toContain('font-weight: 400;')
    // The interface's small text stays in the sans.
    expect(declarationsOf(built, 'text-style-body-sm')).toContain('font-family: var(--font-sans);')
  })

  it('sets a quote in the serif at 22px on a 32px line', async () => {
    const built = await buildMainCss(['text-style-quote'])
    const quote = declarationsOf(built, 'text-style-quote')
    expect(quote).toContain('font-family: var(--font-serif);')
    expect(quote).toContain('font-size: 1.375rem;')
    expect(quote).toContain('line-height: 2rem;')
  })

  it('sets code in the mono, inside a line and in a block', async () => {
    const built = await buildMainCss(['inline-code', 'text-style-inline-code', 'text-style-code'])
    expect(declarationsOf(built, 'inline-code')).toContain('font-family: var(--font-mono);')
    expect(declarationsOf(built, 'text-style-inline-code')).toContain(
      'font-family: var(--font-mono);'
    )
    expect(declarationsOf(built, 'text-style-code')).toContain('font-family: var(--font-mono);')
  })

  it('sets code inside a line at 12px on a 16px line', async () => {
    const built = await buildMainCss(['inline-code', 'text-style-inline-code'])
    for (const name of ['inline-code', 'text-style-inline-code']) {
      expect(declarationsOf(built, name)).toContain('font-size: 0.75rem;')
      expect(declarationsOf(built, name)).toContain('line-height: 1rem;')
    }
  })

  // An inline box's fill is the font's own height, JetBrains Mono's 1.32em,
  // whatever its line height: the padding gives back the difference, so the
  // chip's fill is its 16px line with 2px above and below.
  it('fills a code chip to its 16px line, 2px either side', async () => {
    const built = await buildMainCss(['inline-code'])
    const chip = declarationsOf(built, 'inline-code')
    expect(chip).toContain('padding-block: calc(2px - (1.32em - 1rem) / 2);')
    expect(chip).not.toMatch(/padding-block: 2px;/)
  })

  it('corners a code chip at 8px', async () => {
    const built = await buildMainCss(['inline-code'])
    expect(declarationsOf(built, 'inline-code')).toContain('border-radius: var(--radius-md);')
  })
})
