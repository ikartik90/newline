import type { SVGProps } from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MenuButton, type MenuButtonItem } from '../menu-button'
import { HAS_CURSOR_QUERY } from '@/hooks/use-has-cursor'

const TrashIcon = (props: SVGProps<SVGSVGElement>) => <svg data-icon="trash" {...props} />

/** Claim the field the shortcut's platform detection reads first. */
function stubPlatform(platform: string) {
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform },
    configurable: true
  })
}

// The item shortcut chips are offered only where there is a key to press.
const originalMatchMedia = window.matchMedia
beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === HAS_CURSOR_QUERY,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
})

function items(overrides: Partial<MenuButtonItem> = {}): MenuButtonItem[] {
  return [
    { label: 'New note', shortcut: 'N', onSelect: vi.fn(), ...overrides },
    { label: 'Delete note', icon: TrashIcon, onSelect: vi.fn() }
  ]
}

describe('MenuButton', () => {
  afterEach(() => {
    delete (navigator as { userAgentData?: unknown }).userAgentData
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: originalMatchMedia
    })
  })

  it('opens a menu of the items when pressed, and runs the one chosen', async () => {
    stubPlatform('macOS')
    const list = items()
    render(<MenuButton items={list} />)
    expect(screen.queryByRole('menu')).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Menu' }))
    const menu = await screen.findByRole('menu')
    const rows = screen.getAllByRole('menuitem')
    expect(rows.map((row) => row.textContent)).toEqual(['New note⌘N', 'Delete note'])
    expect(menu.querySelector('[data-icon="trash"]')).not.toBeNull()

    // The chip is aria-hidden, so the row's name is its label alone.
    fireEvent.click(screen.getByRole('menuitem', { name: 'New note' }))
    expect(list[0].onSelect).toHaveBeenCalledTimes(1)
    expect(list[1].onSelect).not.toHaveBeenCalled()
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull())
  })

  it('writes the shortcut with the key the platform actually types', () => {
    stubPlatform('Windows')
    render(<MenuButton items={items()} />)

    expect(screen.getByText('Ctrl K').tagName).toBe('KBD')
    expect(screen.queryByText('⌘K')).toBeNull()
  })

  it('opens on its shortcut', async () => {
    stubPlatform('macOS')
    render(<MenuButton items={items()} />)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(await screen.findByRole('menu')).toBeDefined()
  })

  it('carries the icon’s name in a hover tooltip, not beside it', () => {
    stubPlatform('macOS')
    render(<MenuButton items={items()} />)

    const button = screen.getByRole('button', { name: 'Menu' })
    // Icon only — the glyph is an <svg>, so the button holds no text of its own.
    expect(button.textContent).toBe('')
    expect(screen.getByText('⌘K').tagName).toBe('KBD')

    const tip = screen.getByText('Menu').parentElement as HTMLElement
    expect(tip.getAttribute('aria-hidden')).toBe('true')
    expect(tip.hasAttribute('data-open')).toBe(false)

    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 5, clientY: 5 })
    expect(tip.hasAttribute('data-open')).toBe(true)
    // The chip steps aside while the tooltip is up — see the stylesheet hook.
    expect(button.hasAttribute('data-tooltip-visible')).toBe(true)

    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    expect(tip.hasAttribute('data-open')).toBe(false)
  })

  it('takes its own name and shortcut key', () => {
    stubPlatform('macOS')
    render(<MenuButton items={items()} label="Note actions" shortcut="J" />)
    expect(screen.getByRole('button', { name: 'Note actions' })).toBeDefined()
    expect(screen.getByText('⌘J').tagName).toBe('KBD')
  })
})
