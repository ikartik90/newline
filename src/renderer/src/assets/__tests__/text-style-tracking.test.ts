import { describe, expect, it } from 'vitest'
import css from '../main.css?raw'

// Every text style is set as the typeface is drawn, with no letter spacing.

describe('text style letter spacing', () => {
  it('declares none anywhere in the stylesheet', () => {
    expect(css.match(/letter-spacing:\s*[^;]+;/g) ?? []).toEqual([])
  })
})
