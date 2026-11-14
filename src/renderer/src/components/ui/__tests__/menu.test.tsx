import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Menu, MenuItem } from '../menu'

// ---------------------------------------------------------------------------
// The menu primitive: a native manual popover in the role of a menu, with the
// keyboard model (roving focus, arrows, Home/End, type-ahead, Escape, Tab) and
// the focus return written here, since the platform gives a menu none of them.
// ---------------------------------------------------------------------------

function Sample({
  onNew = vi.fn(),
  onDelete = vi.fn(),
  onArchive = vi.fn()
}: {
  onNew?: () => void
  onDelete?: () => void
  onArchive?: () => void
}) {
  return (
    <>
      <Menu trigger={<button type="button">Open</button>} side="bottom" align="start">
        <MenuItem onSelect={onNew}>New note</MenuItem>
        <MenuItem onSelect={onArchive} disabled>
          Archive
        </MenuItem>
        <MenuItem onSelect={onDelete}>Delete note</MenuItem>
        <MenuItem onSelect={vi.fn()}>Duplicate</MenuItem>
      </Menu>
      <button type="button">Elsewhere</button>
    </>
  )
}

const trigger = () => screen.getByRole('button', { name: 'Open' })
const item = (name: string) => screen.getByRole('menuitem', { name })
const menu = () => screen.queryByRole('menu')

