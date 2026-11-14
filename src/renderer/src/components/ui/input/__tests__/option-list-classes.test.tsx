import { render } from '@testing-library/react'
import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'
import { OptionList, optionListClasses } from '../option-list'

// ---------------------------------------------------------------------------
// Tailwind only emits CSS for class names its scanner can read whole out of the
// source. A class assembled at runtime — `data-[active]:${tint}` — renders in
// the DOM but has no rule, so the state it dresses is invisible. The keyboard
// highlight in the slash menu went missing exactly this way. So: every class
// the option list puts on an element must be one the scanner finds in the
// renderer's source, spelled out.
// ---------------------------------------------------------------------------

// `src/renderer/src`, cut from this file's own URL: the renderer's tsconfig
// has no Node types, so no `path` or `__dirname` here — and not
// `new URL('../..', import.meta.url)` either, which Vite rewrites into a
// served asset path.
const HERE = decodeURIComponent(new URL(import.meta.url).pathname)
const RENDERER_SRC = HERE.slice(0, HERE.indexOf('/components/ui/input/__tests__/'))

let scanned: Set<string> | null = null
function candidates(): Set<string> {
  if (!scanned) {
    const scanner = new Scanner({
      sources: [
        { base: RENDERER_SRC, pattern: '**/*.tsx', negated: false },
        { base: RENDERER_SRC, pattern: '**/*.ts', negated: false }
      ]
    })
    scanned = new Set(scanner.scan())
  }
  return scanned
}

function classesOf(el: Element): string[] {
  return el.className.split(/\s+/).filter(Boolean)
}

function unscanned(classes: string[]): string[] {
  const found = candidates()
  return classes.filter((c) => !found.has(c))
}

describe('option list classes are ones Tailwind can see in the source', () => {
  it.each(['default', 'onBrand', 'plain'] as const)('listbox rows and list, tone %s', (tone) => {
    const { getByRole } = render(
      <OptionList tone={tone} value="b">
        <OptionList.Listbox>
          <OptionList.Option value="a">A</OptionList.Option>
          <OptionList.Option value="b">B</OptionList.Option>
        </OptionList.Listbox>
      </OptionList>
    )
    const list = getByRole('listbox')
    const rows = [...list.querySelectorAll('[role="option"]')]
    const all = [...classesOf(list), ...classesOf(list.parentElement!), ...rows.flatMap(classesOf)]
    expect(unscanned(all)).toEqual([])
  })

  it.each(['default', 'onBrand'] as const)('toolbar buttons, tone %s', (tone) => {
    const { getByRole } = render(
      <OptionList tone={tone} direction="inline">
        <OptionList.Toolbar aria-label="Marks">
          <OptionList.Option value="bold" pressed>
            Bold
          </OptionList.Option>
          <OptionList.Option>Link</OptionList.Option>
          <OptionList.Divider />
        </OptionList.Toolbar>
      </OptionList>
    )
    const bar = getByRole('toolbar')
    const all = [...classesOf(bar), ...[...bar.children].flatMap(classesOf)]
    expect(unscanned(all)).toEqual([])
  })

  // Some slots (the empty row, a variant's search) never land on an element
  // here, so the resolved slot strings are checked as well.
  it.each(['default', 'onBrand', 'plain'] as const)('every resolved slot, tone %s', (tone) => {
    for (const direction of ['block', 'inline'] as const) {
      for (const size of ['md', 'sm'] as const) {
        const slots = optionListClasses({ tone, direction, fit: 'scroll', size })
        const all = Object.values(slots).flatMap((value) => value.split(/\s+/).filter(Boolean))
        expect(unscanned(all)).toEqual([])
      }
    }
  })
})

// Two utilities for the same property resolve by stylesheet order, not by
// position in the class list, so the collapse and the box must be written as
// alternatives rather than one appended to the other.

describe('a root that collapses says nothing else', () => {
  it.each([
    ['plain, block', { tone: 'plain', direction: 'block' }],
    ['plain, inline', { tone: 'plain', direction: 'inline' }],
    ['default, inline', { tone: 'default', direction: 'inline' }],
    ['onBrand, inline', { tone: 'onBrand', direction: 'inline' }]
  ] as const)('%s', (_name, variant) => {
    const { root } = optionListClasses({ ...variant, fit: 'scroll', size: 'md' })
    expect(root.split(/\s+/).filter(Boolean)).toEqual(['contents'])
  })

  it('so an inline toolbar wraps its row in no box at all', () => {
    const { getByRole } = render(
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label="Marks">
          <OptionList.Option>Bold</OptionList.Option>
        </OptionList.Toolbar>
      </OptionList>
    )
    expect(getByRole('toolbar').parentElement!.className).toBe('contents')
  })
})

describe('a root that does draw a box states each property once', () => {
  it.each(['default', 'onBrand'] as const)('one width, tone %s', (tone) => {
    const { root } = optionListClasses({ tone, direction: 'block', fit: 'scroll', size: 'md' })
    expect(root.split(/\s+/).filter((c) => /^w-/.test(c))).toHaveLength(1)
  })
})

// An option's icon at rest takes the icon ink (one step softer on a sheet); a
// selected or pressed one keeps the chip's own ink, as does every icon on the
// brand tone.
describe('an icon at rest', () => {
  const rest = 'not-aria-selected:not-aria-pressed:[&_svg]:text-glyph-icon'
  it('takes the icon ink only while its option is neither selected nor pressed', () => {
    for (const tone of ['default', 'plain'] as const) {
      const { option } = optionListClasses({ tone, direction: 'inline', fit: 'scroll', size: 'md' })
      expect(option.split(/\s+/)).toContain(rest)
    }
    const { option } = optionListClasses({
      tone: 'onBrand',
      direction: 'inline',
      fit: 'scroll',
      size: 'md'
    })
    expect(option).not.toContain('text-glyph-icon')
  })
})

// A toolbar's buttons are cornered as an icon button is, 16px; a column's rows
// keep their own. Its dividers stand 16px tall, centred, not the row's height.
describe('a toolbar row', () => {
  const inline = optionListClasses({
    tone: 'plain',
    direction: 'inline',
    fit: 'scroll',
    size: 'md'
  })
  const block = optionListClasses({
    tone: 'default',
    direction: 'block',
    fit: 'scroll',
    size: 'md'
  })

  it('corners its options as an icon button is', () => {
    const option = inline.option.split(/\s+/)
    expect(option).toContain('rounded-xl')
    expect(option).not.toContain('rounded-sm')
    expect(block.option.split(/\s+/)).toContain('rounded-sm')
    expect(block.option.split(/\s+/)).not.toContain('rounded-xl')
  })

  it('stands its dividers 16px tall', () => {
    const divider = inline.divider.split(/\s+/)
    expect(divider).toEqual(expect.arrayContaining(['w-px', 'h-4', 'self-center']))
    expect(divider).not.toContain('self-stretch')
    expect(divider).not.toContain('h-auto')
  })
})
