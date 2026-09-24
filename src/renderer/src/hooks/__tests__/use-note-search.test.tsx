import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useNoteSearch } from '../use-note-search'

function makeNote(id: string, title: string): Note {
  return {
    id,
    title,
    body: '{"type":"doc","content":[]}',
    plainText: '',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    lastSyncedAt: null,
    isDeleted: false
  }
}

/** A promise the test resolves by hand, to stage which answer lands first. */
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const all = [makeNote('a', 'Apples'), makeNote('b', 'Bread')]
const list = vi.fn()
const search = vi.fn()
const originalApi = window.api

beforeEach(() => {
  list.mockReset().mockResolvedValue(all)
  search.mockReset().mockResolvedValue([all[1]])
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin', notes: { list, search } },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
})

describe('useNoteSearch', () => {
  it('lists every note for an empty query', async () => {
    const { result } = renderHook(() => useNoteSearch(''))
    expect(result.current).toEqual([])
    await waitFor(() => expect(result.current).toEqual(all))
    expect(list).toHaveBeenCalledTimes(1)
    expect(search).not.toHaveBeenCalled()
  })

  it('treats a query of spaces as empty', async () => {
    const { result } = renderHook(() => useNoteSearch('   '))
    await waitFor(() => expect(result.current).toEqual(all))
    expect(search).not.toHaveBeenCalled()
  })

  it('asks main to search for a query', async () => {
    const { result } = renderHook(() => useNoteSearch('bre'))
    await waitFor(() => expect(result.current).toEqual([all[1]]))
    expect(search).toHaveBeenCalledWith('bre')
  })

  it('shows the answer to the latest query even when an earlier one lands later', async () => {
    const first = deferred<Note[]>()
    const second = deferred<Note[]>()
    search.mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)

    const { result, rerender } = renderHook(({ query }) => useNoteSearch(query), {
      initialProps: { query: 'a' }
    })
    rerender({ query: 'ap' })

    await act(async () => {
      second.resolve([all[0]])
    })
    await act(async () => {
      first.resolve([all[1]])
    })
    expect(result.current).toEqual([all[0]])
  })
})
