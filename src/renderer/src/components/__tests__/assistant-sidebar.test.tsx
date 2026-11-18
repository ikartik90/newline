import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantChunk,
  AssistantMessage,
  AssistantModelStatus
} from '@shared/domain/assistant'
import { AssistantSidebar } from '../assistant-sidebar'

function installAssistant(initial: AssistantModelStatus) {
  const statusListeners = new Set<(s: AssistantModelStatus) => void>()
  const chunkListeners = new Set<(c: AssistantChunk) => void>()
  let turns: AssistantMessage[] = []
  const assistant = {
    status: vi.fn(async () => initial),
    download: vi.fn(async () => {}),
    cancelDownload: vi.fn(async () => {}),
    messages: vi.fn(async () => [...turns]),
    clear: vi.fn(async () => {
      turns = []
    }),
    send: vi.fn(async (noteId: string, text: string, requestId: string) => {
      chunkListeners.forEach((l) => l({ requestId, text: 'Sure.' }))
      turns = [
        { id: 'u', noteId, role: 'user', content: text, createdAt: 1 },
        { id: 'r', noteId, role: 'assistant', content: 'Sure.', createdAt: 2 }
      ]
      return turns[1]
    }),
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
    emitStatus: (s: AssistantModelStatus) => statusListeners.forEach((l) => l(s))
  }
}

const ready: AssistantModelStatus = { state: 'ready', path: '/m.gguf', source: 'huggingface' }

describe('AssistantSidebar', () => {
  let onInsert: ReturnType<typeof vi.fn<(markdown: string) => void>>
  beforeEach(() => {
    onInsert = vi.fn<(markdown: string) => void>()
  })

  it('offers the download, and fetches nothing until asked', async () => {
    const { assistant } = installAssistant({ state: 'missing' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const button = await screen.findByRole('button', { name: /Download · 5\.2 GB/ })
    expect(screen.getByText(/runs entirely on this computer/)).toBeTruthy()
    expect(assistant.download).not.toHaveBeenCalled()
    fireEvent.click(button)
    expect(assistant.download).toHaveBeenCalledTimes(1)
  })

  it('shows the download’s progress, and cancels it', async () => {
    const { assistant, emitStatus } = installAssistant({ state: 'missing' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    await screen.findByRole('button', { name: /Download/ })
    act(() => emitStatus({ state: 'downloading', receivedBytes: 2.6e9, totalBytes: 5.2e9 }))

    expect(
      screen.getByRole('progressbar', { name: 'Model download' }).getAttribute('aria-valuenow')
    ).toBe('50')
    expect(screen.getByText('2.6 GB of 5.2 GB')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(assistant.cancelDownload).toHaveBeenCalled()
  })

  it('says why a download failed, and offers it again', async () => {
    installAssistant({ state: 'error', message: 'Not enough disk space' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    expect((await screen.findByRole('alert')).textContent).toBe('Not enough disk space')
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy()
  })

  it('names the app whose copy it is using', async () => {
    installAssistant({ state: 'ready', path: '/m', source: 'lm-studio' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    expect(await screen.findByText('Gemma 4 E4B · from LM Studio')).toBeTruthy()
  })

  it('asks for a note when none is open', async () => {
    installAssistant(ready)
    render(<AssistantSidebar noteId={null} onInsert={onInsert} />)
    expect(await screen.findByText('Open a note to ask Gemma about it.')).toBeTruthy()
  })

  it('sends on Enter, keeps Shift+Enter for a new line, and shows the reply', async () => {
    const { assistant } = installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = (await screen.findByRole('textbox', { name: 'Ask Gemma' })) as HTMLTextAreaElement

    fireEvent.change(box, { target: { value: 'Summarise' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(assistant.send).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(assistant.send).toHaveBeenCalledWith('n1', 'Summarise', expect.any(String))
    expect(await screen.findByText('Sure.')).toBeTruthy()
    expect(box.value).toBe('')
  })

  it('puts a reply into the note, or on the clipboard', async () => {
    installAssistant(ready)
    const writeText = vi.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = await screen.findByRole('textbox', { name: 'Ask Gemma' })
    fireEvent.change(box, { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Sure.')

    fireEvent.click(screen.getByRole('button', { name: 'Insert into note' }))
    expect(onInsert).toHaveBeenCalledWith('Sure.')
    fireEvent.click(screen.getByRole('button', { name: 'Copy reply' }))
    expect(writeText).toHaveBeenCalledWith('Sure.')
  })

  it('clears the conversation', async () => {
    const { assistant } = installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = await screen.findByRole('textbox', { name: 'Ask Gemma' })
    fireEvent.change(box, { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Sure.')

    fireEvent.click(screen.getByRole('button', { name: 'Clear conversation' }))
    await waitFor(() => expect(screen.queryByText('Sure.')).toBeNull())
    expect(assistant.clear).toHaveBeenCalledWith('n1')
  })
})
