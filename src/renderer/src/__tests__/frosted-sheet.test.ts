import { describe, expect, it } from 'vitest'
import { buildMainCss } from './support/tailwind-build'

// The glass's stand-in where AppKit's is absent: the sheet, translucent over a
// blur of the page behind it, and solid where nothing can blur.
describe('frosted-sheet', () => {
  it('lets the sheet through at part strength over a blur of what is behind it', async () => {
    // Nested @supports and all: Tailwind guards color-mix with one of its own.
    const rule = await buildMainCss(['frosted-sheet'])
    expect(rule).toMatch(
      /background-color: color-mix\(in srgb, var\(--bg-sheet\) \d+%, transparent\);/
    )
    expect(rule).toMatch(/-webkit-backdrop-filter: blur\(\d+px\)/)
    expect(rule).toMatch(/[^-]backdrop-filter: blur\(\d+px\)/)
  })

  it('is the solid sheet where the backdrop cannot be blurred', async () => {
    const built = await buildMainCss(['frosted-sheet'])
    expect(built).toMatch(
      /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*background-color: var\(--bg-sheet\);/
    )
  })
})
