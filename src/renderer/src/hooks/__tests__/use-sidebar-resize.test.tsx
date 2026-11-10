import { useRef } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSidebarResize } from '../use-sidebar-resize'
import { SIDEBAR_MAX_WIDTH, SIDEBAR_MIN_WIDTH } from '@/utils/sidebar-width'

// ---------------------------------------------------------------------------
// The rail's divider is a handle: dragged, it widens the rail by as far as the
// pointer went, within the floor and the cap, and the width it is let go at is
// remembered. The live width is the `--size-sidebar` property on the shell.
// ---------------------------------------------------------------------------

function Shell() {
  const shellRef = useRef<HTMLDivElement>(null)
  const { width, resizing, shellStyle, handleProps } = useSidebarResize(shellRef)
  return (
    <div ref={shellRef} data-testid="shell" data-resizing={resizing} style={shellStyle}>
      <div {...handleProps} />
      <output>{width}</output>
    </div>
  )
}

const shellWidth = () => screen.getByTestId('shell').style.getPropertyValue('--size-sidebar')
const handle = () => screen.getByRole('separator', { name: 'Resize sidebar' })

function drag(from: number, to: number, { release = true } = {}) {
  fireEvent.pointerDown(handle(), { clientX: from, pointerId: 1, button: 0 })
  fireEvent.pointerMove(handle(), { clientX: to, pointerId: 1 })
  if (release) fireEvent.pointerUp(handle(), { clientX: to, pointerId: 1 })
}

beforeEach(() => {
  Object.defineProperty(window, 'innerWidth', { value: 1600, configurable: true })
})

describe('useSidebarResize', () => {
  it('starts at the floor, as a vertical separator', () => {
    render(<Shell />)
    expect(shellWidth()).toBe(`${SIDEBAR_MIN_WIDTH}px`)
    expect(handle().getAttribute('aria-orientation')).toBe('vertical')
    expect(handle().getAttribute('aria-valuemin')).toBe(String(SIDEBAR_MIN_WIDTH))
    expect(handle().getAttribute('aria-valuenow')).toBe(String(SIDEBAR_MIN_WIDTH))
  })

  it('follows the pointer while held, and remembers where it is let go', () => {
    render(<Shell />)
    drag(256, 336, { release: false })
    expect(shellWidth()).toBe('336px')
    expect(screen.getByTestId('shell').dataset.resizing).toBe('true')

    fireEvent.pointerUp(handle(), { clientX: 336, pointerId: 1 })
    expect(screen.getByRole('status').textContent).toBe('336')
    expect(screen.getByTestId('shell').dataset.resizing).toBe('false')
    expect(localStorage.getItem('sidebarWidth')).toBe('336')
  })

  it('goes no narrower than the floor and no wider than the cap', () => {
    render(<Shell />)
    drag(256, 100)
    expect(shellWidth()).toBe(`${SIDEBAR_MIN_WIDTH}px`)
    drag(256, 2000)
    expect(shellWidth()).toBe(`${SIDEBAR_MAX_WIDTH}px`)
  })

  it('opens at the width it was last left at', () => {
    localStorage.setItem('sidebarWidth', '300')
    render(<Shell />)
    expect(shellWidth()).toBe('300px')
  })

  it('narrows a remembered width to fit a smaller window', () => {
    localStorage.setItem('sidebarWidth', String(SIDEBAR_MAX_WIDTH))
    render(<Shell />)
    act(() => {
      Object.defineProperty(window, 'innerWidth', { value: 720, configurable: true })
      window.dispatchEvent(new Event('resize'))
    })
    expect(parseInt(shellWidth())).toBeLessThan(SIDEBAR_MAX_WIDTH)
  })

  it('puts the rail back to its floor on a double click', () => {
    localStorage.setItem('sidebarWidth', '400')
    render(<Shell />)
    fireEvent.doubleClick(handle())
    expect(shellWidth()).toBe(`${SIDEBAR_MIN_WIDTH}px`)
    expect(localStorage.getItem('sidebarWidth')).toBe(String(SIDEBAR_MIN_WIDTH))
  })

  it('resizes from the keyboard', () => {
    render(<Shell />)
    fireEvent.keyDown(handle(), { key: 'ArrowRight' })
    expect(shellWidth()).toBe(`${SIDEBAR_MIN_WIDTH + 16}px`)
    fireEvent.keyDown(handle(), { key: 'End' })
    expect(shellWidth()).toBe(`${SIDEBAR_MAX_WIDTH}px`)
    fireEvent.keyDown(handle(), { key: 'Home' })
    expect(shellWidth()).toBe(`${SIDEBAR_MIN_WIDTH}px`)
  })

  it('suspends text selection for the length of a drag', () => {
    render(<Shell />)
    drag(256, 300, { release: false })
    expect(document.documentElement.hasAttribute('data-sidebar-resizing')).toBe(true)
    expect(document.documentElement.hasAttribute('data-control-dragging')).toBe(true)
    fireEvent.pointerUp(handle(), { clientX: 300, pointerId: 1 })
    expect(document.documentElement.hasAttribute('data-sidebar-resizing')).toBe(false)
    expect(document.documentElement.hasAttribute('data-control-dragging')).toBe(false)
  })
})
