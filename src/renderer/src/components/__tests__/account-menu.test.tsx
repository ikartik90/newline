import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
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
    expect(classes).toContain('rounded-lg')
    expect(classes).toContain('squircle')
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
    expect(trigger.className.split(/\s+/)).toContain('text-fg')
    const chevron = (trigger.querySelector('svg')!.getAttribute('class') ?? '').split(/\s+/)
    expect(chevron).toContain('text-fg')
    expect(chevron.some((c) => c.startsWith('text-fg-body'))).toBe(false)
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

  it('opens onto the full address and Sign out', async () => {
    const onSignOut = vi.fn()
    render(<AccountMenu user={{ id: 'u', email: 'k@example.com' }} onSignOut={onSignOut} />)
    await userEvent.click(screen.getByRole('button', { name: 'Account' }))
    expect(await screen.findByText('k@example.com')).toBeTruthy()
    await userEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }))
    expect(onSignOut).toHaveBeenCalled()
  })
})
