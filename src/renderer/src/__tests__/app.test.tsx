import React from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDocument } from '@shared/domain/document'
import App from '../App'

// ---------------------------------------------------------------------------
// The app shell end to end in jsdom: a signed-in user, a fake main process
// behind `window.api`, and the real editor. What is checked is the wiring —
// that a note opens in the editor, that an edit reaches SQLite and the sync
// push, that a pull main reports reloads the list, and that the properties
// rail edits tags.
// ---------------------------------------------------------------------------

// One user object for the run, as the real hook's state would be: a fresh
// one per render would look like a new sign-in on every render.
const auth = vi.hoisted(() => ({
  user: { id: 'u1', email: 'me@example.com' },
  loading: false,
  logout: vi.fn()
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => auth }))

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: 'n1',
    title: 'First note',
    body: serializeDocument({
      type: 'doc',
      content: [{ type: 'paragraph', children: [{ type: 'text', text: 'Hello there' }] }]
    }),
    plainText: 'Hello there',
    tags: ['work'],
    createdAt: 1,
    updatedAt: 2,
    lastSyncedAt: null,
    isDeleted: false,
    ...overrides
  }
}

function installApi(notes: Note[]) {
  const changeListeners = new Set<() => void>()
  const api = {
    platform: 'darwin',
    notes: {
      // Copies, as IPC would hand over: the same array again would not re-render.
      list: vi.fn(async () => [...notes]),
      search: vi.fn(async (_query: string) => [...notes]),
      get: vi.fn(async (id: string) => notes.find((n) => n.id === id) ?? null),
      create: vi.fn(async (title = '', body = '') => {
        const note = makeNote({ id: `n${notes.length + 1}`, title, body, tags: [], plainText: '' })
        notes.push(note)
        return note
      }),
      update: vi.fn(async (id: string, fields: Partial<Note>) => {
        const index = notes.findIndex((n) => n.id === id)
        if (index === -1) return null
        notes[index] = { ...notes[index], ...fields, updatedAt: Date.now() }
        return notes[index]
      }),
      delete: vi.fn(async () => {})
    },
    sync: {
      now: vi.fn(async () => ({ pushed: 0, pulled: 0, ok: true })),
      pushNote: vi.fn(async () => true),
      status: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, lastSyncedAt: null })),
      onChanged: vi.fn((listener: () => void) => {
        changeListeners.add(listener)
        return () => {
          changeListeners.delete(listener)
        }
      })
    },
    theme: { setSource: vi.fn(async () => {}) },
    meta: { set: vi.fn(async () => {}), get: vi.fn(async () => null) },
    media: {
      list: vi.fn(async () => []),
      upload: vi.fn(),
      updateAlt: vi.fn(),
      rename: vi.fn(),
      delete: vi.fn(),
      uploadPoster: vi.fn(),
      flushPending: vi.fn(async () => 0)
    },
    auth: {
      googleSignIn: vi.fn(),
      cancelSignIn: vi.fn(async () => {}),
      current: vi.fn(async () => ({ id: 'u1', email: 'me@example.com' })),
      signOut: vi.fn(async () => {})
    }
  }
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })
  /** What main does when a pull changed notes. */
  const notifyChanged = () => changeListeners.forEach((listener) => listener())
  return { api, notifyChanged, changeListeners }
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists notes and asks main for a sync cycle for the signed-in user', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    expect(await screen.findByText('First note')).toBeTruthy()
    expect(screen.getByText('me@example.com')).toBeTruthy()
    expect(api.sync.now).toHaveBeenCalledTimes(1)
    expect(api.sync.onChanged).toHaveBeenCalledTimes(1)
  })

  it('reloads the list when main reports a pull changed notes, and stops listening on unmount', async () => {
    const notes = [makeNote()]
    const { api, notifyChanged, changeListeners } = installApi(notes)
    const { unmount } = render(<App />)
    await screen.findByText('First note')
    await waitFor(() => expect(api.notes.list).toHaveBeenCalledTimes(1))

    notes.push(makeNote({ id: 'n2', title: 'From elsewhere', tags: [] }))
    act(() => notifyChanged())
    expect(await screen.findByText('From elsewhere')).toBeTruthy()

    unmount()
    expect(changeListeners.size).toBe(0)
  })

  it('reloads the list when the cycle it asked for pulled something', async () => {
    const notes = [makeNote()]
    const { api } = installApi(notes)
    api.sync.now.mockImplementationOnce(async () => {
      notes.push(makeNote({ id: 'n2', title: 'Pulled at start', tags: [] }))
      return { pushed: 0, pulled: 1, ok: true }
    })
    render(<App />)
    expect(await screen.findByText('Pulled at start')).toBeTruthy()
  })

  it('asks for another cycle when the machine comes back online', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    await waitFor(() => expect(api.sync.now).toHaveBeenCalledTimes(1))
    act(() => {
      window.dispatchEvent(new Event('online'))
    })
    expect(api.sync.now).toHaveBeenCalledTimes(2)
  })

  it('opens a note in the editor with its title and body', async () => {
    installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    const title = await screen.findByRole('heading', { name: 'Title' })
    expect(title.textContent).toBe('First note')
    expect(screen.getByText('Hello there')).toBeTruthy()
  })

  it('writes an edit to the note and has main push it, reporting the save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const { api } = installApi([makeNote()])
      render(<App />)
      await userEvent.click(await screen.findByText('First note'))
      const title = await screen.findByRole('heading', { name: 'Title' })

      // The title is a contentEditable; an input event is how it reports typing.
      await act(async () => {
        title.textContent = 'Renamed'
        title.dispatchEvent(new Event('input', { bubbles: true }))
      })
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })

      await waitFor(() => expect(api.notes.update).toHaveBeenCalled())
      const [id, fields] = api.notes.update.mock.calls[0] as [string, Partial<Note>]
      expect(id).toBe('n1')
      expect(fields.title).toBe('Renamed')
      expect(JSON.parse(fields.body as string).type).toBe('doc')
      await waitFor(() => expect(api.sync.pushNote).toHaveBeenCalledWith('n1'))
      expect(await screen.findByText('Saved')).toBeTruthy()
    } finally {
      vi.useRealTimers()
    }
  })

  it('edits tags from the properties rail', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    await userEvent.click(await screen.findByRole('button', { name: 'Note properties' }))
    await userEvent.type(await screen.findByLabelText('Add tag'), 'ideas{enter}')
    await waitFor(() =>
      expect(api.notes.update).toHaveBeenCalledWith('n1', { tags: ['work', 'ideas'] })
    )
  })

  it('ends the header with the theme toggle and then the note properties button', async () => {
    installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    const properties = await screen.findByRole('button', { name: 'Note properties' })
    // jsdom's matchMedia never matches, so the system theme is light and the
    // toggle offers dark.
    const theme = screen.getByRole('button', { name: 'Dark theme' })
    const buttons = within(properties.parentElement as HTMLElement).getAllByRole('button')
    expect(buttons.at(-1)).toBe(properties)
    expect(buttons.at(-2)).toBe(theme)
  })

  it('creates a new note from the empty state and opens it', async () => {
    const { api } = installApi([])
    render(<App />)
    // The sidebar has a "New note" icon button too; the empty state's is last.
    const buttons = await screen.findAllByRole('button', { name: 'New note' })
    await userEvent.click(buttons[buttons.length - 1])
    expect(api.notes.create).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Title' })).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// The shell's chrome. On macOS the window's own controls are drawn over the
// top-left of the content, which is where the sidebar's own header starts — so
// nothing of the app's goes there: the sidebar toggle lives in the top bar of
// the main pane, to the right of the sidebar, and the bar itself steps clear of
// the controls when the sidebar is collapsed out from under them.
// ---------------------------------------------------------------------------

describe('App chrome', () => {
  it('puts the sidebar toggle in the top bar rather than in the sidebar', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    const toggle = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(sidebar.contains(toggle)).toBe(false)
    expect(screen.getByRole('banner').contains(toggle)).toBe(true)
  })

  it('collapses and expands the sidebar from that toggle, keeping the bar’s own controls in view', async () => {
    installApi([makeNote()])
    render(<App />)
    expect(await screen.findByRole('button', { name: /^First note/ })).toBeTruthy()

    // The glyph is the rail's own and does not change with the state, so the
    // pressed chip is what says whether the rail is showing.
    const shown = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(shown.getAttribute('aria-pressed')).toBe('true')

    await userEvent.click(shown)
    expect(screen.queryByRole('button', { name: /^First note/ })).toBeNull()
    // The new-note button and the search live in the bar, not the rail.
    const bar = screen.getByRole('banner')
    expect(within(bar).getByRole('button', { name: 'New note' })).toBeTruthy()
    expect(within(bar).getByRole('button', { name: 'Search notes' })).toBeTruthy()

    const hidden = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(hidden.getAttribute('aria-pressed')).toBe('false')

    await userEvent.click(hidden)
    expect(await screen.findByRole('button', { name: /^First note/ })).toBeTruthy()
  })

  it('orders the bar: the sidebar toggle, the new-note button, then the search, then the account', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    const order = within(bar)
      .getAllByRole('button')
      .map((button) => button.getAttribute('aria-label') ?? button.textContent)
    expect(order.slice(0, 3)).toEqual(['Collapse sidebar', 'New note', 'Search notes'])
    const email = within(bar).getByText('me@example.com')
    const search = within(bar).getByRole('button', { name: 'Search notes' })
    expect(search.compareDocumentPosition(email) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('holds the rail’s controls at its far end while it is open, and brings them to the bar’s start past the window controls once it has gone', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    const controls = within(bar).getByRole('button', { name: 'New note' }).parentElement!
    // The rail's width, the chips against its right inset.
    expect(controls.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['w-64', 'justify-end', 'pr-2'])
    )

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    // The window's controls sit over the bar's left corner on macOS.
    expect(controls.className.split(/\s+/)).toContain('w-[148px]')
  })

  it('brings the rail’s controls to the bar’s edge where the window draws no controls over it', async () => {
    const { api } = installApi([makeNote()])
    ;(api as { platform: string }).platform = 'win32'
    render(<App />)
    const bar = await screen.findByRole('banner')
    const controls = within(bar).getByRole('button', { name: 'New note' }).parentElement!
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(controls.className.split(/\s+/)).toContain('w-[76px]')
  })

  it('centres the search over the note panel, and keeps it there as the rail goes', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    const slot = within(bar).getByRole('button', { name: 'Search notes' }).parentElement!
    // Halfway between the panel's left edge and its right: the rail's width
    // to the window's width less the shell inset.
    expect(slot.style.left).toBe('calc((256px + 100% - var(--size-shell-inset)) / 2)')
    expect(slot.className.split(/\s+/)).toContain('-translate-x-1/2')

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(slot.style.left).toBe(
      'calc((var(--size-shell-inset) + 100% - var(--size-shell-inset)) / 2)'
    )
  })

  it('floats the note panel as a card under the top bar, on a shell left clear for the window’s glass', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    // The bar stands on the glass above the rail and the card alike; the card
    // is the far side of the row under it.
    const row = bar.nextElementSibling as HTMLElement
    const sidebar = screen.getByRole('complementary', { name: 'Notes' })
    expect(row.firstElementChild).toBe(sidebar)
    const card = row.lastElementChild as HTMLElement
    expect(card.contains(bar)).toBe(false)
    expect(bar.className.split(/\s+/)).toContain('h-12')
    // Inset by the shell's token, and rounded by the corner concentric with
    // the window's own — its radius less that inset (main.css). Beside the
    // open rail it keeps no left margin: the rail's own inset is that gap.
    const classes = card.className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining([
        'mb-(--size-shell-inset)',
        'mr-(--size-shell-inset)',
        'ml-0',
        'rounded-(--size-note-panel-radius)',
        'bg-canvas',
        'overflow-hidden'
      ])
    )
    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(card.className.split(/\s+/)).toContain('ml-(--size-shell-inset)')
    const shell = card.parentElement!.parentElement!
    expect(shell.className.split(/\s+/)).not.toContain('bg-canvas')
    expect(shell.className.split(/\s+/)).not.toContain('bg-surface')
    // The rail stands on the glass too: no fill, no divider of its own.
    expect(sidebar.className.split(/\s+/)).not.toContain('border-r')
    expect(sidebar.className).not.toMatch(/bg-surface/)
  })

  it('paints its own shell where the window has no glass', async () => {
    const { api } = installApi([makeNote()])
    ;(api as { platform: string }).platform = 'win32'
    render(<App />)
    const bar = await screen.findByRole('banner')
    const shell = bar.parentElement!
    expect(shell.className.split(/\s+/)).toContain('bg-surface')
  })

  it('tells main the theme, so the window’s own materials follow it', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    expect(api.theme.setSource).toHaveBeenCalledWith('system')
    await userEvent.click(screen.getByRole('button', { name: 'Dark theme' }))
    expect(api.theme.setSource).toHaveBeenLastCalledWith('dark')
  })

  it('dresses the bar’s new-note button as the round chip', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    const create = within(bar).getByRole('button', { name: 'New note' })
    const classes = create.className.split(/\s+/)
    expect(classes).toContain('rounded-full')
    expect(classes).toContain('bg-button-secondary')
    expect(classes).toContain('hover:bg-button-secondary-hover')
  })

  it('dresses the empty state new-note button as the pill the standalone CTA wears', async () => {
    installApi([])
    render(<App />)
    // The sidebar has a "New note" icon button too; the empty state's is last.
    const buttons = await screen.findAllByRole('button', { name: 'New note' })
    const classes = buttons[buttons.length - 1].className.split(/\s+/)
    expect(classes).toContain('rounded-full')
    expect(classes).toContain('bg-button-secondary')
    expect(classes).toContain('hover:bg-button-secondary-hover')
    // The 40px chip on a 12px inset, floored at 80px — the `md` text action.
    expect(classes).toContain('h-10')
    expect(classes).toContain('px-3')
    expect(classes).toContain('min-w-20')
    expect(classes).toContain('text-style-body-lg')
  })
})

