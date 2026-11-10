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
  const fullScreenListeners = new Set<(fullScreen: boolean) => void>()
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
    window: {
      isFullScreen: vi.fn(async () => false),
      onFullScreenChange: vi.fn((listener: (fullScreen: boolean) => void) => {
        fullScreenListeners.add(listener)
        return () => {
          fullScreenListeners.delete(listener)
        }
      })
    },
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
  /** What main does when the window enters or leaves full screen. */
  const setFullScreen = (fullScreen: boolean) =>
    act(() => fullScreenListeners.forEach((listener) => listener(fullScreen)))
  return { api, notifyChanged, changeListeners, setFullScreen }
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists notes and asks main for a sync cycle for the signed-in user', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    expect(await screen.findByText('First note')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Account' }).textContent).toContain('me')
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
    // The gear is the app's settings now; a note's own are in the command menu.
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await userEvent.click(await screen.findByRole('option', { name: /Note properties/ }))
    await userEvent.type(await screen.findByLabelText('Add tag'), 'ideas{enter}')
    await waitFor(() =>
      expect(api.notes.update).toHaveBeenCalledWith('n1', { tags: ['work', 'ideas'] })
    )
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
// The shell's chrome. One top bar is fixed across the window and holds only
// the sidebar toggle, beside the window's own controls. The sidebar is headed
// by New note and Search and footed by the account and the app's settings.
// The note pane runs to the window's edges, its spacing inside it.
// ---------------------------------------------------------------------------

const classesOf = (element: Element) => element.className.split(/\s+/)
const hasMargin = (element: Element) =>
  classesOf(element).some((c) => /^-?m[trblxy]?-/.test(c) || /^-?m[se]-/.test(c))

