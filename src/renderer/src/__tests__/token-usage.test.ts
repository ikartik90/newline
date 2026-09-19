import { Scanner } from '@tailwindcss/oxide'
import { describe, expect, it } from 'vitest'

// ---------------------------------------------------------------------------
// Two token spellings compile happily and paint the wrong thing, so only a
// check like this catches them.
//
// 1. `@theme inline` names the field frame `--color-field-border`, so the
//    frame utilities are the ones ending in `-border` / `-border-active`. The
//    shorter spellings that stop at the field's own name are not rejected —
//    they resolve to `--color-field`, the field's FILL, and compile to
//    `border-color: var(--field-bg)`. The frame then draws at the fill's alpha
//    (light 15% where 25% was meant, dark 25% where 50% was), and the active
//    one is worse: it paints the opaque rosemilk/rust fill over a background
//    already using it, so a focused field loses its edge.
//
//    The spellings are deliberately NOT written out anywhere in this file:
//    the scanner reads comments too, and naming them here would make Tailwind
//    emit the very rules this guards against.
//
// 2. Because that theme block is `inline`, Tailwind substitutes the value and
//    no utility ever reads `--color-field`. A surface that reassigns
//    `--color-field` to get the on-surface fill reassigns nothing; the variable
//    the utilities actually read is `--field-bg`.
//
// Same convention as option-list-classes: the renderer's tsconfig has no Node
// types, so the path comes from this file's own URL and the scanner does the
// file reading.
// ---------------------------------------------------------------------------

const HERE = decodeURIComponent(new URL(import.meta.url).pathname)
const RENDERER_SRC = HERE.slice(0, HERE.indexOf('/__tests__/'))

let scanned: string[] | null = null
function candidates(): string[] {
  if (!scanned) {
    const scanner = new Scanner({
      sources: [
        { base: RENDERER_SRC, pattern: '**/*.tsx', negated: false },
        { base: RENDERER_SRC, pattern: '**/*.ts', negated: false },
        // Tests included would match on the trap spellings written out in
        // this file's own comment.
        { base: RENDERER_SRC, pattern: '**/__tests__/**', negated: true }
      ]
    })
    scanned = scanner.scan()
  }
  return scanned
}

describe('token usage', () => {
  it('draws every border from a frame token, never a fill token', () => {
    // Matches the short forms, with or without a side, and their active
    // variants — but not the `-border` ones. Spelled as a pattern, never as a
    // literal, so the scanner cannot emit what this forbids.
    const trap = /(^|:)border(-[btlrxy])?-field(?!-border)(-active)?$/

    expect(candidates().filter((c) => trap.test(c))).toEqual([])
  })

  it('overrides the field fill through the variable the utilities read', () => {
    expect(candidates().filter((c) => c.includes('--color-field:'))).toEqual([])
  })
})
