import { renderHook, act } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { HAS_CURSOR_QUERY, useHasCursor } from '../use-has-cursor'

// ---------------------------------------------------------------------------
// matchMedia stub — jsdom has none, and `test-setup.ts` installs a default as a
// writable but NON-configurable property, so it is swapped by assignment and
// handed back the same way. Hands back the listener it was given so a test can
// play a device change (a trackpad plugged into a tablet) through it.
// ---------------------------------------------------------------------------

type Listener = (event: { matches: boolean }) => void

const original = window.matchMedia

function stubMatchMedia(matches: boolean) {
  const listeners: Listener[] = []
  const queries: string[] = []
  window.matchMedia = vi.fn((query: string) => {
    queries.push(query)
    return {
      matches,
      addEventListener: (_: string, fn: Listener) => listeners.push(fn),
      removeEventListener: (_: string, fn: Listener) => {
        const i = listeners.indexOf(fn)
        if (i >= 0) listeners.splice(i, 1)
      }
    } as unknown as MediaQueryList
  })
  return { listeners, queries }
}

afterEach(() => {
  window.matchMedia = original
})

describe('useHasCursor', () => {
  // The first render cannot know what hardware is underneath, so it renders
  // the touch answer and corrects itself a commit later. Starting from the
  // cursor answer instead would put a keyboard hint on screen that a touch
  // device then has to take back — and would autofocus a field on a device
  // whose keyboard covers half the screen.
  it('starts from the touch answer, before it has asked', () => {
    stubMatchMedia(true)
    const seen: boolean[] = []
    renderHook(() => {
      const value = useHasCursor()
      seen.push(value)
      return value
    })
    expect(seen[0]).toBe(false)
  })

  it('asks the one query the stylesheet asks', () => {
    const { queries } = stubMatchMedia(true)
    renderHook(() => useHasCursor())
    expect(queries).toContain(HAS_CURSOR_QUERY)
  })

  it('reports a cursor when the device has one', () => {
    stubMatchMedia(true)
    const { result } = renderHook(() => useHasCursor())
    expect(result.current).toBe(true)
  })

  it('reports none on a touch device', () => {
    stubMatchMedia(false)
    const { result } = renderHook(() => useHasCursor())
    expect(result.current).toBe(false)
  })

  // A tablet with a keyboard case attached mid-session is the same device
  // answering differently, and the answer is live rather than read once.
  it('follows the device changing its answer', () => {
    const { listeners } = stubMatchMedia(false)
    const { result } = renderHook(() => useHasCursor())
    expect(result.current).toBe(false)

    act(() => listeners.forEach((fn) => fn({ matches: true })))

    expect(result.current).toBe(true)
  })

  it('stops listening once unmounted', () => {
    const { listeners } = stubMatchMedia(true)
    const { unmount } = renderHook(() => useHasCursor())
    unmount()
    expect(listeners).toHaveLength(0)
  })

  it('survives a browser with no matchMedia at all', () => {
    window.matchMedia = undefined as unknown as typeof window.matchMedia
    const { result } = renderHook(() => useHasCursor())
    expect(result.current).toBe(false)
  })
})