describe('Menu', () => {
  afterEach(() => vi.restoreAllMocks())

  it('opens on the side of its trigger that has room, and comes back as soon as its own has', async () => {
    render(<Sample />)
    const at = { top: 700 }
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.textContent === 'Open' ? new DOMRect(10, at.top, 60, 28) : new DOMRect()
    })
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.getAttribute('role') === 'menu' ? 160 : 0
    })
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(function (
      this: HTMLElement
    ) {
      return this.getAttribute('role') === 'menu' ? 200 : 0
    })
    fireEvent.click(trigger(), { detail: 1 })
    const list = menu() as HTMLElement
    expect([list.dataset.placedSide, list.dataset.placedAlign]).toEqual(['top', 'start'])

    at.top = 100
    fireEvent.scroll(window)
    await new Promise((r) => requestAnimationFrame(r))
    expect([list.dataset.placedSide, list.dataset.placedAlign]).toEqual(['bottom', 'start'])
  })

  it('names its menu on the trigger and opens it as a manual popover from it', () => {
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover')
    render(<Sample />)
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(menu()).toBeNull()

    fireEvent.click(trigger(), { detail: 1 })
    const list = menu() as HTMLElement
    expect(list).not.toBeNull()
    expect(list.getAttribute('popover')).toBe('manual')
    expect(list.dataset.side).toBe('bottom')
    expect(list.dataset.align).toBe('start')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(trigger().getAttribute('aria-controls')).toBe(list.id)
    expect(trigger().hasAttribute('data-popup-open')).toBe(true)
    expect(show).toHaveBeenCalledWith({ source: trigger() })
    // Portalled to the top of the document, out of whatever clips the trigger.
    expect(list.parentElement).toBe(document.body)
  })

  it('takes the focus onto itself when a pointer opens it, onto the first row from the keyboard', () => {
    render(<Sample />)
    fireEvent.click(trigger(), { detail: 1 })
    expect(document.activeElement).toBe(menu())
    fireEvent.click(trigger(), { detail: 1 })
    expect(menu()).toBeNull()

    // Enter and Space reach a button as a click with no pointer behind it.
    fireEvent.click(trigger(), { detail: 0 })
    expect(document.activeElement).toBe(item('New note'))
  })

  it('opens from the trigger’s arrows, ArrowUp onto the last row', () => {
    render(<Sample />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(document.activeElement).toBe(item('New note'))
    fireEvent.keyDown(menu()!, { key: 'Escape' })
    fireEvent.keyDown(trigger(), { key: 'ArrowUp' })
    expect(document.activeElement).toBe(item('Duplicate'))
  })

  it('roves the focus with the arrows, wrapping, and with Home and End', () => {
    render(<Sample />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const press = (key: string) => fireEvent.keyDown(document.activeElement!, { key })

    // A disabled row is passed over.
    press('ArrowDown')
    expect(document.activeElement).toBe(item('Delete note'))
    press('ArrowUp')
    expect(document.activeElement).toBe(item('New note'))
    press('ArrowDown')
    press('ArrowDown')
    expect(document.activeElement).toBe(item('Duplicate'))
    press('ArrowDown')
    expect(document.activeElement).toBe(item('New note'))
    press('ArrowUp')
    expect(document.activeElement).toBe(item('Duplicate'))
    press('Home')
    expect(document.activeElement).toBe(item('New note'))
    press('End')
    expect(document.activeElement).toBe(item('Duplicate'))
    // Only the focused row is in the tab order.
    expect(item('Duplicate').tabIndex).toBe(-1)
  })

  it('jumps to the row a typed prefix starts, cycling through rows on the same letter', () => {
    vi.useFakeTimers()
    try {
      render(<Sample />)
      fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
      const type = (key: string) => fireEvent.keyDown(document.activeElement!, { key })

      type('d')
      expect(document.activeElement).toBe(item('Delete note'))
      type('u')
      expect(document.activeElement).toBe(item('Duplicate'))

      act(() => void vi.advanceTimersByTime(1000))
      type('d')
      expect(document.activeElement).toBe(item('Delete note'))
      act(() => void vi.advanceTimersByTime(1000))
      type('D')
      expect(document.activeElement).toBe(item('Duplicate'))

      // Nothing but a disabled row starts with it: the focus stays put.
      act(() => void vi.advanceTimersByTime(1000))
      type('a')
      expect(document.activeElement).toBe(item('Duplicate'))
    } finally {
      vi.useRealTimers()
    }
  })

  it('runs a row on a click, Enter or Space, closing first so the row may move the focus', () => {
    const onNew = vi.fn(() => screen.getByRole('button', { name: 'Elsewhere' }).focus())
    const onDelete = vi.fn()
    render(<Sample onNew={onNew} onDelete={onDelete} />)

    fireEvent.click(trigger(), { detail: 1 })
    fireEvent.click(item('New note'))
    expect(onNew).toHaveBeenCalledTimes(1)
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Elsewhere' }))

    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(item('New note'), { key: 'End' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onDelete).toHaveBeenCalledTimes(1)
    expect(menu()).toBeNull()
    // Nothing else took the focus, so it is back on the trigger.
    expect(document.activeElement).toBe(trigger())

    fireEvent.keyDown(trigger(), { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' })
    fireEvent.keyDown(document.activeElement!, { key: ' ' })
    expect(onDelete).toHaveBeenCalledTimes(2)
  })

  it('refuses to run a disabled row, and stays open', () => {
    const onArchive = vi.fn()
    render(<Sample onArchive={onArchive} />)
    fireEvent.click(trigger(), { detail: 1 })
    expect(item('Archive').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(item('Archive'))
    fireEvent.keyDown(item('Archive'), { key: 'Enter' })
    expect(onArchive).not.toHaveBeenCalled()
    expect(menu()).not.toBeNull()
  })

  it('closes on Escape back onto the trigger', () => {
    render(<Sample />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(menu()).toBeNull()
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on Tab from the trigger, so the Tab itself moves on from there', () => {
    render(<Sample />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    const tab = fireEvent.keyDown(document.activeElement!, { key: 'Tab' })
    expect(tab).toBe(true) // not cancelled: the browser's own Tab follows
    expect(menu()).toBeNull()
    expect(document.activeElement).toBe(trigger())
  })

  it('closes on a press outside without pulling the focus back to the trigger', () => {
    render(<Sample />)
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    fireEvent.pointerDown(document.body)
    expect(menu()).toBeNull()
    expect(document.activeElement).not.toBe(trigger())
  })

  it('stays open through a press inside, and a press on the trigger toggles it shut', () => {
    render(<Sample />)
    fireEvent.click(trigger(), { detail: 1 })
    fireEvent.pointerDown(item('New note'))
    expect(menu()).not.toBeNull()
    fireEvent.pointerDown(trigger())
    expect(menu()).not.toBeNull()
    fireEvent.click(trigger(), { detail: 1 })
    expect(menu()).toBeNull()
  })

  it('marks the highlighted row, by key or pointer, whether or not the window has the keys', () => {
    render(<Sample />)
    const lit = () =>
      screen.getAllByRole('menuitem').filter((row) => row.hasAttribute('data-highlighted'))
    fireEvent.keyDown(trigger(), { key: 'ArrowDown' })
    expect(lit()).toEqual([item('New note')])
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    expect(lit()).toEqual([item('Delete note')])
    // The window losing the keys leaves the row lit, as the focus stays on it.
    fireEvent.blur(window)
    expect(lit()).toEqual([item('Delete note')])
    fireEvent.pointerMove(item('Duplicate'), { pointerType: 'mouse' })
    expect(lit()).toEqual([item('Duplicate')])
    fireEvent.pointerMove(item('Archive'), { pointerType: 'mouse' })
    expect(lit()).toEqual([])
    fireEvent.pointerMove(item('Duplicate'), { pointerType: 'mouse' })
    fireEvent.pointerLeave(item('Duplicate'), { pointerType: 'mouse' })
    expect(lit()).toEqual([])
    fireEvent.keyDown(menu()!, { key: 'End' })
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    // Shut, it lights nothing for the next open.
    fireEvent.click(trigger(), { detail: 1 })
    expect(lit()).toEqual([])
  })

  it('takes the focus to a row a pointer moves over, but not to a disabled one', () => {
    render(<Sample />)
    fireEvent.click(trigger(), { detail: 1 })
    fireEvent.pointerMove(item('Delete note'), { pointerType: 'mouse' })
    expect(document.activeElement).toBe(item('Delete note'))
    fireEvent.pointerMove(item('Archive'), { pointerType: 'mouse' })
    expect(document.activeElement).toBe(menu())
    fireEvent.pointerMove(item('Delete note'), { pointerType: 'mouse' })
    fireEvent.pointerLeave(item('Delete note'), { pointerType: 'mouse' })
    expect(document.activeElement).toBe(menu())
  })

  it('opens and closes from its owner when controlled, onto the first row', () => {
    function Controlled() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button type="button" onClick={() => setOpen((o) => !o)}>
            Shortcut
          </button>
          <Menu open={open} onOpenChange={setOpen} trigger={<button type="button">Open</button>}>
            <MenuItem onSelect={vi.fn()}>New note</MenuItem>
          </Menu>
        </>
      )
    }
    render(<Controlled />)
    fireEvent.click(screen.getByRole('button', { name: 'Shortcut' }))
    expect(menu()).not.toBeNull()
    expect(document.activeElement).toBe(item('New note'))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(menu()).toBeNull()
  })
})
