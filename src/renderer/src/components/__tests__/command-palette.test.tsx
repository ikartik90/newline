import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandPalette } from '../command-palette'

// ---------------------------------------------------------------------------
// The glass palette: the command menu in a window of its own, laid over the
// note window on AppKit's glass (main/command-palette.ts). Main shows it with
// what the note window holds; what is picked goes back through main.
// ---------------------------------------------------------------------------

const note: Note = {
  id: 'n1',
  title: 'Apples',
  body: '{"type":"doc","content":[]}',
  plainText: '',
  tags: [],
  createdAt: 1,
  updatedAt: Date.now(),
  lastSyncedAt: null,
  isDeleted: false
}

let show: ((state: CommandMenuState, maxHeight: number) => void) | null
let fit: ((maxHeight: number) => void) | null
const palette = {
  native: true,
  open: vi.fn(),
  onCommand: vi.fn(() => () => {}),
  onOpenNote: vi.fn(() => () => {}),
  onShow: vi.fn((listener: (state: CommandMenuState, maxHeight: number) => void) => {
    show = listener
    return () => {
      show = null
    }
  }),
  onFit: vi.fn((listener: (maxHeight: number) => void) => {
    fit = listener
    return () => {
      fit = null
    }
  }),
  run: vi.fn(),
  openNote: vi.fn(),
  close: vi.fn(),
  setHeight: vi.fn()
}
const originalApi = window.api

beforeEach(() => {
  show = null
  fit = null
  Object.values(palette).forEach((fn) => typeof fn === 'function' && fn.mockClear())
  Object.defineProperty(window, 'api', {
    value: {
      platform: 'darwin',
      notes: { list: vi.fn(async () => [note]), search: vi.fn(async () => [note]) },
      palette
    },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
  document.documentElement.classList.remove('dark')
})

const showWith = (state: CommandMenuState, maxHeight = 600) => act(() => show!(state, maxHeight))
const menu = () => screen.getByRole('listbox')

describe('CommandPalette', () => {
  it('shows nothing until main shows it', () => {
    render(<CommandPalette />)
    expect(screen.queryByRole('combobox')).toBeNull()
  })

  it('shows the menu for what the window holds, in its theme', async () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: true, noteOpen: true, assistantOpen: false, theme: 'dark' })
    expect(await within(menu()).findByText('Apples')).toBeTruthy()
    expect(within(menu()).getByText('Show sidebar')).toBeTruthy()
    expect(within(menu()).getByText('Delete note')).toBeTruthy()
    expect(document.documentElement.classList.contains('dark')).toBe(true)

    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    expect(document.documentElement.classList.contains('dark')).toBe(false)
  })

  it('stands on the glass, so a highlight is the glass a shade deeper', () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    const ground = screen.getByRole('combobox').closest('[data-on-glass]')
    expect(ground?.className).toContain('bg-level-1')
  })

  // Liquid Glass draws its own rim along its own corner (panelGlass):
  // the page draws none of its own.
  it('draws no edge of its own over the glass', () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    const ground = screen.getByRole('combobox').closest('[data-on-glass]')
    expect(ground?.className).not.toMatch(/\bborder\b|rounded-/)
  })

  // Main says how much of the window it may take; past that its list scrolls,
  // under a field that stays.
  it('stands no taller than main allows, its list scrolling', () => {
    render(<CommandPalette />)
    showWith(
      { sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' },
      288
    )
    const ground = screen.getByRole('combobox').closest('[data-on-glass]') as HTMLElement
    expect(ground.style.maxHeight).toBe('288px')
    expect(ground.className.split(/\s+/)).toContain('overflow-hidden')
    expect(menu().className.split(/\s+/)).toContain('overflow-y-auto')
  })

  // The window resized under it: the same showing, now no taller than this.
  it('fits a resized window, keeping what is typed', async () => {
    render(<CommandPalette />)
    showWith(
      { sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' },
      600
    )
    await userEvent.type(screen.getByRole('combobox'), 'app')
    act(() => fit!(288))
    const ground = screen.getByRole('combobox').closest('[data-on-glass]') as HTMLElement
    expect(ground.style.maxHeight).toBe('288px')
    expect((screen.getByRole('combobox') as HTMLInputElement).value).toBe('app')
  })

  it('hands a picked action to main', async () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    await userEvent.click(within(menu()).getByText('New note'))
    expect(palette.run).toHaveBeenCalledWith('new-note')
  })

  it('hands a picked note to main', async () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    await userEvent.click(await within(menu()).findByText('Apples'))
    expect(palette.openNote).toHaveBeenCalledWith(note)
  })

  it('closes on Escape and on ⌘K', () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(palette.close).toHaveBeenCalledTimes(2)
  })

  it('answers an action’s own keys, as the window would have', () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    expect(palette.run).toHaveBeenCalledWith('new-note')
  })

  it('starts each showing with an empty field and the focus in it', async () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    await userEvent.type(screen.getByRole('combobox'), 'app')
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    const field = screen.getByRole('combobox') as HTMLInputElement
    expect(field.value).toBe('')
    await waitFor(() => expect(document.activeElement).toBe(field))
  })

  it('tells main how tall it stands', async () => {
    render(<CommandPalette />)
    showWith({ sidebarCollapsed: false, noteOpen: false, assistantOpen: false, theme: 'light' })
    await waitFor(() => expect(palette.setHeight).toHaveBeenCalled())
  })
})
