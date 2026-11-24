import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'
import css from '@/assets/main.css?raw'

// ---------------------------------------------------------------------------
// Two token spellings compile happily and paint the wrong thing, so only a
// check like this catches them.
//
// 1. Every colour is named for the role it plays (bg, ink, border,
//    outline), and a utility takes any of them: a border written in a
//    bg or ink colour compiles, and draws a field's frame in the
//    field's own FILL — at the fill's alpha, and when active in the opaque
//    brand-tinted fill over a background already using it, so a focused
//    field loses its edge. A border draws in a border or outline colour.
//
// 2. Because that theme block is `inline`, Tailwind substitutes the value and
//    no utility ever reads `--color-bg-field-default`. A surface that
//    reassigns it to step its fields up reassigns nothing; the variable the
//    utilities actually read is `--bg-field-default`, and only the
//    `bg-level-*` utilities reassign it.
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
  // A class with no utility behind it compiles to nothing, and the text falls
  // back to whatever it inherits.
  it('writes no text style that main.css does not declare', () => {
    const declared = new Set(
      [...css.matchAll(/^@utility (text-style-[a-z0-9-]+) \{/gm)].map((match) => match[1])
    )
    const written = candidates().filter((c) => /^text-style-[a-z0-9-]+$/.test(c))
    expect(written.length).toBeGreaterThan(0)
    expect([...new Set(written)].filter((c) => !declared.has(c))).toEqual([])
  })

  it('draws every border in a border or outline colour', () => {
    const trap = /(^|:)border(-[btlrxyse])?-(bg|ink)-/

    expect(candidates().filter((c) => trap.test(c))).toEqual([])
  })

  it('overrides the field fill through the variable the utilities read', () => {
    expect(candidates().filter((c) => c.includes('--color-bg-field-default:'))).toEqual([])
  })

  it('raises what stands on a sheet through the step utility, never by hand', () => {
    const byHand = candidates().filter((c) =>
      /(^|:)\[--bg-(field-(default|hover|pressed)|button-(primary|secondary)-(default|hover)|button-tertiary-(hover|pressed)):/.test(
        c
      )
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
    const flat = sheets.filter((file) => !/\bbg-level-1\b/.test(SOURCES[file] ?? ''))
    expect(flat).toEqual([])
  })

  // The block is a sheet, so the picker, a shell on it, steps a level above it.
  it('stands the code block’s language picker, a shell on the block, a step above it', () => {
    const block = SOURCES['../prose/code-block.ts']
    expect(block).toMatch(/className = 'relative group\/code bg-level-1'/)
    expect(block).toMatch(/bg-bg-shell-default bg-level-2/)
  })

  it('never writes a surface primitive in a component, only the system tokens over it', () => {
    const utility =
      /(^|:)(bg|text|border|outline|ring|fill|stroke|decoration|shadow|from|via|to)-bg-(inverse-)?\d(\/|$)/
    expect(candidates().filter((c) => utility.test(c))).toEqual([])
  })

  it('never writes an ink primitive in a component, only the system tokens over it', () => {
    const utility =
      /(^|:)(bg|text|border|outline|ring|fill|stroke|decoration|shadow|from|via|to)-ink-(inverse-)?\d(\/|$)/
    expect(candidates().filter((c) => utility.test(c))).toEqual([])
  })

  it('never writes a divider primitive in a component, only the system tokens over it', () => {
    const utility =
      /(^|:)(bg|text|border|outline|ring|fill|stroke|decoration|shadow|from|via|to|divide)-divider-\d(\/|$)/
    expect(candidates().filter((c) => utility.test(c))).toEqual([])
  })

  // A status stands on no scale: its fill, ink and line are primitives too.
  it('never writes a status primitive in a component, only the system tokens over it', () => {
    const utility =
      /(^|:)(bg|text|border|outline|ring|fill|stroke|decoration|shadow|from|via|to|divide)-(bg|ink)-(highlight|accent|danger|warning|success)(\/|$)|-divider-highlight(\/|$)/
    expect(candidates().filter((c) => utility.test(c))).toEqual([])
    const reader = /var\(--(bg|ink|divider)-(highlight|accent|danger|warning|success)\)/
    expect(Object.keys(SOURCES).filter((file) => reader.test(SOURCES[file] ?? ''))).toEqual([])
  })

  // The sync status is an ink: its dot is drawn in it, as its words are.
  it('dots the sync status in its ink', () => {
    const sync = SOURCES['../components/SyncIndicator.tsx']
    expect(sync).not.toMatch(/bg-bg-sync/)
    for (const state of ['syncing', 'synced', 'offline', 'error']) {
      expect(sync).toMatch(new RegExp(`\\$\\{DOT\\} bg-ink-sync-${state}\\b`))
    }
  })

  // The delete a row uncovers is danger, its fill and its words.
  it('fills and inks a row’s delete in its own danger tokens', () => {
    const sidebar = SOURCES['../components/Sidebar.tsx']
    expect(sidebar).toMatch(/deleteActionStyle =\s+'[^']*\bbg-bg-row-delete text-ink-row-delete\b/)
    expect(candidates().filter((c) => /(^|:)text-bg-/.test(c))).toEqual([])
  })

  // A floating sheet's shadow is the canvas under it.
  it('shadows every floating sheet in --shadow-sheet, never in neutral', () => {
    const shadows = candidates().filter((c) => /(^|:)shadow-\[0_4px_16px/.test(c))
    expect(shadows.length).toBeGreaterThan(0)
    expect(shadows.filter((c) => !c.endsWith('0_4px_16px_var(--shadow-sheet)]'))).toEqual([])
    expect(candidates().filter((c) => /neutral-\d/.test(c))).toEqual([])
  })

  it('paints a sheet in --bg-sheet, the one name it has', () => {
    expect(candidates().filter((c) => /bg-(default|sidebar)(\/|\)|$)/.test(c))).toEqual([])
  })

  it('floats the chip on a picture as a secondary button at 60%, its hover stepped as any button’s', () => {
    expect(candidates().filter((c) => /bg-glass/.test(c))).toEqual([])
    const action = SOURCES['../components/ui/action.tsx']
    const glass =
      /glass:\s+'bg-bg-button-secondary-default\/60 backdrop-frost text-ink-button-secondary-default hover:bg-bg-button-secondary-hover\/60( active:bg-bg-field-pressed)?'/g
    expect(action.match(glass)).toHaveLength(2)
    expect(action).not.toMatch(/hover:bg-bg-sheet/)
  })

  // A component inks in tokens of its own, never a shared control or icon ink.
  it('names no shared control or icon ink', () => {
    const borrowers = Object.keys(SOURCES).filter((file) =>
      /ink-(control|icon)\b/.test(SOURCES[file] ?? '')
    )
    expect(borrowers).toEqual([])
  })

  it('names no ink for the glass', () => {
    const borrowers = Object.keys(SOURCES).filter((file) =>
      /ink-[\w-]*glass/.test(SOURCES[file] ?? '')
    )
    expect(borrowers).toEqual([])
  })

  // A tertiary button and the avatar have tokens of their own; neither borrows
  // a field's or a secondary button's.
  it('fills a tertiary button and the avatar in their own tokens', () => {
    const action = SOURCES['../components/ui/action.tsx']
    expect(action).toMatch(
      /tertiary:\s+'bg-transparent text-ink-button-tertiary-default hover:bg-bg-button-tertiary-hover active:bg-bg-button-tertiary-pressed'/
    )
    expect(action).toMatch(
      /tertiary:\s+'bg-transparent not-aria-pressed:hover:bg-bg-button-tertiary-hover active:bg-bg-button-tertiary-pressed /
    )
    expect(action).toMatch(
      /secondary:\s+'bg-bg-button-secondary-default text-ink-button-secondary-default hover:bg-bg-button-secondary-hover active:bg-bg-button-secondary-pressed'/
    )
    const account = SOURCES['../components/menu-identity.tsx']
    expect(account).toMatch(/avatarStyle =\s+'[^']*\bbg-bg-avatar-default\b/)
    expect(account).not.toMatch(/bg-button-secondary/)
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

  // A style nothing draws is left over from what the app no longer has. A
  // corner's sides are steps of the radius scale, kept whole.
  it('keeps no utility of its own that nothing writes', () => {
    const scanner = new Scanner({
      sources: [
        { base: RENDERER_SRC, pattern: '**/*.tsx', negated: false },
        { base: RENDERER_SRC, pattern: '**/*.ts', negated: false },
        { base: RENDERER_SRC, pattern: '**/__tests__/**', negated: true },
        // The design system page is not the app: a style only it shows is unused.
        { base: RENDERER_SRC, pattern: 'design-system/**', negated: true }
      ]
    })
    const written = new Set(
      scanner.scan().map((candidate) => candidate.slice(candidate.lastIndexOf(':') + 1))
    )
    const unwritten = [...css.matchAll(/@utility ([\w-]+?)(-\*)? \{/g)]
      .filter(([, name]) => !/^rounded-[a-z]{1,2}$/.test(name))
      .filter(([, name, functional]) =>
        functional
          ? ![...written].some((candidate) => candidate.startsWith(`${name}-`))
          : !written.has(name)
      )
      .map(([, name]) => name)

    expect(unwritten).toEqual([])
  })
})
