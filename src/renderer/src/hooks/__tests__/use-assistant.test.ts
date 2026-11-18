import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantChunk,
  AssistantMessage,
  AssistantModelStatus
} from '@shared/domain/assistant'
import { useAssistantChat, useAssistantModel } from '../use-assistant'

const message = (over: Partial<AssistantMessage>): AssistantMessage => ({
  id: 'm',
  noteId: 'n1',
  role: 'user',
  content: '',
  createdAt: 1,
  ...over
})

function installAssistant() {
  const statusListeners = new Set<(s: AssistantModelStatus) => void>()
  const chunkListeners = new Set<(c: AssistantChunk) => void>()
  const store = new Map<string, AssistantMessage[]>()
  const assistant = {
    status: vi.fn(async (): Promise<AssistantModelStatus> => ({ state: 'missing' })),
    download: vi.fn(async () => {}),
    cancelDownload: vi.fn(async () => {}),
    messages: vi.fn(async (noteId: string) => [...(store.get(noteId) ?? [])]),
    clear: vi.fn(async (noteId: string) => {
      store.delete(noteId)
    }),
    send: vi.fn(async (_noteId: string, _text: string, _requestId: string) => null),
    stop: vi.fn(async () => {}),
    onStatus: vi.fn((l: (s: AssistantModelStatus) => void) => {
      statusListeners.add(l)
      return () => statusListeners.delete(l)
    }),
    onChunk: vi.fn((l: (c: AssistantChunk) => void) => {
      chunkListeners.add(l)
      return () => chunkListeners.delete(l)
    })
  }
  Object.defineProperty(window, 'api', { value: { assistant }, configurable: true })
  return {
    assistant,
    store,
    emitStatus: (s: AssistantModelStatus) => statusListeners.forEach((l) => l(s)),
    emitChunk: (c: AssistantChunk) => chunkListeners.forEach((l) => l(c))
  }
}

let api: ReturnType<typeof installAssistant>
beforeEach(() => {
  api = installAssistant()
})

describe('useAssistantModel', () => {
  it('asks main for the status, then follows its changes', async () => {
    const { result } = renderHook(() => useAssistantModel())
    await waitFor(() => expect(result.current.status).toEqual({ state: 'missing' }))
    act(() => api.emitStatus({ state: 'downloading', receivedBytes: 5, totalBytes: 10 }))
    expect(result.current.status).toEqual({
      state: 'downloading',
      receivedBytes: 5,
      totalBytes: 10
    })
  })

  it('starts and cancels the download', () => {
    const { result } = renderHook(() => useAssistantModel())
    result.current.download()
    result.current.cancel()
    expect(api.assistant.download).toHaveBeenCalled()
    expect(api.assistant.cancelDownload).toHaveBeenCalled()
  })
})

describe('useAssistantChat', () => {
  it('loads the note’s turns, and another note’s when it changes', async () => {
    api.store.set('n1', [message({ id: 'a', content: 'One' })])
    api.store.set('n2', [message({ id: 'b', noteId: 'n2', content: 'Two' })])
    const { result, rerender } = renderHook(({ id }) => useAssistantChat(id), {
      initialProps: { id: 'n1' as string | null }
    })
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['One']))
    rerender({ id: 'n2' })
    await waitFor(() => expect(result.current.messages.map((m) => m.content)).toEqual(['Two']))
  })

  it('streams the reply into the pending turn, then shows what main kept', async () => {
    let finish!: () => void
    api.assistant.send.mockImplementation(async (noteId, text, requestId) => {
      api.emitChunk({ requestId, text: 'Hel' })
      api.emitChunk({ requestId: 'someone-else', text: 'x' })
      api.emitChunk({ requestId, text: 'lo' })
      await new Promise<void>((resolve) => (finish = resolve))
      api.store.set(noteId, [
        message({ id: 'u', content: text }),
        message({ id: 'r', role: 'assistant', content: 'Hello' })
      ])
      return null
    })
    const { result } = renderHook(() => useAssistantChat('n1'))
    await waitFor(() => expect(api.assistant.messages).toHaveBeenCalled())

    let sent!: Promise<void>
    act(() => {
      sent = result.current.send('  Hi  ')
    })
    await waitFor(() => expect(result.current.pending?.text).toBe('Hello'))
    expect(result.current.pending?.prompt).toBe('Hi')

    await act(async () => {
      finish()
      await sent
    })
    expect(result.current.pending).toBeNull()
    expect(result.current.messages.map((m) => m.content)).toEqual(['Hi', 'Hello'])
  })

  it('stops the reply in flight', async () => {
    api.assistant.send.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useAssistantChat('n1'))
    act(() => void result.current.send('Hi'))
    await waitFor(() => expect(result.current.pending).not.toBeNull())
    act(() => result.current.stop())
    expect(api.assistant.stop).toHaveBeenCalledWith(result.current.pending!.requestId)
  })

  it('says why when the model could not answer', async () => {
    api.assistant.send.mockRejectedValue(new Error('The model is not downloaded yet.'))
    const { result } = renderHook(() => useAssistantChat('n1'))
    await act(async () => {
      await result.current.send('Hi')
    })
    expect(result.current.error).toBe('The model is not downloaded yet.')
    expect(result.current.pending).toBeNull()
  })

  it('sends nothing blank, and nothing without a note', async () => {
    const { result, rerender } = renderHook(({ id }) => useAssistantChat(id), {
      initialProps: { id: 'n1' as string | null }
    })
    await act(async () => {
      await result.current.send('   ')
    })
    rerender({ id: null })
    await act(async () => {
      await result.current.send('Hi')
    })
    expect(api.assistant.send).not.toHaveBeenCalled()
  })

  it('clears the conversation', async () => {
    api.store.set('n1', [message({ content: 'One' })])
    const { result } = renderHook(() => useAssistantChat('n1'))
    await waitFor(() => expect(result.current.messages).toHaveLength(1))
    await act(async () => {
      await result.current.clear()
    })
    expect(result.current.messages).toEqual([])
  })
})
