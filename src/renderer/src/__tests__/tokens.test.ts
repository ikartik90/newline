import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { glassRule, parseTokens, utilityRules } from './support/css-tokens'
import { channelsOf, hexOf, oklchOf } from './support/oklch'

// Each check below reads main.css through this parser; one that finds nothing
// would let a check for an absent token pass.
describe('reading main.css', () => {
  it('finds its tokens in every block', () => {
    const tokens = parseTokens(css)
    expect(tokens.inline.map((t) => t.name)).toContain('--color-bg-canvas')
    expect(tokens.light.map((t) => t.name)).toContain('--bg-0')
    expect(tokens.dark.map((t) => t.name)).toContain('--bg-0')
    expect(tokens.theme.map((t) => t.name)).toContain('--spacing-md')
    expect(utilityRules(css).map((rule) => rule.name)).toContain('bg-level-1')
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

describe('the accent', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  // The accent is the highlight: primitives of its own, a fill, an ink and a
  // line, and nothing is named for a brand.
  it('is the highlight, with no brand colours or branded tokens of its own', () => {
    const all = [...tokens.theme, ...tokens.light, ...tokens.dark, ...tokens.inline]
    expect(all.filter((t) => /--color-brand-|-branded\b/.test(`${t.name} ${t.value}`))).toEqual([])
  })

  it('is a primitive fill, ink and line: sky 100, 500 and 500 in light, 800, 400 and 400 in dark', () => {
    expect(value(tokens.light, '--bg-highlight')).toBe('var(--color-sky-100)')
    expect(value(tokens.dark, '--bg-highlight')).toBe('var(--color-sky-800)')
    expect(value(tokens.light, '--ink-highlight')).toBe('var(--color-sky-500)')
    expect(value(tokens.dark, '--ink-highlight')).toBe('var(--color-sky-400)')
    expect(value(tokens.light, '--divider-highlight')).toBe('var(--color-sky-500)')
    expect(value(tokens.dark, '--divider-highlight')).toBe('var(--color-sky-400)')
    // A line in it stands on the divider, as every line does.
    expect(css).not.toMatch(/--(color-)?border-highlight\b/)
  })

  // Every place the highlight is drawn is a system token of its own, on the
  // highlight's primitive; the themes change only the primitive.
  it('builds a system token on the highlight wherever it is drawn', () => {
    const built = {
      '--bg-mark-default': 'var(--bg-highlight)',
      '--bg-field-selected': 'var(--bg-highlight)',
      '--bg-field-focus': 'var(--bg-highlight)',
      '--ink-link-default': 'var(--ink-highlight)',
      '--ink-sidenote-marker': 'var(--ink-highlight)',
      '--ink-code-accent': 'var(--ink-highlight)',
      '--ink-eyebrow': 'var(--ink-highlight)',
      '--ink-metric': 'var(--ink-highlight)',
      '--ink-mark-default': 'var(--ink-highlight)',
      '--ink-field-selected': 'var(--ink-highlight)',
      '--ink-field-focus': 'var(--ink-highlight)',
      '--border-quote': 'var(--divider-highlight)',
      '--border-link-hover': 'var(--divider-highlight)',
      '--border-resize-handle-hover': 'var(--divider-highlight)',
      '--border-progress': 'var(--divider-highlight)',
      '--outline-focus': 'var(--divider-highlight)'
    }
    for (const [name, primitive] of Object.entries(built)) {
      expect(value(tokens.light, name)).toBe(primitive)
      expect(value(tokens.dark, name)).toBeUndefined()
      expect(value(tokens.inline, `--color-${name.slice(2)}`)).toBe(`var(${name})`)
    }
  })

  it('rings focus at the highlight line’s 1.5px stroke', () => {
    expect(css).toMatch(/box-shadow: 0 0 0 1\.5px var\(--outline-focus\);/)
  })

  it('inks a sidenote’s number, an eyebrow and a metric, and underlines a link, in their own tokens', () => {
    const rule = (name: string) => css.slice(css.indexOf(`@utility ${name} {`)).split(/\n}\n/)[0]
    expect(rule('article-sidenote-ref')).toMatch(/color: var\(--ink-sidenote-marker\)/)
    expect(rule('article-eyebrow')).toMatch(/color: var\(--ink-eyebrow\)/)
    expect(rule('article-metric-value')).toMatch(/color: var\(--ink-metric\)/)
    expect(rule('article-highlight')).toMatch(/background-color: var\(--bg-mark-default\)/)
    expect(rule('article-highlight')).toMatch(/color: var\(--ink-mark-default\)/)
    expect(rule('article-link')).toMatch(
      /linear-gradient\(var\(--border-link-hover\), var\(--border-link-hover\)\)/
    )
  })

  it('selects text as the prose highlight is marked', () => {
    const selection = css.slice(css.indexOf('::selection {')).split('}')[0]
    expect(selection).toMatch(/background-color: var\(--bg-mark-default\)/)
    expect(selection).toMatch(/color: var\(--ink-mark-default\)/)
  })

  it('gives code the one accent, with no second of its own', () => {
    expect(value(tokens.light, '--ink-code-accent')).toBe('var(--ink-highlight)')
    expect(css).not.toMatch(/syntax-secondary/)
  })

  // What was the info ink is the highlight: one sky accent, not two.
  it('has no info ink beside the highlight', () => {
    expect(css).not.toMatch(/--(color-)?ink-info\b/)
  })
})

describe('the solid fills', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value

  it('puts a selected field on the highlight fill, solid sky 100 in light and sky 800 in dark', () => {
    expect(value(tokens.light, '--bg-field-selected')).toBe('var(--bg-highlight)')
    expect(value(tokens.dark, '--bg-field-selected')).toBeUndefined()
  })
})

// Spotwork's nomenclature: a token's state is default, hover, pressed, selected,
// focus, target or disabled, and only a link is ever active.
// A colour's role is bg, ink, border or outline: what things stand on is bg,
// what text and icons are drawn in ink, each over a scale of the same name.
describe('the role names', () => {
  it('calls the colour text and icons are drawn in ink, never glyph', () => {
    expect(css).not.toMatch(/--(color-)?glyph-/)
    expect(css).toMatch(/--ink-title:/)
    expect(css).toMatch(/--color-ink-title: var\(--ink-title\)/)
  })

  it('calls the colour things stand on bg, never surface', () => {
    expect(css).not.toMatch(/--(color-)?surface-|@utility surface-/)
    expect(css).toMatch(/--bg-canvas:/)
    expect(css).toMatch(/--color-bg-canvas: var\(--bg-canvas\)/)
    expect(css).toMatch(/@utility bg-level-1/)
  })
})

describe('the state names', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value
  const sky400At25 = 'color-mix(in srgb, var(--color-sky-400) 25%, transparent)'

  it('calls nothing active but a link', () => {
    const names = [...tokens.light, ...tokens.dark, ...tokens.inline].map((t) => t.name)
    expect(names.filter((n) => /-active\b/.test(n) && !/-link-/.test(n))).toEqual([])
  })

  it('names a picked option, a pressed toggle and a checked box selected', () => {
    expect(value(tokens.light, '--ink-field-selected')).toBe('var(--ink-highlight)')
    expect(value(tokens.dark, '--ink-field-selected')).toBeUndefined()
    for (const block of [tokens.light, tokens.dark]) {
      expect(value(block, '--border-field-selected')).toBe(sky400At25)
    }
  })

  it('names a field the keys are in focus, its fill, ink, edge and placeholder', () => {
    expect(value(tokens.light, '--bg-field-focus')).toBe('var(--bg-highlight)')
    expect(value(tokens.dark, '--bg-field-focus')).toBeUndefined()
    expect(value(tokens.light, '--ink-field-focus')).toBe('var(--ink-highlight)')
    expect(value(tokens.dark, '--ink-field-focus')).toBeUndefined()
    for (const block of [tokens.light, tokens.dark]) {
      expect(value(block, '--border-field-focus')).toBe(sky400At25)
    }
    expect(value(tokens.light, '--ink-field-placeholder-focus')).toBe(
      'color-mix(in srgb, var(--ink-highlight) 25%, transparent)'
    )
    expect(value(tokens.dark, '--ink-field-placeholder-focus')).toBeUndefined()
  })

  // A shell — a chip, a note's row — stands a step above the ground it is on:
  // its fill and hover one step up, selected two. On the glass, where nothing
  // rests in a shell's fill, its hover and selected are the primary's scale at
  // 15%. A shell never stands on a shell.
  it('steps a shell on canvas, on a sheet and on the glass, never on a shell', () => {
    const levels = utilityRules(css)
    const on = (n: number) =>
      new Map(
        levels
          .find((r) => r.name === `bg-level-${n}`)!
          .declarations.map((d) => [d.property, d.value])
      )
    const shell = ['--bg-shell-default', '--bg-shell-hover', '--bg-shell-selected']
    expect(shell.map((name) => value(tokens.light, name))).toEqual([
      'var(--bg-1)',
      'var(--bg-1)',
      'var(--bg-2)'
    ])
    for (const name of shell) expect(value(tokens.dark, name)).toBeUndefined()
    expect(shell.map((name) => on(1).get(name))).toEqual([
      'var(--bg-2)',
      'var(--bg-2)',
      'var(--bg-3)'
    ])
    for (const name of shell) expect(on(2).has(name)).toBe(false)
    const glass = glassRule(css)
    expect(shell.map((name) => glass.get(name))).toEqual([
      undefined,
      'color-mix(in srgb, var(--bg-inverse-5) 15%, transparent)',
      'color-mix(in srgb, var(--bg-inverse-3) 15%, transparent)'
    ])
    expect(css).not.toMatch(/--(color-)?bg-(raised|item-|note-)/)
  })
})

