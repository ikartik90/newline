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

  // The slots the Combobox borrows (`highlighted`) never land on an element
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
