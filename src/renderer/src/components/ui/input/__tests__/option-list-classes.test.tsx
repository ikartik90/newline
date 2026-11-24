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
  it.each(['default', 'plain'] as const)('listbox rows and list, tone %s', (tone) => {
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

  it.each(['default', 'plain'] as const)('toolbar buttons, tone %s', (tone) => {
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
  it.each(['default', 'plain', 'menu'] as const)('every resolved slot, tone %s', (tone) => {
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
    ['menu, block', { tone: 'menu', direction: 'block' }],
    ['default, inline', { tone: 'default', direction: 'inline' }]
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
  it('one width', () => {
    const { root } = optionListClasses({
      tone: 'default',
      direction: 'block',
      fit: 'scroll',
      size: 'md'
    })
    expect(root.split(/\s+/).filter((c) => /^w-/.test(c))).toHaveLength(1)
  })
})

// An option's icon takes its text's ink, at rest, selected or pressed.
describe('an icon at rest', () => {
  it('takes no ink of its own', () => {
    for (const tone of ['default', 'plain', 'menu'] as const) {
      const { option } = optionListClasses({ tone, direction: 'inline', fit: 'scroll', size: 'md' })
      expect(option.split(/\s+/).filter((c) => c.includes('[&_svg]:text-'))).toEqual([])
    }
  })

  // Every list stands on a sheet or a field: none has a brand-tinted ground to retint for.
  it('has no brand tone', () => {
    for (const tone of ['default', 'plain', 'menu'] as const) {
      for (const direction of ['block', 'inline'] as const) {
        const slots = optionListClasses({ tone, direction, fit: 'scroll', size: 'md' })
        expect(Object.values(slots).join(' ')).not.toMatch(
          /hover-brand|ink-field-placeholder-focus/
        )
      }
    }
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

// A floating menu is the toolbar stood on end: rows as tall as a toolbar
// button and cornered as one, 2px clear of the shell and 1px apart, as a toolbar's are.
describe('a menu column', () => {
  const menu = optionListClasses({ tone: 'menu', direction: 'block', fit: 'content', size: 'md' })

  it('stands its rows as tall as a toolbar button, cornered as an icon button is', () => {
    const option = menu.option.split(/\s+/)
    expect(option).toEqual(expect.arrayContaining(['h-(--size-toolbar-button)', 'rounded-xl']))
    expect(option).not.toContain('rounded-sm')
    expect(option).not.toContain('p-1')
  })

  it('lays its rows 2px clear of the shell and 1px apart', () => {
    const list = menu.list.split(/\s+/)
    expect(list.filter((c) => /^(p|px|py)-/.test(c))).toEqual(['p-0.5'])
    expect(list.filter((c) => /^gap-/.test(c))).toEqual(['gap-px'])
    expect(list.filter((c) => /^max-h-/.test(c))).toHaveLength(1)
  })

  // Seven rows and half of the next, to say there is more: their gaps and the inset over them counted.
  it('caps a menu that scrolls at seven and a half rows', () => {
    const scrolling = optionListClasses({
      tone: 'menu',
      direction: 'block',
      fit: 'scroll',
      size: 'md'
    })
    expect(scrolling.list.split(/\s+/)).toContain(
      'max-h-[calc(7.5*var(--size-toolbar-button)+7*1px+2px)]'
    )
  })
})
