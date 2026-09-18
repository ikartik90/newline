import React from 'react'
import { act, render, screen, waitFor, within } from '@testing-library/react'
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
      search: vi.fn(async () => [...notes]),
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
