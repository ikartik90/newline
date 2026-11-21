import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  AssistantChunk,
  AssistantMessage,
  AssistantModelStatus,
  AssistantUsage
} from '@shared/domain/assistant'
import { AssistantSidebar } from '../assistant-sidebar'

function installAssistant(initial: AssistantModelStatus, extra: Record<string, unknown> = {}) {
  localStorage.clear()
  const statusListeners = new Set<(s: AssistantModelStatus) => void>()
  const chunkListeners = new Set<(c: AssistantChunk) => void>()
  let turns: AssistantMessage[] = []
  const assistant = {
    status: vi.fn(async () => initial),
    cancelDownload: vi.fn(async () => {}),
    usage: vi.fn(
      async (): Promise<AssistantUsage> => ({
        usedTokens: 2100,
        contextTokens: 16384,
        estimated: false
      })
    ),
    models: vi.fn(async () => []),
    deleteModel: vi.fn(async () => {}),
    messages: vi.fn(async () => [...turns]),
    send: vi.fn(
      async (
        noteId: string,
        text: string,
        requestId: string,
        _effort: string
      ): Promise<AssistantMessage | null> => {
        chunkListeners.forEach((l) => l({ requestId, text: 'Sure.' }))
        turns = [
          { id: 'u', noteId, role: 'user', content: text, createdAt: 1 },
          { id: 'r', noteId, role: 'assistant', content: 'Sure.', createdAt: 2 }
        ]
        return turns[1]
      }
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
  Object.defineProperty(window, 'api', { value: { assistant, ...extra }, configurable: true })
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

  it('opens on the composer, saying the model downloads with the first message', async () => {
    const { assistant } = installAssistant({ state: 'missing' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = await screen.findByRole('textbox', { name: 'Ask Gemma' })
    expect(screen.queryByRole('button', { name: /Download/ })).toBeNull()
    const notice = screen.getByText(/downloads automatically when you send your first message/)
    expect(notice.textContent).toMatch(/5\.2 GB/)
    // The notice stands over the composer.
    expect(notice.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    fireEvent.change(box, { target: { value: 'Summarise' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(assistant.send).toHaveBeenCalledWith('n1', 'Summarise', expect.any(String), 'medium')
  })

  it('shows the download’s progress over the composer while the first message waits', async () => {
    const { assistant, emitStatus } = installAssistant({ state: 'missing' })
    assistant.send.mockImplementation(() => new Promise(() => {}))
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = await screen.findByRole('textbox', { name: 'Ask Gemma' })
    fireEvent.change(box, { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    act(() => emitStatus({ state: 'downloading', receivedBytes: 2.6e9, totalBytes: 5.2e9 }))

    expect(
      screen.getByRole('progressbar', { name: 'Model download' }).getAttribute('aria-valuenow')
    ).toBe('50')
    expect(screen.getByText(/2\.6 of 5\.2 GB/)).toBeTruthy()
    expect(screen.getByText('Waiting for the download…')).toBeTruthy()
    // The message's own Stop ends the download; there is no second way.
    expect(screen.queryByRole('button', { name: 'Cancel download' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Stop' })).toBeTruthy()
  })

  it('puts the prompt back in the box when it was stopped before the download finished', async () => {
    const { assistant, emitStatus } = installAssistant({ state: 'missing' })
    let finish!: () => void
    assistant.send.mockImplementation(
      () => new Promise((resolve) => (finish = () => resolve(null)))
    )
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = (await screen.findByRole('textbox', { name: 'Ask Gemma' })) as HTMLTextAreaElement
    fireEvent.change(box, { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(box.value).toBe('')
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(assistant.stop).toHaveBeenCalled()
    act(() => emitStatus({ state: 'missing' }))
    await act(async () => finish())
    expect(box.value).toBe('Hi')
  })

  it('cancels a download no message waits on', async () => {
    const { assistant } = installAssistant({
      state: 'downloading',
      receivedBytes: 1e9,
      totalBytes: 5.2e9
    })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Cancel download' }))
    expect(assistant.cancelDownload).toHaveBeenCalled()
  })

  it('says why a download failed, and that sending again retries it', async () => {
    installAssistant({ state: 'error', message: 'Not enough disk space' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/Not enough disk space/)
    expect(screen.getByText(/Send again to retry/)).toBeTruthy()
  })

  it('names the model under the composer, and says nothing of a download once it is there', async () => {
    installAssistant({ state: 'ready', path: '/m', source: 'lm-studio' })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    await screen.findByRole('textbox', { name: 'Ask Gemma' })
    expect(screen.getByText('Gemma 4 E4B')).toBeTruthy()
    expect(screen.queryByText(/downloads automatically/)).toBeNull()
  })

  it('picks the effort under the composer, sends with it, and remembers it', async () => {
    const { assistant } = installAssistant(ready)
    const { unmount } = render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const trigger = await screen.findByRole('button', { name: 'Effort: Medium' })
    fireEvent.click(trigger)
    fireEvent.click(await screen.findByRole('menuitem', { name: /High/ }))
    expect(screen.getByRole('button', { name: 'Effort: High' })).toBeTruthy()

    const box = screen.getByRole('textbox', { name: 'Ask Gemma' })
    fireEvent.change(box, { target: { value: 'Hi' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    expect(assistant.send).toHaveBeenCalledWith('n1', 'Hi', expect.any(String), 'high')

    unmount()
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    expect(await screen.findByRole('button', { name: 'Effort: High' })).toBeTruthy()
  })

  it('opens the effort on the window’s glass, over its button, where there is that glass', async () => {
    let picked: ((id: string) => void) | undefined
    const glassMenu = {
      native: true,
      open: vi.fn(),
      onPicked: vi.fn((listener: (id: string) => void) => {
        picked = listener
        return () => {}
      }),
      onClosed: vi.fn(() => () => {}),
      onShow: vi.fn(() => () => {}),
      setHeight: vi.fn(),
      pick: vi.fn(),
      close: vi.fn()
    }
    installAssistant(ready, { glassMenu })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const trigger = await screen.findByRole('button', { name: 'Effort: Medium' })
    fireEvent.click(trigger)
    expect(screen.queryByRole('menu')).toBeNull()
    expect(trigger.className.split(/\s+/)).toContain('data-[popup-open]:opacity-0')
    expect(glassMenu.open).toHaveBeenCalledWith(
      expect.objectContaining({
        side: 'over',
        items: [
          { id: 'low', label: 'Low' },
          { id: 'medium', label: 'Medium' },
          { id: 'high', label: 'High' }
        ]
      })
    )
    act(() => picked?.('high'))
    expect(screen.getByRole('button', { name: 'Effort: High' })).toBeTruthy()
  })

  it('stacks the conversation up from the box, fading the sheet in under it on the glass', async () => {
    installAssistant(ready, { frosted: true })
    const { container } = render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    await screen.findByRole('textbox', { name: 'Ask Gemma' })
    const fade = container.querySelector('[data-rail-fade]')
    expect(fade?.className).toContain('to-bg-sheet')
    expect(fade?.getAttribute('aria-hidden')).toBe('true')
    // The conversation sits on the box, so the fade grows upward with it.
    const hint = screen.getByText(/Ask about this note:/)
    expect(hint.parentElement?.className).toContain('mt-auto')
  })

  it('draws no fade where the rail is the solid sheet', async () => {
    installAssistant(ready)
    const { container } = render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    await screen.findByRole('textbox', { name: 'Ask Gemma' })
    expect(container.querySelector('[data-rail-fade]')).toBeNull()
  })

  it('starts the box on one line, growing to five before it scrolls', async () => {
    installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = (await screen.findByRole('textbox', { name: 'Ask Gemma' })) as HTMLTextAreaElement
    expect(box.rows).toBe(1)
    const classes = box.className.split(/\s+/)
    expect(classes).toContain('field-sizing-content')
    expect(classes).toContain('max-h-[calc(4lh+var(--size-toolbar-button))]')
    expect(classes).toContain('overflow-y-auto')
  })

  it('meters the context the next request starts with as a bare ring', async () => {
    installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const meter = await screen.findByRole('meter', { name: 'Context used' })
    await waitFor(() => expect(meter.getAttribute('aria-valuenow')).toBe('2100'))
    expect(meter.getAttribute('aria-valuemax')).toBe('16384')
    expect(meter.getAttribute('aria-valuetext')).toBe('2,100 of 16,384 tokens (13%)')
    expect(meter.textContent).toBe('')
    expect(meter.querySelector('svg')).not.toBeNull()
  })

  it('marks an estimated count as such', async () => {
    const { assistant } = installAssistant({ state: 'missing' })
    assistant.usage.mockResolvedValue({ usedTokens: 900, contextTokens: 16384, estimated: true })
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const meter = await screen.findByRole('meter', { name: 'Context used' })
    await waitFor(() =>
      expect(meter.getAttribute('aria-valuetext')).toBe('About 900 of 16,384 tokens (5%)')
    )
    expect(meter.textContent).toBe('')
  })

  it('asks for a note when none is open, keeping the box but closing it', async () => {
    installAssistant(ready)
    render(<AssistantSidebar noteId={null} onInsert={onInsert} />)
    const box = (await screen.findByRole('textbox', { name: 'Ask Gemma' })) as HTMLTextAreaElement
    expect(box.disabled).toBe(true)
    expect(box.placeholder).toBe('Open a note to ask Gemma about it.')
  })

  it('sends on Enter, keeps Shift+Enter for a new line, and shows the reply', async () => {
    const { assistant } = installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = (await screen.findByRole('textbox', { name: 'Ask Gemma' })) as HTMLTextAreaElement

    fireEvent.change(box, { target: { value: 'Summarise' } })
    fireEvent.keyDown(box, { key: 'Enter', shiftKey: true })
    expect(assistant.send).not.toHaveBeenCalled()
    fireEvent.keyDown(box, { key: 'Enter' })

    expect(assistant.send).toHaveBeenCalledWith('n1', 'Summarise', expect.any(String), 'medium')
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

  it('draws a reply’s actions small, and offers no way to clear the conversation', async () => {
    installAssistant(ready)
    render(<AssistantSidebar noteId="n1" onInsert={onInsert} />)
    const box = await screen.findByRole('textbox', { name: 'Ask Gemma' })
    fireEvent.change(box, { target: { value: 'Draft' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send' }))
    await screen.findByText('Sure.')

    const actions = screen.getByRole('button', { name: 'Copy reply' }).parentElement
    expect(actions?.className).toContain('[&_button_svg]:size-4')
    expect(screen.queryByRole('button', { name: /clear/i })).toBeNull()
  })
})