describe('the surface scale', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value
  const LEVELS = [0, 1, 2, 3, 4]

  it('runs from base 50 to base 400 in light and base 900 to base 500 in dark', () => {
    expect(LEVELS.map((n) => value(tokens.light, `--bg-${n}`))).toEqual(
      ['50', '100', '200', '300', '400'].map((shade) => `var(--color-base-${shade})`)
    )
    expect(LEVELS.map((n) => value(tokens.dark, `--bg-${n}`))).toEqual(
      ['900', '800', '700', '600', '500'].map((shade) => `var(--color-base-${shade})`)
    )
  })

  it('mirrors the scale as an inverse, each step the other theme’s shade of it', () => {
    for (const n of LEVELS) {
      expect(value(tokens.light, `--bg-inverse-${n}`)).toBe(value(tokens.dark, `--bg-${n}`))
      expect(value(tokens.dark, `--bg-inverse-${n}`)).toBe(value(tokens.light, `--bg-${n}`))
    }
  })

  // A fill is built from a surface, never from an ink.
  it('builds no fill from an ink', () => {
    const fromInk = [...css.matchAll(/(--bg-[\w-]+)\s*:\s*([^;]*var\(--ink[^;]*);/g)].map(
      ([, name, built]) => `${name}: ${built}`
    )
    expect(fromInk).toEqual([])
  })

  // Off the glass a secondary button's press keeps its hover, and the avatar
  // has no disc.
  it('fills the avatar and a secondary button’s press on the glass alone', () => {
    expect(css.match(/--bg-avatar-default:/g)).toHaveLength(1)
    expect(css.match(/--bg-button-secondary-pressed:/g)).toHaveLength(1)
    const unwrapped = (v?: string) => v?.replace(/\(\s+/g, '(').replace(/\s+\)/g, ')')
    expect(unwrapped(value(tokens.inline, '--color-bg-button-secondary-pressed'))).toBe(
      'var(--bg-button-secondary-pressed, var(--bg-button-secondary-hover))'
    )
    expect(value(tokens.inline, '--color-bg-avatar-default')).toBe('var(--bg-avatar-default)')
  })

  // One step past the surface scale, for a hovered note: base 400 and its mirror, 500.
  it('runs the inverse one step further, to 5', () => {
    expect(value(tokens.light, '--bg-inverse-5')).toBe('var(--color-base-400)')
    expect(value(tokens.dark, '--bg-inverse-5')).toBe('var(--color-base-500)')
  })

  // On to 7, for a secondary button resting on the glass: base 200 and its mirror, 700.
  it('runs the inverse on to 7', () => {
    expect(value(tokens.light, '--bg-inverse-6')).toBe('var(--color-base-300)')
    expect(value(tokens.dark, '--bg-inverse-6')).toBe('var(--color-base-600)')
    expect(value(tokens.light, '--bg-inverse-7')).toBe('var(--color-base-200)')
    expect(value(tokens.dark, '--bg-inverse-7')).toBe('var(--color-base-700)')
  })

  it('makes each ink step its surface step in the other theme', () => {
    for (const n of LEVELS) {
      expect(value(tokens.light, `--ink-${n}`)).toBe(value(tokens.dark, `--bg-${n}`))
      expect(value(tokens.dark, `--ink-${n}`)).toBe(value(tokens.light, `--bg-${n}`))
    }
  })

  it('fills a primary button on the inverse, the secondary’s fill and hover flipped', () => {
    expect(value(tokens.light, '--bg-button-primary-default')).toBe('var(--bg-inverse-1)')
    expect(value(tokens.light, '--bg-button-primary-hover')).toBe('var(--bg-inverse-2)')
  })

  // A field's text, an option's, a toolbar's: the secondary button's ink, so
  // every control reads alike. Its softer shades follow it.
  it('inks fields, options and toolbars as a secondary button is, in ink 1', () => {
    expect(value(tokens.light, '--ink-field-default')).toBe('var(--ink-1)')
    // Declared once: the ink scale flips with the theme.
    expect(css.match(/--ink-field-default:/g)).toHaveLength(1)
    expect(value(tokens.light, '--ink-field-placeholder')).toMatch(/^color-mix\(.*var\(--ink-1\)/)
    // A label, a hint, an empty slot: ink 4, the softest step.
    expect(value(tokens.light, '--ink-field-muted')).toBe('var(--ink-4)')
    expect(css.match(/--ink-field-muted:/g)).toHaveLength(1)
  })

  it('mirrors the ink scale as an inverse, each step the other theme’s shade of it', () => {
    for (const n of LEVELS) {
      expect(value(tokens.light, `--ink-inverse-${n}`)).toBe(value(tokens.dark, `--ink-${n}`))
      expect(value(tokens.dark, `--ink-inverse-${n}`)).toBe(value(tokens.light, `--ink-${n}`))
    }
  })

  // The secondary's ink, ink 1, flipped: inverse ink 1.
  it('inks a primary button in inverse ink 1', () => {
    expect(value(tokens.light, '--ink-button-primary-default')).toBe('var(--ink-inverse-1)')
    expect(css.match(/--ink-button-primary-default:/g)).toHaveLength(1)
  })

  // Each component has an ink of its own, which its icons take as its text
  // does; an ink holds on every surface, so none is declared twice.
  it('inks each button, a segment and a tooltip in tokens of their own', () => {
    const inks = {
      '--ink-button-secondary-default': 'var(--ink-2)',
      '--ink-button-tertiary-default': 'var(--ink-2)',
      '--ink-segment-default': 'var(--ink-2)',
      '--ink-tooltip-default': 'var(--ink-2)'
    }
    for (const [name, primitive] of Object.entries(inks)) {
      expect(value(tokens.light, name)).toBe(primitive)
      expect(css.match(new RegExp(`${name}:`, 'g'))).toHaveLength(1)
      expect(value(tokens.inline, `--color-${name.slice(2)}`)).toBe(`var(${name})`)
    }
  })

  it('has no shared control or icon ink for components to borrow', () => {
    expect(css).not.toMatch(/--(color-)?ink-(control|icon)\b/)
  })

  // Glass is a ground, not a variant: a button keeps its variant's ink there.
  it('names no ink for the glass', () => {
    expect(css).not.toMatch(/--(color-)?ink-[\w-]*glass/)
  })

  // A note's paragraphs and list items sit one step back from body ink.
  it("inks a note's prose one step softer than body ink, ink 2", () => {
    expect(value(tokens.light, '--ink-prose')).toBe('var(--ink-2)')
    expect(css.match(/--ink-prose:/g)).toHaveLength(1)
    expect(value(tokens.inline, '--color-ink-prose')).toBe('var(--ink-prose)')
  })

  it('stands text on the ink scale: titles on ink 0, everything else on ink 1', () => {
    expect(value(tokens.light, '--ink-title')).toBe('var(--ink-0)')
    expect(value(tokens.light, '--ink-body')).toBe('var(--ink-1)')
    // The scale flips with the theme, so neither is declared again in dark.
    expect(value(tokens.dark, '--ink-title')).toBeUndefined()
    expect(value(tokens.dark, '--ink-body')).toBeUndefined()
  })

  it('names its text inks for their role, as the surfaces are: --ink-body, never a default', () => {
    expect(css).not.toMatch(/--(color-)?ink-default\b/)
  })

  it('grounds the canvas in surface 0 and every sheet in surface 1', () => {
    expect(value(tokens.light, '--bg-canvas')).toBe('var(--bg-0)')
    expect(value(tokens.light, '--bg-sheet')).toBe('var(--bg-1)')
  })

  it('puts a secondary button, field or hovered item on the canvas a step up, on surface 1', () => {
    for (const name of [
      '--bg-button-secondary-default',
      '--bg-field-default',
      '--bg-field-hover'
    ]) {
      expect(value(tokens.light, name)).toBe('var(--bg-1)')
    }
  })

  it('presses an item on the canvas two steps up, on surface 2', () => {
    expect(value(tokens.light, '--bg-field-pressed')).toBe('var(--bg-2)')
  })

  // A tertiary button rests on nothing; its hover and press step as a field's.
  it('hovers a tertiary button on the canvas on surface 1, and presses it on surface 2', () => {
    expect(value(tokens.light, '--bg-button-tertiary-hover')).toBe('var(--bg-1)')
    expect(value(tokens.light, '--bg-button-tertiary-pressed')).toBe('var(--bg-2)')
    expect(css).not.toMatch(/--bg-button-tertiary-default:/)
  })

  it('hovers a secondary button on the canvas a step above its fill, on surface 2', () => {
    expect(value(tokens.light, '--bg-button-secondary-hover')).toBe('var(--bg-2)')
  })

  it('names the scale once, the themes changing only its shades', () => {
    const semantic = [
      '--bg-canvas',
      '--bg-sheet',
      '--bg-shell-default',
      '--bg-shell-hover',
      '--bg-shell-selected',
      '--bg-button-primary-default',
      '--bg-button-primary-hover',
      '--bg-button-secondary-default',
      '--bg-button-secondary-hover',
      '--bg-button-tertiary-hover',
      '--bg-button-tertiary-pressed',
      '--bg-field-default',
      '--bg-field-hover',
      '--bg-field-pressed'
    ]
    for (const name of semantic) expect(value(tokens.dark, name)).toBeUndefined()
  })

  it('raises what stands on a level-n surface to n + 1, a button’s hover and a press to n + 2', () => {
    const rules = utilityRules(css)
    for (const n of [1, 2]) {
      expect(rules.find((rule) => rule.name === `bg-level-${n}`)?.declarations).toEqual([
        { property: '--bg-button-primary-default', value: `var(--bg-inverse-${n + 1})` },
        { property: '--bg-button-primary-hover', value: `var(--bg-inverse-${n + 2})` },
        { property: '--bg-button-secondary-default', value: `var(--bg-${n + 1})` },
        { property: '--bg-button-secondary-hover', value: `var(--bg-${n + 2})` },
        { property: '--bg-button-tertiary-hover', value: `var(--bg-${n + 1})` },
        { property: '--bg-button-tertiary-pressed', value: `var(--bg-${n + 2})` },
        { property: '--bg-field-default', value: `var(--bg-${n + 1})` },
        { property: '--bg-field-hover', value: `var(--bg-${n + 1})` },
        { property: '--bg-field-pressed', value: `var(--bg-${n + 2})` },
        // A shell stands on a sheet, never on a shell.
        ...(n === 1
          ? [
              { property: '--bg-shell-default', value: 'var(--bg-2)' },
              { property: '--bg-shell-hover', value: 'var(--bg-2)' },
              { property: '--bg-shell-selected', value: 'var(--bg-3)' }
            ]
          : []),
        // A divider is a shade past the ground it is drawn on.
        { property: '--border-divider', value: `var(--divider-${n})` }
      ])
    }
  })

  // No field stands on the glass. What does borrows a field's hover and press,
  // which step as a shell's do; a picked option is a selected shell. A
  // secondary button and a tertiary step on the inverse at 15%, and a primary
  // keeps its solid inverse fill, for its flipped ink. The avatar's disc and a
  // secondary button's press are filled on the glass alone.
  it('steps what is on the glass as a shell, and a button on the inverse at 15%', () => {
    expect([...glassRule(css)]).toEqual([
      ['--bg-avatar-default', 'color-mix(in srgb, var(--bg-inverse-7) 15%, transparent)'],
      ['--bg-button-secondary-default', 'color-mix(in srgb, var(--bg-inverse-7) 15%, transparent)'],
      ['--bg-button-secondary-hover', 'color-mix(in srgb, var(--bg-inverse-5) 15%, transparent)'],
      ['--bg-button-secondary-pressed', 'color-mix(in srgb, var(--bg-inverse-3) 15%, transparent)'],
      ['--bg-button-tertiary-hover', 'color-mix(in srgb, var(--bg-inverse-5) 15%, transparent)'],
      ['--bg-button-tertiary-pressed', 'color-mix(in srgb, var(--bg-inverse-3) 15%, transparent)'],
      ['--bg-field-hover', 'var(--bg-shell-hover)'],
      ['--bg-field-pressed', 'var(--bg-shell-selected)'],
      ['--bg-field-selected', 'var(--bg-shell-selected)'],
      ['--bg-shell-hover', 'color-mix(in srgb, var(--bg-inverse-5) 15%, transparent)'],
      ['--bg-shell-selected', 'color-mix(in srgb, var(--bg-inverse-3) 15%, transparent)'],
      ['--border-divider', 'color-mix(in srgb, var(--divider-3) 15%, transparent)']
    ])
  })

  it('stops at level 2, the highest anything stands on: a hover above it has no step', () => {
    expect(utilityRules(css).map((rule) => rule.name)).not.toContain('bg-level-3')
  })

  it('keeps the scale, a primitive, in blocks of its own apart from the system tokens', () => {
    // Each role's scale, then its statuses: a status stands on no scale, a
    // primitive of its own on a palette step.
    const SCALE = [
      ...LEVELS.map((n) => `--bg-${n}`),
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((n) => `--bg-inverse-${n}`),
      ...['highlight', 'danger', 'warning', 'success'].map((s) => `--bg-${s}`),
      ...LEVELS.map((n) => `--ink-${n}`),
      ...LEVELS.map((n) => `--ink-inverse-${n}`),
      ...['highlight', 'danger', 'warning', 'success'].map((s) => `--ink-${s}`),
      ...[0, 1, 2, 3, 4, 5].map((n) => `--divider-${n}`),
      '--divider-highlight'
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
        .filter(
          (name) =>
            /^--color-(bg-(inverse-)?|ink-(inverse-)?|divider-)\d$/.test(name) ||
            /^--color-(bg|ink|divider)-(highlight|accent|danger|warning|success)$/.test(name)
        )
    ).toEqual([])
  })

  it('names a sheet once, --bg-sheet, with no second name', () => {
    expect(css).not.toMatch(/--(color-)?bg-(default|sidebar|glass)\b/)
  })

  it('has no on-surface fill of its own: a sheet raises its fields instead', () => {
    expect(css).not.toMatch(/--bg-field-on-surface/)
  })

  // A popover stands on the sheet, so a field has no brand-tinted ground of its own.
  it('has no brand-tinted popover, its hover or a veil: every popover is the sheet', () => {
    expect(css).not.toMatch(/--(color-)?bg-field-(popover|hover-brand|active-veil)\b/)
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
    expect(pairs.map((pair) => pair.name)).toContain('--bg-0')
    for (const pair of pairs) {
      expect(pair).toEqual({ ...pair, light: SHADES[9 - SHADES.indexOf(pair.dark)] })
    }
  })
})

describe('the statuses', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value
  const palette = { danger: 'candy', warning: 'honey', success: 'mint' }

  it('are primitive inks, the palettes’ 500 in light and 400 in dark', () => {
    for (const [status, hue] of Object.entries(palette)) {
      expect(value(tokens.light, `--ink-${status}`)).toBe(`var(--color-${hue}-500)`)
      expect(value(tokens.dark, `--ink-${status}`)).toBe(`var(--color-${hue}-400)`)
    }
  })

  // A fill sits back as the highlight's does: the palette's 100 in light, 800 in dark.
  it('are primitive fills, the palettes’ 100 in light and 800 in dark', () => {
    for (const [status, hue] of Object.entries(palette)) {
      expect(value(tokens.light, `--bg-${status}`)).toBe(`var(--color-${hue}-100)`)
      expect(value(tokens.dark, `--bg-${status}`)).toBe(`var(--color-${hue}-800)`)
    }
  })

  // A sync dot is the sync status's ink; only the row's delete is a fill, inked in danger.
  it('builds a system token on a status wherever it is drawn', () => {
    const built = {
      '--ink-error': 'var(--ink-danger)',
      '--ink-sync-offline': 'var(--ink-warning)',
      '--ink-sync-error': 'var(--ink-danger)',
      '--ink-sync-syncing': 'var(--ink-highlight)',
      '--ink-sync-synced': 'var(--ink-success)',
      '--bg-row-delete': 'var(--bg-danger)',
      '--ink-row-delete': 'var(--ink-danger)'
    }
    for (const [name, primitive] of Object.entries(built)) {
      expect(value(tokens.light, name)).toBe(primitive)
      expect(value(tokens.dark, name)).toBeUndefined()
      expect(value(tokens.inline, `--color-${name.slice(2)}`)).toBe(`var(${name})`)
    }
  })

  it('names no sync fill, and no fill for the accent', () => {
    const names = [...tokens.light, ...tokens.dark, ...tokens.inline].map((t) => t.name)
    expect(names.filter((n) => /(bg-sync-|bg-accent$)/.test(n))).toEqual([])
  })
})

