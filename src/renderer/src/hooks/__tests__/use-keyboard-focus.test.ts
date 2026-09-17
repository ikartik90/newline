import { act, cleanup, fireEvent, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useKeyboardFocus } from '../use-keyboard-focus'

describe('useKeyboardFocus', () => {
  afterEach(() => {
    // RTL only auto-unmounts when `afterEach` is a global, which it is not
    // here — and a hook left mounted keeps its window listeners.
    cleanup()
    document.documentElement.removeAttribute('data-keyboard-focus')
  })

  it('sets data-keyboard-focus on Tab and removes it on pointer down', () => {
    renderHook(() => useKeyboardFocus())

    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)

    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' })
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(true)

    act(() => {
      fireEvent.mouseDown(window)
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)
  })

  it('clears the ring on a pointer press as well as a mouse one', () => {
    renderHook(() => useKeyboardFocus())

    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' })
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(true)

    act(() => {
      fireEvent.pointerDown(window)
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)
  })

  it('does not set data-keyboard-focus for non-Tab keys', () => {
    renderHook(() => useKeyboardFocus())

    act(() => {
      fireEvent.keyDown(window, { key: 'Enter' })
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)
  })

  it('stops listening once unmounted', () => {
    const { unmount } = renderHook(() => useKeyboardFocus())
    unmount()

    act(() => {
      fireEvent.keyDown(window, { key: 'Tab' })
    })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)
  })
})
