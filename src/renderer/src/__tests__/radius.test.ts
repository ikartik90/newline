import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'
import { optionListClasses } from '@/components/ui/input/option-list'
import { POPOVER_TOOLBAR } from '@/components/ui/popover'
import { parseTokens, utilityRules } from './support/css-tokens'
import { buildMainCss as build, declarationsOf, RENDERER_SRC } from './support/tailwind-build'

// Every way Tailwind writes a radius: all four corners, a side, one corner.
const SIDES = [
  '',
  's-',
  'e-',
  't-',
  'r-',
  'b-',
  'l-',
  'ss-',
  'se-',
  'ee-',
  'es-',
  'tl-',
  'tr-',
  'br-',
  'bl-'
]
const STEPS = parseTokens(css)
  .theme.filter((t) => t.name.startsWith('--radius-'))
  .map((t) => t.name.replace('--radius-', ''))

describe('corner radius', () => {
  it('reads the seven steps', () => {
    expect(STEPS).toEqual(['xs', 'sm', 'md', 'lg', 'xl', '2xl', '3xl'])
  })

  it('eases every radius token into the straight, a squircle, on every corner and side', async () => {
    const classes = SIDES.flatMap((side) => STEPS.map((step) => `rounded-${side}${step}`))
    const built = await build(classes)
    for (const className of classes) {
      expect(declarationsOf(built, className), className).toMatch(/corner-shape: squircle;/)
    }
  })

  // A circular arc reads rounder than a squircle of the same radius; at 0.6 of
  // it the two look alike.
  it('falls back, where corner-shape is unknown, to a circular radius 0.6 as large', async () => {
    const built = await build(STEPS.map((step) => `rounded-${step}`))
    const fallback = /@supports not \(corner-shape: squircle\) \{\s*:root \{([^}]*)\}/.exec(built)
    expect(fallback, 'an @supports not (corner-shape: squircle) block').not.toBeNull()
    const declared = Object.fromEntries(
      [...fallback![1].matchAll(/(--radius-[\w-]+): ([^;]+);/g)].map(([, name, value]) => [
        name,
        value
      ])
    )
    const theme = parseTokens(css).theme
    for (const step of STEPS) {
      const token = theme.find((t) => t.name === `--radius-${step}`)!
      expect(declared[token.name], token.name).toBe(
        `${Math.round(parseFloat(token.value) * 0.6)}px`
      )
    }
  })

  it('leaves a circle round, and no corner or an arbitrary one as written', async () => {
    const classes = ['rounded-full', 'rounded-t-full', 'rounded-none', 'rounded-[50%]']
    const built = await build(classes)
    for (const className of classes) {
      expect(declarationsOf(built, className), className).not.toMatch(/corner-shape/)
    }
  })

  // A corner shape is not inherited as the radius can be, so a pseudo drawn
  // over a squircle takes both or it rounds where its parent eases.
  it('shapes a corner that takes its parent’s radius as its parent is', () => {
    const base = RENDERER_SRC
    const written = new Set(
      new Scanner({
        sources: [
          { base, pattern: '**/*.tsx', negated: false },
          { base, pattern: '**/*.ts', negated: false }
        ]
      }).scan()
    )
    const inheriting = [...written].filter((c) => c.endsWith('rounded-[inherit]'))
    expect(inheriting.length).toBeGreaterThan(0)
    for (const className of inheriting) {
      const variants = className.slice(0, -'rounded-[inherit]'.length)
      expect(written, className).toContain(`${variants}[corner-shape:inherit]`)
    }
  })

  it('has no squircle of its own beside the tokens', () => {
    expect(utilityRules(css).map((rule) => rule.name)).not.toContain('squircle')
  })
})

// Two corners are concentric when the outer one's radius is the inner one's and
// the space between them: a toolbar's shell round the buttons it holds 2px in.
describe("a floating toolbar's corner", () => {
  const classesOf = (list: string): string[] => list.split(/\s+/)
  const row = optionListClasses({ tone: 'default', direction: 'inline', fit: 'scroll', size: 'md' })
  const menu = optionListClasses({ tone: 'menu', direction: 'block', fit: 'content', size: 'md' })

  // A button's corner is as it is drawn, not as it is asked: a radius past half the button's
  // height is cut to that half, and an icon button's 16px on its 28px is.
  it('is its buttons’ corner as drawn and the inset it keeps round them, a squircle as theirs is', async () => {
    // What it is concentric with: an icon button's corner, 2px (`p-0.5`) inside it.
    expect(classesOf(row.option)).toContain('rounded-xl')
    expect(classesOf(menu.option)).toContain('rounded-xl')
    expect(classesOf(menu.option)).toContain('h-(--size-toolbar-button)')
    expect(classesOf(POPOVER_TOOLBAR)).toContain('p-0.5')
    expect(classesOf(menu.list)).toContain('p-0.5')
    const corner = declarationsOf(await build(['rounded-toolbar']), 'rounded-toolbar')
    expect(corner).toContain(
      'border-radius: calc(min(var(--radius-xl), var(--size-toolbar-button) / 2) + 2px);'
    )
    expect(corner).toMatch(/corner-shape: squircle;/)
  })

  // Written on the buttons' own tokens, it follows them where corner-shape is unknown too.
  it('is no step of the scale', () => {
    expect(STEPS).not.toContain('toolbar')
  })
})