describe('the scrollbar and the shadow', () => {
  const tokens = parseTokens(css)
  const value = (block: { name: string; value: string }[], name: string) =>
    block.find((t) => t.name === name)?.value
  const rule = (selector: string) => css.slice(css.indexOf(`${selector} {`)).split('}')[0]

  it('fills the scrollbar’s thumb in system tokens of its own: surface 1, 2 under the pointer and 3 pressed', () => {
    expect(value(tokens.light, '--bg-scrollbar-thumb-default')).toBe('var(--bg-1)')
    expect(value(tokens.light, '--bg-scrollbar-thumb-hover')).toBe('var(--bg-2)')
    expect(value(tokens.light, '--bg-scrollbar-thumb-pressed')).toBe('var(--bg-3)')
    for (const state of ['default', 'hover', 'pressed']) {
      expect(value(tokens.dark, `--bg-scrollbar-thumb-${state}`)).toBeUndefined()
      expect(value(tokens.inline, `--color-bg-scrollbar-thumb-${state}`)).toBe(
        `var(--bg-scrollbar-thumb-${state})`
      )
    }
    expect(value(tokens.light, '--bg-scrollbar-thumb')).toBeUndefined()
    expect(rule('  ::-webkit-scrollbar-thumb')).toMatch(
      /background-color: var\(--bg-scrollbar-thumb-default\);/
    )
    expect(rule('  ::-webkit-scrollbar-thumb:hover')).toMatch(
      /background-color: var\(--bg-scrollbar-thumb-hover\);/
    )
    expect(rule('  ::-webkit-scrollbar-thumb:active')).toMatch(
      /background-color: var\(--bg-scrollbar-thumb-pressed\);/
    )
    expect(css).not.toMatch(/\.dark ::-webkit-scrollbar-thumb/)
  })

  // The track is 8px: the thumb at its widest, 6px, and a pixel either side.
  it('draws the thumb 2px wide with square ends, 6px under the pointer, a pixel in from the track', () => {
    expect(rule('  ::-webkit-scrollbar')).toMatch(/width: 8px;/)
    const thumb = rule('  ::-webkit-scrollbar-thumb')
    expect(thumb).toMatch(/border-radius: 0;/)
    expect(thumb).toMatch(/border-inline: 3px solid transparent;/)
    expect(thumb).toMatch(/background-clip: padding-box;/)
    expect(rule('  ::-webkit-scrollbar-thumb:hover')).toMatch(/border-inline-width: 1px;/)
    expect(rule('  ::-webkit-scrollbar-thumb:active')).toMatch(/border-inline-width: 1px;/)
  })

  // Every sheet floats over the canvas, so its shadow is the canvas's colour.
  it('shadows a sheet in the colour of the canvas under it, surface 0', () => {
    expect(value(tokens.light, '--shadow-sheet')).toBe('var(--bg-0)')
    expect(value(tokens.dark, '--shadow-sheet')).toBeUndefined()
  })

  it('names no token that nothing draws: a selection ink or fill, an image outline, a notice', () => {
    const names = [...tokens.light, ...tokens.dark, ...tokens.inline].map((t) => t.name)
    expect(
      names.filter((n) => /(ink-selection|bg-selection|outline-image|bg-notice)$/.test(n))
    ).toEqual([])
  })

  it('declares no neutral palette: every grey is base', () => {
    expect(css).not.toMatch(/--color-neutral-\d/)
    expect(css).toMatch(/--color-neutral-\*: initial;/)
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

  // Solid, as the surfaces are: each step one shade past the surface step of
  // its number, mirrored in dark (100 is 800).
  it('stands every line on a solid scale, --divider-0 to --divider-5, base 100 to 600', () => {
    const DIVIDERS = [0, 1, 2, 3, 4, 5]
    for (const n of DIVIDERS) {
      expect(value(tokens.light, `--divider-${n}`)).toBe(`var(--color-base-${(n + 1) * 100})`)
      expect(value(tokens.dark, `--divider-${n}`)).toBe(`var(--color-base-${(8 - n) * 100})`)
    }
    // Declared once on :root, so each follows the theme through its step.
    expect(value(tokens.light, '--border-divider')).toBe('var(--divider-0)')
    expect(value(tokens.light, '--border-field-default')).toBe('var(--divider-2)')
    expect(value(tokens.dark, '--border-divider')).toBeUndefined()
    expect(value(tokens.dark, '--border-field-default')).toBeUndefined()
  })

  // Divider 0 on the canvas, 1 on a sheet (bg-level-1), 2 on a shell (bg-level-2).
  it.each(['light', 'dark'] as const)(
    'stands apart in %s from the canvas, a sheet and a shell, a step up on each',
    (theme) => {
      const grounds = [
        ['--bg-canvas', 'var(--divider-0)'],
        ['--bg-sheet', 'var(--divider-1)'],
        ['--bg-shell-default', 'var(--divider-2)']
      ] as const
      const sheet = new Map(
        utilityRules(css)
          .find((r) => r.name === 'bg-level-1')!
          .declarations.map((d) => [d.property, d.value])
      )
      for (const [fill, divider] of grounds) {
        // A shell stands on a sheet, and takes its fill from there.
        const raw = fill === '--bg-shell-default' ? sheet.get(fill)! : inTheme(theme, fill)!
        const ground = rgbOf(theme, raw)
        const line = rgbOf(theme, divider)
        expect(Math.abs(lightnessOf(line) - lightnessOf(ground)), fill).toBeGreaterThanOrEqual(4)
      }
    }
  )
})
