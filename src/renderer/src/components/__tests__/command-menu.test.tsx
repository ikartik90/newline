import type { SVGProps } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CommandMenu, RECENT_LIMIT, type CommandMenuAction } from '../command-menu'
import { HAS_CURSOR_QUERY } from '@/hooks/use-has-cursor'

// ---------------------------------------------------------------------------
// The command menu: ⌘K, then type. Every note is a row — the recent ones on
// an empty field, main's full-text search once something is typed — and the
// app's own actions are rows under them. Enter takes the highlighted row.
// ---------------------------------------------------------------------------

const AddIcon = (props: SVGProps<SVGSVGElement>) => <svg data-icon="add" {...props} />
const DarkIcon = (props: SVGProps<SVGSVGElement>) => <svg data-icon="dark" {...props} />

function makeNote(id: string, title: string, overrides: Partial<Note> = {}): Note {
  return {
    id,
    title,
    body: '{"type":"doc","content":[]}',
    plainText: '',
    tags: [],
    createdAt: 1,
    updatedAt: Date.now(),
    lastSyncedAt: null,
    isDeleted: false,
    ...overrides
  }
}

const apples = makeNote('a', 'Apples')
const bread = makeNote('b', 'Bread')
const untitled = makeNote('c', '', { plainText: 'A first line\nmore' })
const all = [apples, bread, untitled]

const list = vi.fn()
const search = vi.fn()
const originalApi = window.api
const originalMatchMedia = window.matchMedia
let hasCursor = true

/** Claim the field the shortcut's platform detection reads first. */
function stubPlatform(platform: string) {
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform },
    configurable: true
  })
}

beforeEach(() => {
  hasCursor = true
  stubPlatform('macOS')
  list.mockReset().mockResolvedValue(all)
  search
    .mockReset()
    .mockImplementation(async (query: string) =>
      all.filter((note) => note.title.toLowerCase().includes(query.toLowerCase()))
    )
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin', notes: { list, search } },
    writable: true,
    configurable: true
  })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn((query: string) => ({
      matches: query === HAS_CURSOR_QUERY ? hasCursor : false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  })
})

afterEach(() => {
  delete (navigator as { userAgentData?: unknown }).userAgentData
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: originalMatchMedia
  })
})

function actions(): CommandMenuAction[] {
  return [
    { id: 'new', label: 'New note', icon: AddIcon, shortcut: 'N', run: vi.fn() },
    { id: 'theme', label: 'Dark theme', icon: DarkIcon, run: vi.fn() }
  ]
}

function renderMenu(overrides: { open?: boolean; actions?: CommandMenuAction[] } = {}) {
  const props = {
    open: true,
    onClose: vi.fn(),
    onOpenNote: vi.fn(),
    actions: overrides.actions ?? actions(),
    ...overrides
  }
  const view = render(<CommandMenu {...props} />)
  return { ...view, props }
}

const dialog = () => screen.getByRole('dialog')
const field = () => screen.getByRole('combobox')
const rows = () =>
  within(dialog())
    .getAllByRole('option')
    .map((option) => option.getAttribute('data-value'))
const type = (value: string) => fireEvent.change(field(), { target: { value } })

describe('CommandMenu', () => {
  it('draws nothing while closed', () => {
    renderMenu({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(list).not.toHaveBeenCalled()
  })

  it('opens on the recent notes and the actions, with the field ready to type into', async () => {
    renderMenu()
    expect(await within(dialog()).findByText('Apples')).toBeTruthy()
    expect(screen.getByText('Recent')).toBeTruthy()
    expect(screen.getByText('Actions')).toBeTruthy()
    expect(rows()).toEqual(['note:a', 'note:b', 'note:c', 'action:new', 'action:theme'])
    await waitFor(() => expect(document.activeElement).toBe(field()))
  })

  it('names an untitled note as the sidebar does', async () => {
    renderMenu()
    expect(await within(dialog()).findByText('A first line')).toBeTruthy()
  })

  it('shows only the most recent notes on an empty field', async () => {
    const many = Array.from({ length: RECENT_LIMIT + 3 }, (_, i) => makeNote(`n${i}`, `Note ${i}`))
    list.mockResolvedValue(many)
    renderMenu()
    await within(dialog()).findByText('Note 0')
    expect(rows().filter((value) => value?.startsWith('note:'))).toHaveLength(RECENT_LIMIT)
  })

  it('searches every note as you type, and heads the results as such', async () => {
    renderMenu()
    await within(dialog()).findByText('Apples')
    type('bre')
    await waitFor(() => expect(search).toHaveBeenCalledWith('bre'))
    expect(await within(dialog()).findByText('Bread')).toBeTruthy()
    await waitFor(() => expect(within(dialog()).queryByText('Apples')).toBeNull())
    expect(screen.getByText('Notes')).toBeTruthy()
    expect(screen.queryByText('Recent')).toBeNull()
  })

  it('narrows the actions to those named by what is typed', async () => {
    renderMenu()
    await within(dialog()).findByText('Apples')
    type('DARK')
    expect(within(dialog()).getByText('Dark theme')).toBeTruthy()
    expect(within(dialog()).queryByText('New note')).toBeNull()
  })

  it('says so when nothing answers', async () => {
    search.mockResolvedValue([])
    renderMenu()
    await within(dialog()).findByText('Apples')
    type('zzz')
    expect(await within(dialog()).findByText('No results')).toBeTruthy()
    expect(screen.queryByText('Actions')).toBeNull()
  })

  it('opens the highlighted note on Enter and closes', async () => {
    const { props } = renderMenu()
    await within(dialog()).findByText('Apples')
    fireEvent.keyDown(field(), { key: 'ArrowDown' })
    fireEvent.keyDown(field(), { key: 'Enter' })
    expect(props.onOpenNote).toHaveBeenCalledWith(bread)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('opens a note that is clicked', async () => {
    const { props } = renderMenu()
    fireEvent.click(await within(dialog()).findByText('Apples'))
    expect(props.onOpenNote).toHaveBeenCalledWith(apples)
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('runs an action that is chosen, after closing', async () => {
    const list = actions()
    const { props } = renderMenu({ actions: list })
    await within(dialog()).findByText('Apples')
    fireEvent.click(within(dialog()).getByText('Dark theme'))
    expect(list[1].run).toHaveBeenCalledTimes(1)
    expect(list[0].run).not.toHaveBeenCalled()
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on Escape', async () => {
    const { props } = renderMenu()
    await within(dialog()).findByText('Apples')
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })

  it('writes each action’s shortcut for the keyboard in use, where there is one', async () => {
    renderMenu()
    await within(dialog()).findByText('Apples')
    const chips = [...dialog().querySelectorAll('kbd')].map((kbd) => kbd.textContent)
    expect(chips).toContain('⌘N')
    expect(chips).toContain('Esc')
  })

  it('draws no key chips on a device without one, and a close button instead', async () => {
    hasCursor = false
    const { props } = renderMenu()
    await within(dialog()).findByText('Apples')
    expect(dialog().querySelectorAll('kbd')).toHaveLength(0)
    fireEvent.click(within(dialog()).getByRole('button', { name: 'Close' }))
    expect(props.onClose).toHaveBeenCalledTimes(1)
  })
})
