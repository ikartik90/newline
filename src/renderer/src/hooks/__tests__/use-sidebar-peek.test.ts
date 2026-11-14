import { act, renderHook } from '@testing-library/react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { describe, expect, it } from 'vitest'
import { useSidebarPeek } from '../use-sidebar-peek'

const WIDTH = 256

const enter = (pointerType = 'mouse') => ({ pointerType }) as ReactPointerEvent

function move(clientX: number, target: Element = document.body) {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX })
  Object.defineProperty(event, 'pointerType', { value: 'mouse' })
  act(() => {
    target.dispatchEvent(event)
  })
}

function setup(collapsed = true) {
  return renderHook((props: { collapsed: boolean }) => useSidebarPeek({ ...props, width: WIDTH }), {
    initialProps: { collapsed }
  })
}

describe('useSidebarPeek', () => {
  it('brings a collapsed sidebar up while the pointer is on the toggle', () => {
    const { result } = setup()
    expect(result.current.peeking).toBe(false)
    act(() => result.current.onToggleEnter(enter()))
    expect(result.current.peeking).toBe(true)
  })

  it('leaves an open sidebar alone, and a finger never peeks', () => {
    const open = setup(false)
    act(() => open.result.current.onToggleEnter(enter()))
    expect(open.result.current.peeking).toBe(false)

    const touched = setup()
    act(() => touched.result.current.onToggleEnter(enter('touch')))
    expect(touched.result.current.peeking).toBe(false)
  })

  it('keeps it up while the pointer is over its width, and lets it go past it', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    move(WIDTH)
    expect(result.current.peeking).toBe(true)
    move(WIDTH + 1)
    expect(result.current.peeking).toBe(false)
  })

  it('keeps it up while the pointer is on a menu or dialog opened from it', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    const menu = document.createElement('div')
    menu.setAttribute('role', 'menu')
    const item = menu.appendChild(document.createElement('div'))
    document.body.appendChild(menu)
    move(WIDTH + 40, item)
    expect(result.current.peeking).toBe(true)
    menu.remove()
  })

  const leavePage = (clientX: number, clientY: number) =>
    act(() => {
      document.documentElement.dispatchEvent(
        new MouseEvent('mouseleave', { relatedTarget: null, clientX, clientY })
      )
    })

  it('lets it go when the pointer leaves the window', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    leavePage(-1, 300)
    expect(result.current.peeking).toBe(false)
  })

  // The top bar is the window's drag handle, which the page never sees the
  // pointer on: it reads as leaving the page, though the pointer is still in
  // the window — crossing it from the toggle down to the notes, say.
  it('keeps it up while the pointer crosses the top bar over it', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    leavePage(100, 40)
    expect(result.current.peeking).toBe(true)
  })

  it('lets it go when the pointer crosses the top bar past it', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    leavePage(WIDTH + 1, 40)
    expect(result.current.peeking).toBe(false)
  })

  // The bar over a peek is the page's as wide as the sidebar, so the pointer
  // goes off the page at the first pixel past it.
  it('lets it go when the pointer reaches the top bar at its edge', () => {
    const { result } = setup()
    act(() => result.current.onToggleEnter(enter()))
    leavePage(WIDTH, 20)
    expect(result.current.peeking).toBe(false)
  })

  it('ends the peek once the sidebar is pinned open, and needs a fresh reach after a collapse', () => {
    const { result, rerender } = setup()
    act(() => result.current.onToggleEnter(enter()))
    rerender({ collapsed: false })
    expect(result.current.peeking).toBe(false)
    rerender({ collapsed: true })
    expect(result.current.peeking).toBe(false)
  })

  // The click that brings an inactive window forward also has the pointer
  // enter the toggle again, reaching the handler from before the pin.
  it('never peeks at a pinned sidebar, even from a reach that began before the pin', () => {
    const { result, rerender } = setup()
    const reachBeforePin = result.current.onToggleEnter
    act(() => reachBeforePin(enter()))
    rerender({ collapsed: false })
    act(() => reachBeforePin(enter()))
    expect(result.current.peeking).toBe(false)
  })
})
