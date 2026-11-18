import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GlassMenuPage } from '../glass-menu-page'

// ---------------------------------------------------------------------------
// The glass menu's own window: it draws the menu the note window asked for,
// on the glass, says how tall it stands, and names back what is picked.
// ---------------------------------------------------------------------------

let show: ((request: GlassMenuRequest) => void) | null
const glassMenu = {
  native: false,
  open: vi.fn(),
  onPicked: vi.fn(() => () => {}),
  onClosed: vi.fn(() => () => {}),
  onShow: vi.fn((listener: (request: GlassMenuRequest) => void) => {
    show = listener
    return () => (show = null)
  }),
  setHeight: vi.fn(),
  pick: vi.fn(),
  close: vi.fn()
}
const originalApi = window.api

const request: GlassMenuRequest = {
  anchor: { x: 12, y: 740, width: 120, height: 32 },
  side: 'top',
  align: 'start',
  focus: 'menu',
  theme: 'dark',
  identity: { name: 'Kartik', email: 'k@example.com' },
  items: [
    { id: 'profile', label: 'Profile' },
    { id: 'sign-out', label: 'Sign out' }
  ]
}

beforeEach(() => {
  show = null
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

describe('GlassMenuPage', () => {
  it('draws nothing until it is shown', () => {
    render(<GlassMenuPage />)
    expect(screen.queryByRole('menu')).toBeNull()
  })

  it('draws the menu on the glass in the note window’s theme, and says how tall it is', () => {
    render(<GlassMenuPage />)
    act(() => show?.(request))
    const menu = screen.getByRole('menu')
    expect(menu.hasAttribute('data-on-glass')).toBe(true)
    expect(menu.className.split(/\s+/)).toContain('bg-level-1')
    expect(screen.getByText('Kartik')).toBeTruthy()
    expect(screen.getByText('k@example.com')).toBeTruthy()
    expect(screen.getAllByRole('menuitem').map((row) => row.textContent)).toEqual([
      'Profile',
      'Sign out'
    ])
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(glassMenu.setHeight).toHaveBeenCalled()
    expect(document.activeElement).toBe(menu)
  })

  it('heads its rows with who it is about, laid as the account button is', () => {
    render(<GlassMenuPage />)
    act(() => show?.(request))
    const menu = screen.getByRole('menu')
    // Its padding is main's GLASS_MENU_INSET, 4px, so over the button its first
    // row is the button's own box.
    expect(menu.className.split(/\s+/)).toContain('p-1')
    const nameRow = screen.getByText('Kartik').parentElement!
    expect(nameRow.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['h-8', 'px-[6.5px]', 'gap-2'])
    )
    expect(nameRow.querySelector('span[aria-hidden]')?.textContent).toBe('K')
    const email = screen.getByText('k@example.com')
    expect(email.className.split(/\s+/)).toContain('text-style-caption')
    // Across the menu's 4px padding, edge to edge.
    expect(screen.getByRole('separator').className.split(/\s+/)).toContain('-mx-1')
  })

  it('lands the keys on the row asked for', () => {
    render(<GlassMenuPage />)
    act(() => show?.({ ...request, focus: 'last' }))
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Sign out' }))
  })

  it('names a picked row back', async () => {
    render(<GlassMenuPage />)
    act(() => show?.(request))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(glassMenu.pick).toHaveBeenCalledWith('sign-out')
  })

  it('walks the rows with the arrows and closes on Escape', () => {
    render(<GlassMenuPage />)
    act(() => show?.(request))
    const menu = screen.getByRole('menu')
    fireEvent.keyDown(menu, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: 'Profile' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(glassMenu.close).toHaveBeenCalled()
  })
})
