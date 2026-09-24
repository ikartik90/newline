import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SearchField } from '../search-field'
import { HAS_CURSOR_QUERY } from '@/hooks/use-has-cursor'

// ---------------------------------------------------------------------------
// The field in the top bar is the command menu's door, drawn as the field it
// opens onto, with the ⌘K chip sitting concentric inside it.
// ---------------------------------------------------------------------------

let hasCursor = true
const originalMatchMedia = window.matchMedia

/** Claim the field the shortcut's platform detection reads first. */
function stubPlatform(platform: string) {
  Object.defineProperty(navigator, 'userAgentData', { value: { platform }, configurable: true })
}

beforeEach(() => {
  hasCursor = true
  stubPlatform('macOS')
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === HAS_CURSOR_QUERY ? hasCursor : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
})

afterEach(() => {
  delete (navigator as { userAgentData?: unknown }).userAgentData
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia
  })
})

const field = () => screen.getByRole('button', { name: 'Search notes' })

describe('SearchField', () => {
  it('opens the search when pressed', () => {
    const onOpen = vi.fn()
    render(<SearchField onOpen={onOpen} />)
    fireEvent.click(field())
    expect(onOpen).toHaveBeenCalledTimes(1)
  })

  it('names the key that opens it, for the keyboard in use', () => {
    render(<SearchField onOpen={vi.fn()} />)
    expect(field().querySelector('kbd')!.textContent).toBe('⌘K')
    expect(field().getAttribute('title')).toBe('Search notes (⌘K)')
  })

  it('sets the ⌘K chip concentric within the field', () => {
    render(<SearchField onOpen={vi.fn()} />)
    const classes = field().className.split(/\s+/)
    // The field's inset and corner come from one pair of tokens: the corner is
    // the chip's own (rounded-sm) plus the inset the chip sits at.
    expect(classes).toContain('px-(--size-search-field-inset)')
    expect(classes).toContain('rounded-(--size-search-field-radius)')
    expect(field().querySelector('kbd')!.className.split(/\s+/)).toContain('rounded-sm')
  })

  it('draws the glyph in the bar’s icon ink and size, leaving only the placeholder faint', () => {
    render(<SearchField onOpen={vi.fn()} />)
    const glyph = field().querySelector('svg')!.getAttribute('class')!.split(/\s+/)
    expect(glyph).toContain('text-fg-body')
    expect(glyph).toContain('size-5')
    expect(field().className.split(/\s+/)).toContain('text-field-fg-placeholder')
  })

  it('draws no chip on a device without a key', () => {
    hasCursor = false
    render(<SearchField onOpen={vi.fn()} />)
    expect(field().querySelector('kbd')).toBeNull()
  })

  it('takes a width from its caller', () => {
    render(<SearchField onOpen={vi.fn()} className="w-60" />)
    expect(field().className.split(/\s+/)).toContain('w-60')
  })
})
