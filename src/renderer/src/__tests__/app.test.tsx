import React from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { serializeDocument } from '@shared/domain/document'
import App from '../App'

// ---------------------------------------------------------------------------
// The app shell end to end in jsdom: a signed-in user, a fake main process
// behind `window.api`, and the real editor. What is checked is the wiring —
// that a note opens in the editor, that an edit reaches SQLite and the sync
// push, and that the properties rail edits tags.
// ---------------------------------------------------------------------------

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'me@example.com' },
    loading: false,
    logout: vi.fn()
  })
}))

const sync = vi.hoisted(() => ({
  startSyncService: vi.fn(),
  stopSyncService: vi.fn(),
  pushNoteNow: vi.fn(async () => true)
}))
vi.mock('@/lib/sync-service', () => sync)

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
  const api = {
    platform: 'darwin',
    notes: {
      list: vi.fn(async () => notes),
      search: vi.fn(async () => notes),
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
      delete: vi.fn(async () => {}),
      upsertFromRemote: vi.fn(async () => {}),
      markSynced: vi.fn(async () => {}),
      dirty: vi.fn(async () => [])
    },
    sync: { status: vi.fn(async () => ({ pendingCount: 0, failedCount: 0, lastSyncedAt: null })) },
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
    auth: { googleSignIn: vi.fn() }
  }
  Object.defineProperty(window, 'api', { value: api, writable: true, configurable: true })
  return api
}

describe('App', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lists notes and starts the sync service for the signed-in user', async () => {
    installApi([makeNote()])
    render(<App />)
    expect(await screen.findByText('First note')).toBeTruthy()
    expect(sync.startSyncService).toHaveBeenCalledWith('u1')
  })

  it('opens a note in the editor with its title and body', async () => {
    installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    const title = await screen.findByRole('heading', { name: 'Title' })
    expect(title.textContent).toBe('First note')
    expect(screen.getByText('Hello there')).toBeTruthy()
  })

  it('writes an edit to the note and pushes it, reporting the save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    try {
      const api = installApi([makeNote()])
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
      await waitFor(() => expect(sync.pushNoteNow).toHaveBeenCalled())
    } finally {
      vi.useRealTimers()
    }
  })

  it('edits tags from the properties rail', async () => {
    const api = installApi([makeNote()])
    render(<App />)
    await userEvent.click(await screen.findByText('First note'))
    await userEvent.click(await screen.findByRole('button', { name: 'Note properties' }))
    await userEvent.type(await screen.findByLabelText('Add tag'), 'ideas{enter}')
    await waitFor(() =>
      expect(api.notes.update).toHaveBeenCalledWith('n1', { tags: ['work', 'ideas'] })
    )
  })

  it('creates a new note from the empty state and opens it', async () => {
    const api = installApi([])
    render(<App />)
    // The sidebar has a "New note" icon button too; the empty state's is last.
    const buttons = await screen.findAllByRole('button', { name: 'New note' })
    await userEvent.click(buttons[buttons.length - 1])
    expect(api.notes.create).toHaveBeenCalled()
    expect(await screen.findByRole('heading', { name: 'Title' })).toBeTruthy()
  })
})
