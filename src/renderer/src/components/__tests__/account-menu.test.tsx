import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AccountMenu } from '../account-menu'

// ---------------------------------------------------------------------------
// The signed-in account at the foot of the sidebar: who it is, and a menu
// with the full address and the way out.
// ---------------------------------------------------------------------------

describe('AccountMenu', () => {
  it('is a sidebar row tall, and only as wide as what it shows', () => {
    render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
    const classes = screen.getByRole('button', { name: 'Account' }).className.split(/\s+/)
    expect(classes).toContain('h-8')
    expect(classes).not.toContain('flex-1')
    expect(classes).not.toContain('w-full')
    expect(classes).toContain('rounded-xl')
  })

  it('pads the avatar as the head rows pad their glyphs, and draws it at their size', () => {
    render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger.className.split(/\s+/)).toContain('px-[6.5px]')
    expect(trigger.firstElementChild!.className.split(/\s+/)).toContain('size-5')
  })

  it('inks its chevron as its name is inked', () => {
    render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger.className.split(/\s+/)).toContain('text-ink-body')
    const chevron = (trigger.querySelector('svg')!.getAttribute('class') ?? '').split(/\s+/)
    expect(chevron).toContain('text-ink-body')
  })

  it('sets its name in the sidebar’s type', () => {
    render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
    const classes = screen.getByRole('button', { name: 'Account' }).className.split(/\s+/)
    expect(classes).toContain('text-style-sidebar')
    expect(classes).not.toContain('text-style-body-sm')
  })

  it('names the account by its name when Google gave one', () => {
    render(
      <AccountMenu user={{ id: 'u', email: 'k@example.com', name: 'Kartik' }} onSignOut={vi.fn()} />
    )
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger.textContent).toContain('Kartik')
  })

  it('falls back to the address’s local part, and to its initial for the avatar', () => {
    render(<AccountMenu user={{ id: 'u', email: 'kartik@example.com' }} onSignOut={vi.fn()} />)
    const trigger = screen.getByRole('button', { name: 'Account' })
    expect(trigger.textContent).toContain('kartik')
    expect(trigger.textContent).toContain('K')
  })

  it('shows the picture when there is one', () => {
    render(
      <AccountMenu
        user={{ id: 'u', email: 'k@example.com', picture: 'https://example.com/me.png' }}
        onSignOut={vi.fn()}
      />
    )
    const img = screen.getByRole('button', { name: 'Account' }).querySelector('img')
    expect(img?.getAttribute('src')).toBe('https://example.com/me.png')
  })

  it('opens onto its name over the full address, and Sign out', async () => {
    const onSignOut = vi.fn()
    render(
      <AccountMenu
        user={{ id: 'u', email: 'k@example.com', name: 'Kartik' }}
        onSignOut={onSignOut}
      />
    )
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    const menu = screen.getByRole('menu')
    expect(within(menu).getByText('Kartik')).toBeTruthy()
    expect(within(menu).getByText('k@example.com')).toBeTruthy()
    // No chevron: it is the button's, which opens the menu.
    expect(menu.querySelector('svg')).toBeNull()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
  })

  describe('its menu', () => {
    const originalApi = window.api
    afterEach(() => {
      Object.defineProperty(window, 'api', {
        value: originalApi,
        writable: true,
        configurable: true
      })
    })
    const withApi = (api: Partial<Window['api']>) =>
      Object.defineProperty(window, 'api', {
        value: { ...originalApi, ...api },
        writable: true,
        configurable: true
      })

    it('is the frosted sheet over a frosted window, cornered at 12px', async () => {
      withApi({ frosted: true })
      render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))
      const classes = screen.getByRole('menu').className.split(/\s+/)
      expect(classes).toContain('frosted-sheet')
      expect(classes).not.toContain('bg-bg-sheet')
      expect(classes).toContain('rounded-lg')
    })

    it('is the solid sheet where the window has no blur', async () => {
      withApi({ frosted: false })
      render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={vi.fn()} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))
      const classes = screen.getByRole('menu').className.split(/\s+/)
      expect(classes).toContain('bg-bg-sheet')
      expect(classes).not.toContain('frosted-sheet')
      expect(classes).toContain('rounded-lg')
    })

    it('is AppKit’s glass, in a window of its own, where there is that glass', async () => {
      let picked: ((id: string) => void) | undefined
      const glassMenu = {
        native: true,
        open: vi.fn(),
        onPicked: vi.fn((listener: (id: string) => void) => {
          picked = listener
          return () => {}
        }),
        onClosed: vi.fn(() => () => {}),
        onShow: vi.fn(() => () => {}),
        setHeight: vi.fn(),
        pick: vi.fn(),
        close: vi.fn()
      }
      withApi({ glassMenu })
      const onSignOut = vi.fn()
      render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={onSignOut} />)
      await userEvent.click(screen.getByRole('button', { name: 'Account' }))
      expect(screen.queryByRole('menu')).toBeNull()
      // The menu draws the button again over it: the button hides under it.
      const trigger = screen.getByRole('button', { name: 'Account' })
      expect(trigger.className.split(/\s+/)).toContain('data-[popup-open]:opacity-0')
      expect(trigger.hasAttribute('data-popup-open')).toBe(true)
      expect(glassMenu.open).toHaveBeenCalledWith(
        expect.objectContaining({
          side: 'over',
          identity: { name: 'k', email: 'k@example.com', picture: undefined },
          items: [{ id: 'sign-out', label: 'Sign out' }]
        })
      )
      picked?.('sign-out')
      expect(onSignOut).toHaveBeenCalled()
    })
  })
})
