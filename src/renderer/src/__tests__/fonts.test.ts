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
  it("sets a note's paragraph in the serif at 18px on a 28px line, in the regular weight", async () => {
    const built = await buildMainCss(['text-style-paragraph-md', 'text-style-body-sm'])
    const paragraph = declarationsOf(built, 'text-style-paragraph-md')
    expect(paragraph).toContain('font-family: var(--font-serif);')
    expect(paragraph).toContain('font-size: 1.125rem;')
    expect(paragraph).toContain('line-height: 1.75rem;')
    expect(paragraph).toContain('font-weight: 400;')
    // The interface's small text stays in the sans.
    expect(declarationsOf(built, 'text-style-body-sm')).toContain('font-family: var(--font-sans);')
  })

  it('sets the paragraph a size up in the serif at 24px on a 32px line', async () => {
    const built = await buildMainCss(['text-style-paragraph-lg'])
    const large = declarationsOf(built, 'text-style-paragraph-lg')
    expect(large).toContain('font-family: var(--font-serif);')
    expect(large).toContain('font-weight: 400;')
    expect(large).toContain('font-size: 1.5rem;')
    expect(large).toContain('line-height: 2rem;')
  })

  it('sets the paragraph a size down in the serif at 14px on a 24px line', async () => {
    const built = await buildMainCss(['text-style-paragraph-sm'])
    const small = declarationsOf(built, 'text-style-paragraph-sm')
    expect(small).toContain('font-family: var(--font-serif);')
    expect(small).toContain('font-weight: 400;')
    expect(small).toContain('font-size: 0.875rem;')
    expect(small).toContain('line-height: 1.5rem;')
  })

  // 40, 32, 26 and 22px, on lines of 48, 40, 36 and 32px.
  it('sets the four heading levels in the sans, from 40px on a 48px line down to 22px on 32px', async () => {
    const levels = [
      ['text-style-heading-1', '2.5rem', '3rem'],
      ['text-style-heading-2', '2rem', '2.5rem'],
      ['text-style-heading-3', '1.625rem', '2.25rem'],
      ['text-style-heading-4', '1.375rem', '2rem']
    ]
    const built = await buildMainCss(levels.map(([name]) => name))
    for (const [name, size, line] of levels) {
      const heading = declarationsOf(built, name)
      expect(heading, name).toContain('font-family: var(--font-sans);')
      expect(heading, name).toContain('font-weight: 400;')
      expect(heading, name).toContain(`font-size: ${size};`)
      expect(heading, name).toContain(`line-height: ${line};`)
    }
  })

  // Their lines 28, 24, 24 and 20px.
  it("sets the interface's text on lines of whole pixels", async () => {
    const styles = [
      ['text-style-body-lg', '1rem', '1.75rem'],
      ['text-style-body-sm', '0.875rem', '1.5rem'],
      ['text-style-caption', '0.75rem', '1.5rem'],
      ['text-style-sidenote', '0.75rem', '1.25rem']
    ]
    const built = await buildMainCss(styles.map(([name]) => name))
    for (const [name, size, line] of styles) {
      const style = declarationsOf(built, name)
      expect(style, name).toContain(`font-size: ${size};`)
      expect(style, name).toContain(`line-height: ${line};`)
    }
  })

  // A length holds whatever size is set under it; a factor of the size would
  // follow that size instead.
  it('writes every line height as a length in rem, never a factor of the size', () => {
    const lines = [...css.matchAll(/line-height:\s*([^;]+);/g)].map(([, value]) => value)
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) expect(line).toMatch(/^\d*\.?\d+rem$/)
  })

  it('declares none of the styles the headings and the paragraph sizes stand in for', () => {
    const gone = [
      'title',
      'subheading',
      'prose',
      'small',
      'heading-5',
      'heading-6',
      'quote',
      'fineprint',
      'sidebar'
    ]
    for (const name of gone) {
      expect(css, name).not.toContain(`@utility text-style-${name} `)
    }
  })

  it('sets code in the mono, inside a line and in a block', async () => {
    const built = await buildMainCss(['inline-code', 'text-style-code'])
    expect(declarationsOf(built, 'inline-code')).toContain('font-family: var(--font-mono);')
    expect(declarationsOf(built, 'text-style-code')).toContain('font-family: var(--font-mono);')
  })

  it('sets a block of code at 12px on a 20px line', async () => {
    const code = declarationsOf(await buildMainCss(['text-style-code']), 'text-style-code')
    expect(code).toContain('font-size: 0.75rem;')
    expect(code).toContain('line-height: 1.25rem;')
  })

  it('sets code inside a line at 12px on a 16px line', async () => {
    const code = declarationsOf(await buildMainCss(['inline-code']), 'inline-code')
    expect(code).toContain('font-size: 0.75rem;')
    expect(code).toContain('line-height: 1rem;')
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
