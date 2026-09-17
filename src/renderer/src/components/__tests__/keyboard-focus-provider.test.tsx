import { fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KeyboardFocusProvider } from '../keyboard-focus-provider'

describe('KeyboardFocusProvider', () => {
  afterEach(() => document.documentElement.removeAttribute('data-keyboard-focus'))

  it('renders nothing', () => {
    const { container } = render(<KeyboardFocusProvider />)
    expect(container.childElementCount).toBe(0)
  })

  it('marks the document after a Tab press and clears it on pointer use', () => {
    render(<KeyboardFocusProvider />)
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)

    fireEvent.keyDown(window, { key: 'Tab' })
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(true)

    fireEvent.pointerDown(window)
    expect(document.documentElement.hasAttribute('data-keyboard-focus')).toBe(false)
  })
})
