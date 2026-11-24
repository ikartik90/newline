import { describe, it, expect } from 'vitest'
import { nextSidenoteId, sidenoteAnchorName } from '@/utils/sidenotes'

describe('sidenoteAnchorName', () => {
  it('prefixes with --sn- and strips ident-unsafe chars', () => {
    expect(sidenoteAnchorName('abc')).toBe('--sn-abc')
    expect(sidenoteAnchorName('a b.c/d')).toBe('--sn-abcd')
  })
})

describe('nextSidenoteId', () => {
  it('is one past the highest number the ids hold', () => {
    expect(nextSidenoteId([])).toBe('sn-1')
    expect(nextSidenoteId(['sn-1', 'sn-4', 'sn-2'])).toBe('sn-5')
    expect(nextSidenoteId(new Set(['sn-9', 'sn-10']))).toBe('sn-11')
  })

  it('counts only the ids numbered as it numbers them', () => {
    expect(nextSidenoteId(['0b3bea69-6e0a', 'sn-x', 'note-7'])).toBe('sn-1')
  })
})
