import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useTheme } from '../useTheme'

// ---------------------------------------------------------------------------
// The theme in force is what the toggle offers the opposite of, so it has to
// be live: following the OS while the choice is "system", and the explicit
// choice once one is made.
// ---------------------------------------------------------------------------

type Listener = (event: { matches: boolean }) => void

let systemDark = false
const listeners = new Set<Listener>()
const originalMatchMedia = window.matchMedia

beforeEach(() => {
  systemDark = false
  listeners.clear()
  window.matchMedia = (query: string) =>
    ({
      get matches() {
        return systemDark
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => listeners.add(listener),
      removeEventListener: (_type: string, listener: Listener) => listeners.delete(listener),
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false
    }) as unknown as MediaQueryList
})

afterEach(() => {
  window.matchMedia = originalMatchMedia
  document.documentElement.classList.remove('dark')
})

function switchSystemTo(dark: boolean) {
  systemDark = dark
  for (const listener of listeners) listener({ matches: dark })
}

describe('useTheme', () => {
  it('starts on the system theme and follows it as it changes', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('system')
    expect(result.current.effectiveTheme).toBe('light')

    act(() => switchSystemTo(true))
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    act(() => switchSystemTo(false))
    expect(result.current.effectiveTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('keeps an explicit choice over the system, and remembers it', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.setTheme('light'))
    act(() => switchSystemTo(true))
    expect(result.current.effectiveTheme).toBe('light')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    expect(localStorage.getItem('theme')).toBe('light')

    act(() => result.current.setTheme('dark'))
    expect(result.current.effectiveTheme).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })
})