// ---------------------------------------------------------------------------
// The command menu, and what asks before a note is deleted. ⌘K (or the top
// bar's search button) opens a menu of every note and the app's actions;
// picking a note opens it whatever the sidebar's filter says. A delete — from
// a row swiped aside, from its Backspace, from the menu — is confirmed first.
// ---------------------------------------------------------------------------

/** A finger dragged across the row, from `from` to `to`, then lifted. */
function swipe(element: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(element, { clientX: from, clientY: 10, pointerId: 1, button: 0 })
  fireEvent.pointerMove(element, { clientX: to, clientY: 12, pointerId: 1 })
  fireEvent.pointerUp(element, { clientX: to, clientY: 12, pointerId: 1 })
}

const menu = () => screen.getByRole('dialog', { name: 'Command menu' })

describe('App command menu', () => {
  it('opens on ⌘K with every note and the actions, and closes on ⌘K again', async () => {
    installApi([makeNote(), makeNote({ id: 'n2', title: 'Second note', tags: [] })])
    render(<App />)
    await screen.findByText('First note')
    expect(screen.queryByRole('dialog')).toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    const dialog = await screen.findByRole('dialog', { name: 'Command menu' })
    expect(await within(dialog).findByText('Second note')).toBeTruthy()
    expect(within(dialog).getByText('New note')).toBeTruthy()
    expect(within(dialog).getByText('Dark theme')).toBeTruthy()
    // Nothing is open, so nothing is offered about "this note".
    expect(within(dialog).queryByText('Delete note')).toBeNull()

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('opens from the bar’s search field, which is not a field of its own', async () => {
    installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    // No separate search: the field is the menu's one door for the mouse.
    expect(screen.queryByRole('button', { name: 'Command menu' })).toBeNull()
    const bar = screen.getByRole('banner')
    await userEvent.click(within(bar).getByRole('button', { name: 'Search notes' }))
    expect(await screen.findByRole('dialog', { name: 'Command menu' })).toBeTruthy()
  })

  it('opens on ⌘F as well, the key search has always answered to', async () => {
    installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    expect(await screen.findByRole('dialog', { name: 'Command menu' })).toBeTruthy()
  })

  it('opens a note picked from the menu and marks it in the list', async () => {
    installApi([makeNote(), makeNote({ id: 'n2', title: 'Second note', tags: [] })])
    render(<App />)
    await screen.findByText('First note')

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await userEvent.click(await within(menu()).findByText('Second note'))

    const title = await screen.findByRole('heading', { name: 'Title' })
    expect(title.textContent).toBe('Second note')
    const row = screen.getByRole('button', { name: /^Second note/ })
    expect(row.getAttribute('aria-current')).toBe('true')
  })

  it('offers what can be done to the open note, and asks before deleting it', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    await screen.findByRole('heading', { name: 'Title' })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await userEvent.click(await within(menu()).findByText('Delete note'))

    const confirm = await screen.findByRole('dialog', { name: 'Delete Note' })
    expect(within(confirm).getByText(/delete “First note”/)).toBeTruthy()
    expect(api.notes.delete).not.toHaveBeenCalled()
    await userEvent.click(within(confirm).getByRole('option', { name: /Delete/ }))
    await waitFor(() => expect(api.notes.delete).toHaveBeenCalledWith('n1'))
  })
})

describe('App delete confirmation', () => {
  it('asks before deleting a note swiped aside in the sidebar, and does nothing on Cancel', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    const row = await screen.findByRole('button', { name: /^First note/ })
    swipe(row, 200, 100)
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }))

    const confirm = await screen.findByRole('dialog', { name: 'Delete Note' })
    await userEvent.click(within(confirm).getByRole('option', { name: /Cancel/ }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.notes.delete).not.toHaveBeenCalled()
    expect(screen.getByText('First note')).toBeTruthy()
  })

  it('asks before deleting on Backspace, and deletes on Delete', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    const row = await screen.findByRole('button', { name: /^First note/ })
    fireEvent.keyDown(row, { key: 'Backspace' })
    const confirm = await screen.findByRole('dialog', { name: 'Delete Note' })
    await userEvent.click(within(confirm).getByRole('option', { name: /Delete/ }))
    await waitFor(() => expect(api.notes.delete).toHaveBeenCalledWith('n1'))
  })
})
