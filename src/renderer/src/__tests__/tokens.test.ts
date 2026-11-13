import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { parseTokens, utilityRules } from './support/css-tokens'
import { channelsOf, hexOf, oklchOf } from './support/oklch'

// Each check below reads main.css through this parser; one that finds nothing
// would let a check for an absent token pass.
describe('reading main.css', () => {
  it('finds its tokens in every block', () => {
    const tokens = parseTokens(css)
    expect(tokens.inline.map((t) => t.name)).toContain('--color-surface-canvas')
    expect(tokens.light.map((t) => t.name)).toContain('--surface-0')
    expect(tokens.dark.map((t) => t.name)).toContain('--surface-0')
    expect(tokens.theme.map((t) => t.name)).toContain('--spacing-md')
    expect(utilityRules(css).map((rule) => rule.name)).toContain('surface-level-1')
  })
})

describe('spacing scale', () => {
  it('names twelve steps, md at 6px and every size from 8px up a step above Panda’s', () => {
    const spacing = parseTokens(css).theme.filter((t) => t.name.startsWith('--spacing-'))
    expect(spacing).toEqual([
      { name: '--spacing-3xs', value: '0.5px' },
      { name: '--spacing-2xs', value: '1px' },
      { name: '--spacing-xs', value: '2px' },
      { name: '--spacing-sm', value: '4px' },
      { name: '--spacing-md', value: '6px' },
      { name: '--spacing-lg', value: '8px' },
      { name: '--spacing-xl', value: '12px' },
      { name: '--spacing-2xl', value: '16px' },
      { name: '--spacing-3xl', value: '20px' },
      { name: '--spacing-4xl', value: '32px' },
      { name: '--spacing-5xl', value: '40px' },
      { name: '--spacing-6xl', value: '80px' }
    ])
  })
})

describe('the brand', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  it('is Sky 500 in light and Sky 400 in dark, with no brand colours of its own', () => {
    expect(value(tokens.light, '--surface-branded')).toBe('var(--color-sky-500)')
    expect(value(tokens.dark, '--surface-branded')).toBe('var(--color-sky-400)')
    const all = [...tokens.theme, ...tokens.light, ...tokens.dark, ...tokens.inline]
    expect(all.filter((t) => /--color-brand-/.test(`${t.name} ${t.value}`))).toEqual([])
  })

  it('gives code the one accent, with no second of its own', () => {
    for (const block of [tokens.light, tokens.dark]) {
      expect(value(block, '--glyph-highlight')).toBe('var(--color-sky-400)')
    }
    expect(css).not.toMatch(/syntax-secondary/)
  })
})

describe('the solid fills', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  it('puts the highlight on solid sky 100 in light and sky 800 in dark', () => {
    expect(value(tokens.light, '--surface-highlight')).toBe('var(--color-sky-100)')
    expect(value(tokens.dark, '--surface-highlight')).toBe('var(--color-sky-800)')
  })
})

