import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantChunk,
  AssistantMessage,
  AssistantModelCopy,
  AssistantModelStatus,
  AssistantUsage
} from '@shared/domain/assistant'
import {
  useAssistantChat,
  useAssistantEffort,
  useAssistantModel,
  useAssistantModels
} from '../use-assistant'

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
    cancelDownload: vi.fn(async () => {}),
    usage: vi.fn(
      async (): Promise<AssistantUsage> => ({
        usedTokens: 100,
        contextTokens: 1000,
        estimated: true
      })
    ),
    models: vi.fn(async (): Promise<AssistantModelCopy[]> => []),
    deleteModel: vi.fn(async (_path: string) => {}),
    messages: vi.fn(async (noteId: string) => [...(store.get(noteId) ?? [])]),
    send: vi.fn(
      async (_noteId: string, _text: string, _requestId: string, _effort: string) =>
        null as AssistantMessage | null
    ),
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

  it('cancels the download', () => {
    const { result } = renderHook(() => useAssistantModel())
    result.current.cancel()
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

    let sent!: Promise<boolean>
    act(() => {
      sent = result.current.send('  Hi  ', 'high')
    })
    await waitFor(() => expect(result.current.pending?.text).toBe('Hello'))
    expect(result.current.pending?.prompt).toBe('Hi')

    let kept = false
    await act(async () => {
      finish()
      kept = await sent
    })
    expect(kept).toBe(true)
    expect(api.assistant.send).toHaveBeenCalledWith('n1', 'Hi', expect.any(String), 'high')
    expect(result.current.pending).toBeNull()
    expect(result.current.messages.map((m) => m.content)).toEqual(['Hi', 'Hello'])
  })

  it('reports a prompt main did not keep — stopped before the download finished', async () => {
    const { result } = renderHook(() => useAssistantChat('n1'))
    let kept = true
    await act(async () => {
      kept = await result.current.send('Hi', 'medium')
    })
    expect(kept).toBe(false)
    expect(result.current.error).toBeNull()
  })

  it('counts the context the note’s next request starts with, again after each turn', async () => {
    const { result } = renderHook(() => useAssistantChat('n1'))
    await waitFor(() =>
      expect(result.current.usage).toEqual({
        usedTokens: 100,
        contextTokens: 1000,
        estimated: true
      })
    )
    api.assistant.usage.mockResolvedValue({
      usedTokens: 250,
      contextTokens: 1000,
      estimated: false
    })
    await act(async () => {
      await result.current.send('Hi', 'medium')
    })
    expect(result.current.usage?.usedTokens).toBe(250)
    expect(api.assistant.usage).toHaveBeenCalledWith('n1')
  })

  it('stops the reply in flight', async () => {
    api.assistant.send.mockImplementation(() => new Promise(() => {}))
    const { result } = renderHook(() => useAssistantChat('n1'))
    act(() => void result.current.send('Hi', 'medium'))
    await waitFor(() => expect(result.current.pending).not.toBeNull())
    act(() => result.current.stop())
    expect(api.assistant.stop).toHaveBeenCalledWith(result.current.pending!.requestId)
  })

  it('says why when the model could not answer', async () => {
    api.assistant.send.mockRejectedValue(new Error('Not enough disk space'))
    const { result } = renderHook(() => useAssistantChat('n1'))
    let kept = true
    await act(async () => {
      kept = await result.current.send('Hi', 'medium')
    })
    expect(kept).toBe(false)
    expect(result.current.error).toBe('Not enough disk space')
    expect(result.current.pending).toBeNull()
  })

  it('sends nothing blank, and nothing without a note', async () => {
    const { result, rerender } = renderHook(({ id }) => useAssistantChat(id), {
      initialProps: { id: 'n1' as string | null }
    })
    await act(async () => {
      await result.current.send('   ', 'medium')
    })
    rerender({ id: null })
    await act(async () => {
      await result.current.send('Hi', 'medium')
    })
    expect(api.assistant.send).not.toHaveBeenCalled()
  })
})

describe('useAssistantEffort', () => {
  beforeEach(() => localStorage.clear())

  it('starts at medium and remembers the choice', () => {
    const { result, unmount } = renderHook(() => useAssistantEffort())
    expect(result.current[0]).toBe('medium')
    act(() => result.current[1]('high'))
    expect(result.current[0]).toBe('high')
    unmount()
    expect(renderHook(() => useAssistantEffort()).result.current[0]).toBe('high')
  })

  it('passes over a stored value it does not know', () => {
    localStorage.setItem('assistantEffort', 'max')
    expect(renderHook(() => useAssistantEffort()).result.current[0]).toBe('medium')
  })
})

describe('useAssistantModels', () => {
  const copy: AssistantModelCopy = {
    path: '/hf/gemma.gguf',
    source: 'huggingface',
    sizeBytes: 5e9,
    deletable: true
  }

  it('lists the copies while shown, and asks nothing while hidden', async () => {
    api.assistant.models.mockResolvedValue([copy])
    const { result, rerender } = renderHook(({ shown }) => useAssistantModels(shown), {
      initialProps: { shown: false }
    })
    expect(api.assistant.models).not.toHaveBeenCalled()
    rerender({ shown: true })
    await waitFor(() => expect(result.current.copies).toEqual([copy]))
  })

  it('deletes a copy and lists again, or says why it could not', async () => {
    api.assistant.models.mockResolvedValue([copy])
    const { result } = renderHook(() => useAssistantModels(true))
    await waitFor(() => expect(result.current.copies).toHaveLength(1))

    api.assistant.models.mockResolvedValue([])
    await act(async () => {
      await result.current.remove(copy.path)
    })
    expect(api.assistant.deleteModel).toHaveBeenCalledWith(copy.path)
    expect(result.current.copies).toEqual([])

    // As Electron hands a main-side error over IPC.
    api.assistant.deleteModel.mockRejectedValue(
      new Error(
        "Error invoking remote method 'assistant:deleteModel': Error: Wait for Gemma to finish answering."
      )
    )
    await act(async () => {
      await result.current.remove(copy.path)
    })
    expect(result.current.error).toBe('Wait for Gemma to finish answering.')
  })
})
