import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Two token spellings compile happily and paint the wrong thing, so only a
// check like this catches them.
//
// 1. Every colour is named for the role it plays (surface, glyph, border,
//    outline), and a utility takes any of them: a border written in a
//    surface or glyph colour compiles, and draws a field's frame in the
//    field's own FILL — at the fill's alpha, and when active in the opaque
//    brand-tinted fill over a background already using it, so a focused
//    field loses its edge. A border draws in a border or outline colour.
//
// 2. Because that theme block is `inline`, Tailwind substitutes the value and
//    no utility ever reads `--color-surface-field-default`. A surface that
//    reassigns it to step its fields up reassigns nothing; the variable the
//    utilities actually read is `--surface-field-default`, and only the
//    `surface-level-*` utilities reassign it.
//
// 3. Every divider is a 1px line. A class list drawing in the divider token
//    at half a pixel is a hairline left over from before.
//
// 4. Tailwind looks a width up in `--spacing-*` before `--container-*`, so
//    with the named spacing scale a container width written by name sizes
//    the box by the spacing step instead: the 24rem column is 4px.
//
// Same convention as option-list-classes: the renderer's tsconfig has no Node
// types, so the path comes from this file's own URL and the scanner does the
// file reading.
// ---------------------------------------------------------------------------

const HERE = decodeURIComponent(new URL(import.meta.url).pathname)
const RENDERER_SRC = HERE.slice(0, HERE.indexOf('/__tests__/'))

// The class lists as written, for checks that need a class's neighbours.
const SOURCES = import.meta.glob(['../**/*.ts', '../**/*.tsx', '!../**/__tests__/**'], {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

let scanned: string[] | null = null
function candidates(): string[] {
  if (!scanned) {
    const scanner = new Scanner({
      sources: [
        { base: RENDERER_SRC, pattern: '**/*.tsx', negated: false },
        { base: RENDERER_SRC, pattern: '**/*.ts', negated: false },
        // Tests are left out: they spell what the checks forbid.
        { base: RENDERER_SRC, pattern: '**/__tests__/**', negated: true }
      ]
    })
    scanned = scanner.scan()
  }
  return scanned
}

describe('token usage', () => {
  it('draws every border in a border or outline colour', () => {
    const trap = /(^|:)border(-[btlrxyse])?-(surface|glyph)-/

    expect(candidates().filter((c) => trap.test(c))).toEqual([])
  })

  it('overrides the field fill through the variable the utilities read', () => {
    expect(candidates().filter((c) => c.includes('--color-surface-field-default:'))).toEqual([])
  })

  it('raises what stands on a sheet through the step utility, never by hand', () => {
    const byHand = candidates().filter((c) =>
      /(^|:)\[--surface-(field|button-secondary)-default:/.test(c)
    )
    expect(byHand).toEqual([])
  })

  it('makes every sheet that holds fields or buttons a level-1 surface', () => {
    const sheets = [
      '../components/ui/popover.tsx',
      '../components/ui/dialog.tsx',
      '../components/ui/properties-panel.tsx',
      '../components/menu-button.tsx',
      '../components/sidenote-layer.tsx',
      '../components/media-object.tsx',
      '../components/Sidebar.tsx'
    ]
    const flat = sheets.filter((file) => !/\bsurface-level-1\b/.test(SOURCES[file] ?? ''))
    expect(flat).toEqual([])
  })

  it('stands the code block’s language picker, on the block, on surface 2', () => {
    expect(SOURCES['../components/editor/styles.ts']).toMatch(/bg-surface-2 surface-level-2/)
  })

  it('draws every divider a full pixel wide', () => {
    const halfPixel = Object.entries(SOURCES).flatMap(([file, source]) =>
      [...source.matchAll(/'[^'\n]*'|"[^"\n]*"|`[^`]*`/g)]
        .map(([literal]) => literal)
        .filter((literal) => literal.includes('divider') && literal.includes('0.5px'))
        .map((literal) => `${file}: ${literal}`)
    )

    expect(Object.keys(SOURCES).length).toBeGreaterThan(50)
    expect(halfPixel).toEqual([])
  })

  it('sizes no width by a container name the spacing scale shadows', () => {
    const shadowed = /(^|:)(max-w|min-w)-(3xs|2xs|xs|sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl)$/

    expect(candidates().filter((c) => shadowed.test(c))).toEqual([])
  })
})
