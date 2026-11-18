import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlassMenu } from '../glass-menu'

// ---------------------------------------------------------------------------
// The trigger of a menu on AppKit's glass: it asks main for the menu's own
// window, stood on the trigger, and hears back what was picked.
// ---------------------------------------------------------------------------

let picked: ((id: string) => void) | null
let closed: (() => void) | null
const glassMenu = {
  native: true,
  open: vi.fn(),
  onPicked: vi.fn((listener: (id: string) => void) => {
    picked = listener
    return () => (picked = null)
  }),
  onClosed: vi.fn((listener: () => void) => {
    closed = listener
    return () => (closed = null)
  }),
  onShow: vi.fn(() => () => {}),
  setHeight: vi.fn(),
  pick: vi.fn(),
  close: vi.fn()
}
const originalApi = window.api

beforeEach(() => {
  picked = null
  closed = null
  Object.values(glassMenu).forEach((fn) => typeof fn === 'function' && fn.mockClear())
  Object.defineProperty(window, 'api', {
    value: { ...originalApi, glassMenu },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
  document.documentElement.classList.remove('dark')
})

function renderMenu(onSelect = vi.fn()) {
  render(
    <GlassMenu
      side="top"
      identity={{ name: 'Kartik', email: 'k@example.com' }}
      items={[{ id: 'sign-out', label: 'Sign out' }]}
      onSelect={onSelect}
      trigger={<button type="button">Account</button>}
    />
  )
  const trigger = screen.getByRole('button', { name: 'Account' })
  trigger.getBoundingClientRect = () =>
    ({ x: 12, y: 740, width: 120, height: 32, top: 740, left: 12 }) as DOMRect
  return { trigger, onSelect }
}

describe('GlassMenu', () => {
  it('asks for the menu stood on its trigger, in the page’s theme', async () => {
    document.documentElement.classList.add('dark')
    const { trigger } = renderMenu()
    expect(trigger.getAttribute('aria-haspopup')).toBe('menu')
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(trigger)
    expect(glassMenu.open).toHaveBeenCalledWith({
      anchor: { x: 12, y: 740, width: 120, height: 32 },
      side: 'top',
      align: 'start',
      focus: 'menu',
      theme: 'dark',
      identity: { name: 'Kartik', email: 'k@example.com' },
      items: [{ id: 'sign-out', label: 'Sign out' }]
    })
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
    expect(trigger.hasAttribute('data-popup-open')).toBe(true)
  })

  it('opens onto its first row from the keys, and its last from the up arrow', async () => {
    const { trigger } = renderMenu()
    trigger.focus()
    await userEvent.keyboard('{Enter}')
    expect(glassMenu.open).toHaveBeenLastCalledWith(expect.objectContaining({ focus: 'first' }))
    act(() => closed?.())
    fireEvent.keyDown(trigger, { key: 'ArrowUp' })
    expect(glassMenu.open).toHaveBeenLastCalledWith(expect.objectContaining({ focus: 'last' }))
  })

  it('runs what was picked, and stands closed once the menu goes', async () => {
    const { trigger, onSelect } = renderMenu()
    await userEvent.click(trigger)
    act(() => closed?.())
    expect(trigger.getAttribute('aria-expanded')).toBe('false')
    act(() => picked?.('sign-out'))
    expect(onSelect).toHaveBeenCalledWith('sign-out')
  })

  it('stays closed when the press that closed the menu lands on its trigger', async () => {
    const { trigger } = renderMenu()
    await userEvent.click(trigger)
    act(() => closed?.())
    await userEvent.click(trigger)
    expect(glassMenu.open).toHaveBeenCalledTimes(1)
  })

  it('closes the menu from its trigger, while main has not yet said it went', async () => {
    const { trigger } = renderMenu()
    await userEvent.click(trigger)
    await userEvent.click(trigger)
    expect(glassMenu.close).toHaveBeenCalled()
    expect(glassMenu.open).toHaveBeenCalledTimes(1)
  })

  it('closes on a press anywhere in the note window', async () => {
    const { trigger } = renderMenu()
    await userEvent.click(trigger)
    fireEvent.pointerDown(document.body)
    expect(glassMenu.close).toHaveBeenCalledTimes(1)
    act(() => closed?.())
    fireEvent.pointerDown(document.body)
    expect(glassMenu.close).toHaveBeenCalledTimes(1)
  })

  it('hears no pick meant for another menu', async () => {
    const { onSelect } = renderMenu()
    act(() => picked?.('sign-out'))
    expect(onSelect).not.toHaveBeenCalled()
  })
})