describe('the surface scale', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value
  const LEVELS = [0, 1, 2, 3, 4]

  it('runs from base 50 to base 400 in light and base 900 to base 500 in dark', () => {
    expect(LEVELS.map((n) => value(tokens.light, `--surface-${n}`))).toEqual(
      ['50', '100', '200', '300', '400'].map((shade) => `var(--color-base-${shade})`)
    )
    expect(LEVELS.map((n) => value(tokens.dark, `--surface-${n}`))).toEqual(
      ['900', '800', '700', '600', '500'].map((shade) => `var(--color-base-${shade})`)
    )
  })

  it('mirrors the scale as an inverse, each step the other theme’s shade of it', () => {
    for (const n of [1, 2, 3, 4]) {
      expect(value(tokens.light, `--surface-inverse-${n}`)).toBe(
        value(tokens.dark, `--surface-${n}`)
      )
      expect(value(tokens.dark, `--surface-inverse-${n}`)).toBe(
        value(tokens.light, `--surface-${n}`)
      )
    }
  })

  it('makes each ink step its surface step in the other theme', () => {
    for (const n of LEVELS) {
      expect(value(tokens.light, `--ink-${n}`)).toBe(value(tokens.dark, `--surface-${n}`))
      expect(value(tokens.dark, `--ink-${n}`)).toBe(value(tokens.light, `--surface-${n}`))
    }
  })

  it('fills a primary button on the inverse, the secondary’s fill and hover flipped', () => {
    expect(value(tokens.light, '--surface-button-primary-default')).toBe('var(--surface-inverse-1)')
    expect(value(tokens.light, '--surface-button-primary-hover')).toBe('var(--surface-inverse-2)')
  })

  it('inks a primary button in the other theme’s body ink', () => {
    expect(value(tokens.light, '--glyph-button-primary-default')).toBe(
      value(tokens.dark, '--glyph-body')
    )
    expect(value(tokens.dark, '--glyph-button-primary-default')).toBe(
      value(tokens.light, '--glyph-body')
    )
    expect(css).not.toMatch(/--(color-)?glyph-branded\b/)
  })

  it('grounds the canvas in surface 0 and every sheet in surface 1', () => {
    expect(value(tokens.light, '--surface-canvas')).toBe('var(--surface-0)')
    expect(value(tokens.light, '--surface-sheet')).toBe('var(--surface-1)')
  })

  it('puts a secondary button, field or hovered item on the canvas a step up, on surface 1', () => {
    for (const name of [
      '--surface-button-secondary-default',
      '--surface-field-default',
      '--surface-field-hover'
    ]) {
      expect(value(tokens.light, name)).toBe('var(--surface-1)')
    }
  })

  it('presses an item on the canvas two steps up, on surface 2', () => {
    expect(value(tokens.light, '--surface-field-pressed')).toBe('var(--surface-2)')
  })

  it('hovers a secondary button on the canvas a step above its fill, on surface 2', () => {
    expect(value(tokens.light, '--surface-button-secondary-hover')).toBe('var(--surface-2)')
  })

  it('names the scale once, the themes changing only its shades', () => {
    const semantic = [
      '--surface-canvas',
      '--surface-sheet',
      '--surface-raised',
      '--surface-button-primary-default',
      '--surface-button-primary-hover',
      '--surface-button-secondary-default',
      '--surface-button-secondary-hover',
      '--surface-field-default',
      '--surface-field-hover',
      '--surface-field-pressed'
    ]
    for (const name of semantic) expect(value(tokens.dark, name)).toBeUndefined()
  })

  it('stands a raised surface a step above the sheet it is on', () => {
    expect(value(tokens.light, '--surface-raised')).toBe('var(--surface-2)')
  })

  it('raises what stands on a level-n surface to n + 1, a button’s hover and a press to n + 2', () => {
    const rules = utilityRules(css)
    for (const n of [1, 2]) {
      expect(rules.find((rule) => rule.name === `surface-level-${n}`)?.declarations).toEqual([
        { property: '--surface-button-primary-default', value: `var(--surface-inverse-${n + 1})` },
        { property: '--surface-button-primary-hover', value: `var(--surface-inverse-${n + 2})` },
        { property: '--surface-button-secondary-default', value: `var(--surface-${n + 1})` },
        { property: '--surface-button-secondary-hover', value: `var(--surface-${n + 2})` },
        { property: '--surface-field-default', value: `var(--surface-${n + 1})` },
        { property: '--surface-field-hover', value: `var(--surface-${n + 1})` },
        { property: '--surface-field-pressed', value: `var(--surface-${n + 2})` }
      ])
    }
  })

  it('steps what is on the glass in the ink at a low alpha, so the glass keeps its colour', () => {
    const rule = css.match(
      /@layer utilities \{\s*html\[data-frosted\] \[data-on-glass\]\.surface-level-1 \{([^}]*)\}/
    )
    expect(rule).not.toBeNull()
    const declared = [...rule![1].matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(
      ([, property, value]) => ({
        property,
        value: value
          .replace(/\s+/g, ' ')
          .replace(/\( | (?=\))/g, (m) => m.trim())
          .trim()
      })
    )
    // A primary keeps its solid inverse fill: its flipped ink needs that ground.
    const ink: Record<string, string> = { 'var(--surface-2)': '6%', 'var(--surface-3)': '10%' }
    const level1 = utilityRules(css).find((r) => r.name === 'surface-level-1')!.declarations
    expect(declared).toEqual(
      level1
        .filter(({ property }) => !property.startsWith('--surface-button-primary-'))
        .map(({ property, value }) => ({
          property,
          value: `color-mix(in oklab, var(--glyph-title) ${ink[value]}, transparent)`
        }))
    )
  })

  it('stops at level 2, the highest anything stands on: a hover above it has no step', () => {
    expect(utilityRules(css).map((rule) => rule.name)).not.toContain('surface-level-3')
  })

  it('keeps the scale, a primitive, in blocks of its own apart from the system tokens', () => {
    const SCALE = [
      ...LEVELS.map((n) => `--surface-${n}`),
      ...[1, 2, 3, 4].map((n) => `--surface-inverse-${n}`),
      ...LEVELS.map((n) => `--ink-${n}`)
    ]
    const declared = (body: string) => [...body.matchAll(/(--[\w-]+)\s*:/g)].map(([, name]) => name)
    const themeBlocks = [...css.matchAll(/\n(:root|\.dark) \{([^}]*)\}/g)].map(
      ([, selector, body]) => ({
        selector,
        names: declared(body)
      })
    )
    const primitive = themeBlocks.filter((block) =>
      block.names.some((name) => SCALE.includes(name))
    )
    expect(primitive.map((block) => block.selector)).toEqual([':root', '.dark'])
    for (const block of primitive) expect(block.names).toEqual(SCALE)
  })

  it('gives the scale no utility: components write the system tokens over it', () => {
    expect(
      tokens.inline
        .map((t) => t.name)
        .filter((name) => /^--color-(surface-(inverse-)?|ink-)\d$/.test(name))
    ).toEqual([])
  })

  it('names a sheet once, --surface-sheet, with no second name', () => {
    expect(css).not.toMatch(/--(color-)?surface-(default|sidebar|glass|item-hover)\b/)
  })

  it('has no on-surface fill of its own: a sheet raises its fields instead', () => {
    expect(css).not.toMatch(/--surface-field-on-surface/)
  })
})

