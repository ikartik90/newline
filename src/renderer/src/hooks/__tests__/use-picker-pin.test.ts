import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePickerPin } from '../use-picker-pin'

/** An element that reports a rect, which jsdom otherwise says is all zeros. */
function triggerAt(top: number) {
  const el = document.createElement('button')
  el.getBoundingClientRect = () =>
    ({ top, bottom: top + 28, left: 0, right: 28, width: 28, height: 28 }) as DOMRect
  return el
}

/** A picker of a stated height — jsdom lays nothing out. */
function pickerOfHeight(height: number) {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetHeight', { value: height, configurable: true })
  return el
}

describe('usePickerPin', () => {
  it('starts unpinned', () => {
    const { result } = renderHook(() => usePickerPin())
    expect(result.current.top).toBeUndefined()
  })

  it("reads the trigger's position once and holds it", () => {
    const { result } = renderHook(() => usePickerPin())
    const trigger = triggerAt(300)

    act(() => result.current.pin(trigger))
    expect(result.current.top).toBe(300)

    // The trigger moves (the rail scrolled) — the pin does not follow.
    trigger.getBoundingClientRect = () => ({ top: 120 }) as DOMRect
    expect(result.current.top).toBe(300)
  })

  it('forgets the position on unpin', () => {
    const { result } = renderHook(() => usePickerPin())
    act(() => result.current.pin(triggerAt(300)))
    act(() => result.current.unpin())
    expect(result.current.top).toBeUndefined()
  })

  // A trigger near the foot of the screen would open a picker that runs off
  // the bottom; once the picker is laid out it is lifted to fit, 12px clear.
  it('lifts a picker that would run past the foot of the viewport', () => {
    const { result } = renderHook(() => usePickerPin())
    // jsdom's viewport is 768 tall.
    act(() => result.current.pin(triggerAt(700)))
    act(() => result.current.ref(pickerOfHeight(200)))

    expect(result.current.top).toBe(768 - 200 - 12)
  })

  it('pins a picker taller than the viewport to the top rather than off it', () => {
    const { result } = renderHook(() => usePickerPin())
    act(() => result.current.pin(triggerAt(300)))
    act(() => result.current.ref(pickerOfHeight(2000)))

    expect(result.current.top).toBe(12)
  })

  it('re-clamps against the position that was READ on resize, never its own correction', () => {
    const { result } = renderHook(() => usePickerPin())
    act(() => result.current.pin(triggerAt(700)))
    act(() => result.current.ref(pickerOfHeight(200)))
    expect(result.current.top).toBe(556)

    // The viewport grows: the picker fits at its read position again.
    Object.defineProperty(window, 'innerHeight', { value: 1200, configurable: true })
    act(() => {
      window.dispatchEvent(new Event('resize'))
    })
    expect(result.current.top).toBe(700)
    Object.defineProperty(window, 'innerHeight', { value: 768, configurable: true })
  })
})
