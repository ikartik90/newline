import { act } from '@testing-library/react'
import { vi } from 'vitest'

// ---------------------------------------------------------------------------
// Test helpers shared across suites — the sort of scaffolding that is not
// itself a test and so has no `__tests__` folder to live in.
// ---------------------------------------------------------------------------

export interface InViewControl {
  /** Report how much of the observed element is on screen, 0 to 1. */
  (ratio?: number): void
  /** Scrolled well past — under the fraction the gate stays open for. */
  away: () => void
}

/**
 * Stands an IntersectionObserver up in jsdom and hands back the scroll.
 *
 * jsdom ships no observer at all, so this is both the stub and the steering
 * wheel: `useInView` is a gate with hysteresis, and the cases that matter are
 * about crossing its two lines in each direction. Without the stub nothing
 * observes anything — which is exactly the state every case NOT about being on
 * screen wants, so remember `vi.unstubAllGlobals()` between tests.
 */
export function scrollIntoView(): InViewControl {
  let callback: IntersectionObserverCallback | null = null
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb
      }
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
  )

  const emit = (ratio = 1) =>
    act(() => {
      callback?.(
        [
          {
            intersectionRatio: ratio,
            isIntersecting: ratio > 0,
            // A 300px block in an 800px viewport: comfortably shorter than the
            // window, so the threshold is never capped and the ratio below is
            // taken at face value.
            boundingClientRect: { height: 300 } as DOMRectReadOnly,
            rootBounds: { height: 800 } as DOMRectReadOnly
          } as IntersectionObserverEntry
        ],
        {} as IntersectionObserver
      )
    })

  emit.away = () => emit(0.1)
  return emit
}

/**
 * Stands in the bridge of a window that AppKit glasses over (macOS 27 and
 * later), where a dialog stands on the window's own glass. Hands back the
 * `setGlass` spy and a restore for the bridge as it was.
 */
export function onWindowGlass() {
  const setGlass = vi.fn()
  const saved = window.api
  window.api = { ...saved, window: { ...saved.window, setGlass } }
  return { setGlass, restore: () => (window.api = saved) }
}