describe('App chrome', () => {
  it('holds only the sidebar toggle in the top bar', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    const buttons = within(bar).getAllByRole('button')
    expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Collapse sidebar'])
    expect(screen.getByRole('complementary', { name: 'Notes' }).contains(bar)).toBe(false)
  })

  it('inks the sidebar toggle and the settings gear as the sidebar inks its labels', async () => {
    installApi([makeNote()])
    render(<App />)
    for (const name of ['Collapse sidebar', 'Settings']) {
      const button = await screen.findByRole('button', { name })
      expect(classesOf(button)).toContain('text-fg')
      expect(classesOf(button)).not.toContain('text-fg-body')
    }
  })

  it('fixes the bar over the top of the window, so what scrolls passes under it', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    expect(classesOf(bar)).toEqual(expect.arrayContaining(['absolute', 'top-0', 'h-12']))
    await userEvent.click(screen.getByText('First note'))
    // The note scrolls in its own region, under the bar's 48px.
    const main = screen.getByRole('main')
    expect(classesOf(main)).toContain('overflow-y-auto')
    expect(bar.contains(main)).toBe(false)
  })

  // A dialog's backdrop blur can't hide what stands on the clear glass, so
  // those layers are marked to blur themselves (main.css). The note pane is
  // opaque and is left to the backdrop.
  it('marks the top bar and the sidebar as standing on the glass, and not the note pane', async () => {
    installApi([makeNote()])
    render(<App />)
    const bar = await screen.findByRole('banner')
    expect(bar.hasAttribute('data-on-glass')).toBe(true)
    const sidebar = screen.getByRole('complementary', { name: 'Notes' })
    expect(sidebar.hasAttribute('data-on-glass')).toBe(true)
    await userEvent.click(screen.getByText('First note'))
    expect(screen.getByRole('main').closest('[data-on-glass]')).toBeNull()
  })

  it('collapses and expands the sidebar, the toggle staying put beside the window controls', async () => {
    installApi([makeNote()])
    render(<App />)
    expect(await screen.findByRole('button', { name: /^First note/ })).toBeTruthy()

    // A plain switch: its name says what a press does, and it wears no chip
    // for the rail being open.
    const shown = screen.getByRole('button', { name: 'Collapse sidebar' })
    expect(shown.hasAttribute('aria-pressed')).toBe(false)
    expect(classesOf(shown).some((c) => c.includes('aria-pressed'))).toBe(false)
    // Past the traffic lights macOS draws over the window's top-left corner,
    // by the same gap that parts the lights themselves.
    const slot = shown.parentElement!
    expect(classesOf(slot)).toContain('pl-[85px]')

    await userEvent.click(shown)
    expect(screen.queryByRole('button', { name: /^First note/ })).toBeNull()
    const hidden = screen.getByRole('button', { name: 'Expand sidebar' })
    expect(hidden.parentElement).toBe(slot)

    await userEvent.click(hidden)
    expect(await screen.findByRole('button', { name: /^First note/ })).toBeTruthy()
  })

  it('puts the toggle at the bar’s edge where the window draws no controls over it', async () => {
    const { api } = installApi([makeNote()])
    ;(api as { platform: string }).platform = 'win32'
    render(<App />)
    const toggle = await screen.findByRole('button', { name: 'Collapse sidebar' })
    expect(classesOf(toggle.parentElement!)).toContain('pl-[9px]')
  })

  it('moves the toggle into the lights’ place in full screen, where the OS hides them', async () => {
    const { setFullScreen } = installApi([makeNote()])
    render(<App />)
    const slot = (await screen.findByRole('button', { name: 'Collapse sidebar' })).parentElement!
    expect(classesOf(slot)).toContain('pl-[85px]')

    // Its glyph's centre on the head rows' glyphs': 9 + 28 / 2 = 23.
    setFullScreen(true)
    expect(classesOf(slot)).toContain('pl-[9px]')
    expect(classesOf(slot)).not.toContain('pl-[85px]')

    setFullScreen(false)
    expect(classesOf(slot)).toContain('pl-[85px]')
  })

  it('starts in the lights’ place when the window opens already in full screen', async () => {
    const { api } = installApi([makeNote()])
    api.window.isFullScreen.mockResolvedValue(true)
    render(<App />)
    const slot = (await screen.findByRole('button', { name: 'Collapse sidebar' })).parentElement!
    await waitFor(() => expect(classesOf(slot)).toContain('pl-[9px]'))
  })

  it('heads the sidebar with New note and Search, and opens the command menu from Search', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Search' }))
    expect(screen.getByRole('dialog', { name: 'Command menu' })).toBeTruthy()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await userEvent.click(within(sidebar).getByRole('button', { name: 'New note' }))
    expect(api.notes.create).toHaveBeenCalled()
  })

  it('foots the sidebar with the account, which signs out', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Account' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(auth.logout).toHaveBeenCalled()
  })

  it('opens the app’s settings from the sidebar’s gear, where the theme is chosen', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Settings' }))
    const dialog = await screen.findByRole('dialog', { name: 'Settings' })
    await userEvent.click(within(dialog).getByRole('option', { name: 'Dark' }))
    expect(api.theme.setSource).toHaveBeenLastCalledWith('dark')
  })

  it('rounds the icon buttons as the sidebar’s rows are, a 12px squircle', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    const buttons = [
      within(sidebar).getByRole('button', { name: 'Settings' }),
      screen.getByRole('button', { name: 'Collapse sidebar' })
    ]
    for (const button of buttons) {
      const classes = button.className.split(/\s+/)
      expect(classes).toContain('rounded-lg')
      expect(classes).toContain('squircle')
    }
  })

  it('runs the note pane to the window’s edges, its spacing inside it', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    // Past the divider's handle, which stands on the pane's edge.
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    const pane = handle.parentElement!.nextElementSibling as HTMLElement
    expect(classesOf(pane)).toContain('border-divider')
    expect(hasMargin(pane)).toBe(false)
    expect(classesOf(pane)).toContain('bg-canvas')
    expect(classesOf(pane).some((c) => c.startsWith('rounded'))).toBe(false)
    // Its own first 48px are under the bar.
    expect(classesOf(pane)).toContain('pt-12')
    expect(hasMargin(sidebar)).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(hasMargin(pane)).toBe(false)
  })

  it('makes the divider between the rail and the note pane a handle that resizes the rail', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    const handle = screen.getByRole('separator', { name: 'Resize sidebar' })
    // It stands between the rail and the pane, the window's full height, and
    // lights in the brand's ink when the pointer is over it.
    expect(sidebar.nextElementSibling).toBe(handle.parentElement)
    expect(classesOf(handle)).toEqual(expect.arrayContaining(['cursor-col-resize', 'inset-y-0']))
    expect(handle.querySelector('.group-hover\\:bg-fg-highlight')).not.toBeNull()

    const shell = screen.getByRole('banner').parentElement!
    expect(shell.style.getPropertyValue('--size-sidebar')).toBe('256px')
    expect(classesOf(sidebar)).toContain('w-(--size-sidebar)')

    fireEvent.pointerDown(handle, { clientX: 256, pointerId: 1, button: 0 })
    fireEvent.pointerMove(handle, { clientX: 300, pointerId: 1 })
    // The rail follows the pointer at once, not on its 200ms width transition.
    expect(shell.style.getPropertyValue('--size-sidebar')).toBe('300px')
    expect(classesOf(sidebar)).not.toContain('transition-[width,filter]')
    fireEvent.pointerUp(handle, { clientX: 300, pointerId: 1 })
    expect(classesOf(sidebar)).toContain('transition-[width,filter]')
    expect(localStorage.getItem('sidebarWidth')).toBe('300')

    await userEvent.click(screen.getByRole('button', { name: 'Collapse sidebar' }))
    expect(screen.queryByRole('separator', { name: 'Resize sidebar' })).toBeNull()
  })

  it('leaves the shell clear for the window’s glass on macOS', async () => {
    installApi([makeNote()])
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    const shell = sidebar.parentElement!
    expect(classesOf(shell)).not.toContain('bg-surface')
    expect(sidebar.className).not.toMatch(/bg-surface/)
  })

  it('paints its own shell where the window has no glass', async () => {
    const { api } = installApi([makeNote()])
    ;(api as { platform: string }).platform = 'win32'
    render(<App />)
    const sidebar = await screen.findByRole('complementary', { name: 'Notes' })
    expect(classesOf(sidebar.parentElement!)).toContain('bg-surface')
  })

  it('tells main the theme, so the window’s own materials follow it', async () => {
    const { api } = installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    expect(api.theme.setSource).toHaveBeenCalledWith('system')
  })

  it('dresses the empty state new-note button as the pill the standalone CTA wears', async () => {
    installApi([])
    render(<App />)
    // The sidebar has a "New note" row too; the empty state's is last.
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

  it('opens from the sidebar’s Search row', async () => {
    installApi([makeNote()])
    render(<App />)
    await screen.findByText('First note')
    // Search is the menu's one door for the mouse, not a menu of its own.
    expect(screen.queryByRole('button', { name: 'Command menu' })).toBeNull()
    const sidebar = screen.getByRole('complementary', { name: 'Notes' })
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Search' }))
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

  it('keeps Delete note off the bottom row: the theme is last, under Settings', async () => {
    installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    await screen.findByRole('heading', { name: 'Title' })

    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    await within(menu()).findByText('Delete note')
    const options = within(menu()).getAllByRole('option')
    expect(options[options.length - 1].getAttribute('data-value')).toBe('action:theme')
    const settings = within(menu()).getByText('Settings').parentElement!
    expect(within(settings).getByText('Dark theme')).toBeTruthy()
    expect(within(settings).queryByText('Delete note')).toBeNull()
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
