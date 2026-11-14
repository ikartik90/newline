import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createWindowGlass } from '../window-glass'

describe('createWindowGlass', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('lays the glass at once for the first thing to stand on it', () => {
    const lay = vi.fn()
    const glass = createWindowGlass(lay, 250)
    glass.hold('palette', true)
    expect(lay).toHaveBeenCalledExactlyOnceWith(true)
  })

  // The page fades its note back in over the glass first, or the clear window
  // shows through meanwhile.
  it('lifts it only once the page has had time to fade back in', () => {
    const lay = vi.fn()
    const glass = createWindowGlass(lay, 250)
    glass.hold('page', true)
    glass.hold('page', false)
    expect(lay).not.toHaveBeenCalledWith(false)
    vi.advanceTimersByTime(250)
    expect(lay).toHaveBeenLastCalledWith(false)
  })

  // The palette's Delete closes the palette and opens the confirm on the glass.
  it('keeps it when something else stands on it before the lift', () => {
    const lay = vi.fn()
    const glass = createWindowGlass(lay, 250)
    glass.hold('palette', true)
    glass.hold('palette', false)
    vi.advanceTimersByTime(100)
    glass.hold('page', true)
    vi.advanceTimersByTime(1000)
    expect(lay).not.toHaveBeenCalledWith(false)
  })

  it('stays while anything still stands on it', () => {
    const lay = vi.fn()
    const glass = createWindowGlass(lay, 250)
    glass.hold('palette', true)
    glass.hold('page', true)
    glass.hold('palette', false)
    vi.advanceTimersByTime(1000)
    expect(lay).not.toHaveBeenCalledWith(false)
    glass.hold('page', false)
    vi.advanceTimersByTime(250)
    expect(lay).toHaveBeenLastCalledWith(false)
  })
})
