import { describe, expect, it, vi, afterEach } from 'vitest'
import { formatRelativeTime, noteDisplayTitle } from '../note-display'

describe('noteDisplayTitle', () => {
  it('is the title when there is one', () => {
    expect(noteDisplayTitle({ title: '  Groceries ', plainText: 'milk' })).toBe('Groceries')
  })

  it('falls back to the first non-empty line of the text', () => {
    expect(noteDisplayTitle({ title: '', plainText: '\n\n  milk and eggs\nbread' })).toBe(
      'milk and eggs'
    )
  })

  it('cuts a long first line to forty characters', () => {
    const line = 'a'.repeat(60)
    expect(noteDisplayTitle({ title: '', plainText: line })).toBe('a'.repeat(40))
  })

  it('is Untitled with neither', () => {
    expect(noteDisplayTitle({ title: ' ', plainText: '' })).toBe('Untitled')
  })
})

describe('formatRelativeTime', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('names the distance in the largest unit that fits', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'))
    const now = Date.now()
    expect(formatRelativeTime(now - 10_000)).toBe('just now')
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5m ago')
    expect(formatRelativeTime(now - 3 * 3_600_000)).toBe('3h ago')
    expect(formatRelativeTime(now - 2 * 86_400_000)).toBe('2d ago')
  })

  it('gives the date past a month', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-23T12:00:00Z'))
    const then = Date.now() - 40 * 86_400_000
    expect(formatRelativeTime(then)).toBe(new Date(then).toLocaleDateString())
  })
})