describe('a base shade in both themes', () => {
  const tokens = parseTokens(css)
  const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900']
  const shade = (raw: string | undefined) => /^var\(--color-base-(\d+)\)$/.exec(raw ?? '')?.[1]

  it('mirrors in light the dark one: 900 is 50, 800 is 100, 700 is 200', () => {
    const pairs = tokens.light.flatMap((token) => {
      const light = shade(token.value)
      const dark = shade(tokens.dark.find((t) => t.name === token.name)?.value)
      if (!light || !dark) return []
      return [{ name: token.name, light, dark }]
    })
    expect(pairs.map((pair) => pair.name)).toContain('--surface-0')
    for (const pair of pairs) {
      expect(pair).toEqual({ ...pair, light: SHADES[9 - SHADES.indexOf(pair.dark)] })
    }
  })
})

describe('the status inks', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  it('are the palettes’ 500 in light and 400 in dark, as ink and as fill', () => {
    const palette = { danger: 'candy', warning: 'honey', success: 'mint', info: 'sky' }
    for (const [status, hue] of Object.entries(palette)) {
      expect(value(tokens.light, `--glyph-${status}`)).toBe(`var(--color-${hue}-500)`)
      expect(value(tokens.dark, `--glyph-${status}`)).toBe(`var(--color-${hue}-400)`)
    }
  })
})

describe('the divider', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  const block = { light: tokens.light, dark: tokens.dark }
  // What a theme says of a token; dark, saying nothing, keeps light's.
  const inTheme = (theme: 'light' | 'dark', name: string) =>
    value(block[theme], name) ?? value(tokens.light, name)
  // A token's colour as sRGB channels, following var() through its theme and @theme.
  const rgbOf = (theme: 'light' | 'dark', raw: string): number[] => {
    const ref = /^var\((--[\w-]+)\)$/.exec(raw)
    if (ref) return rgbOf(theme, inTheme(theme, ref[1]) ?? value(tokens.theme, ref[1])!)
    const hex = raw.startsWith('oklch(') ? hexOf(raw) : raw
    return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  }
  const lightnessOf = (rgb: number[]) =>
    channelsOf(
      oklchOf(`#${rgb.map((c) => Math.round(c).toString(16).padStart(2, '0')).join('')}`)
    )[0]

  it.each(['light', 'dark'] as const)(
    'is glass in %s: the theme’s ink, mixed with transparent so what is behind shows through',
    (theme) => {
      expect(value(block[theme], '--border-divider')).toMatch(
        /^color-mix\(in srgb, var\(--color-neutral-\d+\) [\d.]+%, transparent\)$/
      )
    }
  )

  it('is half as strong as it was: 7.5% light, 10% dark', () => {
    expect(value(tokens.light, '--border-divider')).toMatch(/ 7\.5%, transparent\)$/)
    expect(value(tokens.dark, '--border-divider')).toMatch(/ 10%, transparent\)$/)
  })

  it.each(['light', 'dark'] as const)(
    'stands apart in %s from the canvas and the sidebar, the grounds it is drawn on',
    (theme) => {
      const [, ink, alpha] = /var\((--[\w-]+)\) ([\d.]+)%/.exec(
        value(block[theme], '--border-divider')!
      )!
      const a = Number(alpha) / 100
      for (const fill of ['--surface-canvas', '--surface-sheet']) {
        const ground = rgbOf(theme, inTheme(theme, fill)!)
        const line = rgbOf(theme, `var(${ink})`).map((c, i) => c * a + ground[i] * (1 - a))
        expect(Math.abs(lightnessOf(line) - lightnessOf(ground)), fill).toBeGreaterThanOrEqual(4)
      }
    }
  )
})
