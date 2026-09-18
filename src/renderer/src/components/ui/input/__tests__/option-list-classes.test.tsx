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
