import { mkdtempSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GEMMA_MODEL } from '@shared/domain/assistant'
import { serializeDocument } from '@shared/domain/document'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))

vi.mock('../../db/database', async () => {
  const { openMigratedDb } = await import('../../db/__tests__/test-db')
  const db = openMigratedDb()
  return { getDb: () => db, initDatabase: () => db, closeDatabase: () => {} }
})

const locate = vi.fn()
vi.mock('../model-locator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model-locator')>()),
  locateGemmaModel: (...args: unknown[]) => locate(...args)
}))

const download = vi.fn()
vi.mock('../model-download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model-download')>()),
  downloadModel: (...args: unknown[]) => download(...args)
}))

const generate = vi.fn()
vi.mock('../llama-engine', () => ({
  generate: (...args: unknown[]) => generate(...args),
  disposeEngine: async () => {}
}))

type Assistant = typeof import('../assistant')
type Notes = typeof import('../notes')
let assistant: Assistant
let notes: Notes

const body = (text: string) =>
  serializeDocument({
    type: 'doc',
    content: [{ type: 'paragraph', children: [{ type: 'text', text }] }]
  })

beforeEach(async () => {
  vi.resetModules()
  locate.mockReset().mockResolvedValue(null)
  download.mockReset()
  generate.mockReset()
  assistant = await import('../assistant')
  notes = await import('../notes')
  const { getDb } = await import('../../db/database')
  getDb().exec('DELETE FROM notes; DELETE FROM assistant_messages; DELETE FROM sync_queue')
})

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('model status', () => {
  it('is missing until a copy is on disk', async () => {
    expect(await assistant.getModelStatus()).toEqual({ state: 'missing' })
  })

  it('is ready with another app’s copy, naming where it came from', async () => {
    locate.mockResolvedValue({ path: '/lm/gemma.gguf', source: 'lm-studio' })
    expect(await assistant.getModelStatus()).toEqual({
      state: 'ready',
      path: '/lm/gemma.gguf',
      source: 'lm-studio'
    })
  })

  it('downloads into the Hugging Face cache, reporting progress, then is ready', async () => {
    let finish!: (path: string) => void
    download.mockImplementation(({ onProgress }) => {
      onProgress(0, GEMMA_MODEL.size)
      return new Promise<string>((resolve) => (finish = resolve))
    })
    const seen: unknown[] = []
    assistant.onModelStatus((status) => seen.push(status))

    assistant.startModelDownload()
    expect(await assistant.getModelStatus()).toEqual({
      state: 'downloading',
      receivedBytes: 0,
      totalBytes: GEMMA_MODEL.size
    })
    expect(download.mock.calls[0][0]).toMatchObject({ spec: GEMMA_MODEL })
    expect(download.mock.calls[0][0].hubDir).toMatch(/huggingface[/\\]hub$/)

    const downloaded = join(mkdtempSync(join(tmpdir(), 'hub-')), 'gemma.gguf')
    writeFileSync(downloaded, 'GGUF')
    finish(downloaded)
    await flush()
    expect(await assistant.getModelStatus()).toEqual({
      state: 'ready',
      path: downloaded,
      source: 'huggingface'
    })
    expect(seen.at(-1)).toEqual({
      state: 'ready',
      path: downloaded,
      source: 'huggingface'
    })
  })

  it('does not start a second download while one runs', () => {
    download.mockReturnValue(new Promise(() => {}))
    assistant.startModelDownload()
    assistant.startModelDownload()
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('goes back to missing when cancelled, and to an error when the download fails', async () => {
    download.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        )
    )
    assistant.startModelDownload()
    assistant.cancelModelDownload()
    await flush()
    expect(await assistant.getModelStatus()).toEqual({ state: 'missing' })

    download.mockRejectedValue(new Error('Not enough disk space'))
    assistant.startModelDownload()
    await flush()
    expect(await assistant.getModelStatus()).toEqual({
      state: 'error',
      message: 'Not enough disk space'
    })
  })
})

describe('conversation', () => {
  beforeEach(() => {
    locate.mockResolvedValue({ path: '/m.gguf', source: 'huggingface' })
  })

  it('answers about the note, streaming the reply, and keeps both turns', async () => {
    const note = notes.createNote('Trip', body('Pack the tent.'))
    generate.mockImplementation(async ({ onChunk }) => {
      onChunk('Bring ')
      onChunk('stakes.')
      return 'Bring stakes.'
    })
    const chunks: string[] = []

    const reply = await assistant.sendMessage(note.id, 'What am I missing?', 'r1', (t) =>
      chunks.push(t)
    )

    expect(chunks).toEqual(['Bring ', 'stakes.'])
    expect(reply).toMatchObject({ noteId: note.id, role: 'assistant', content: 'Bring stakes.' })
    const call = generate.mock.calls[0][0]
    expect(call.modelPath).toBe('/m.gguf')
    expect(call.prompt).toBe('What am I missing?')
    expect(call.system).toContain('Trip')
    expect(call.system).toContain('Pack the tent.')
    expect(call.history).toEqual([])
    expect(assistant.listMessages(note.id).map((m) => [m.role, m.content])).toEqual([
      ['user', 'What am I missing?'],
      ['assistant', 'Bring stakes.']
    ])
  })

  it('reads the note as it is now, and hands over the earlier turns', async () => {
    const note = notes.createNote('Trip', body('Pack the tent.'))
    generate.mockResolvedValue('Ok.')
    await assistant.sendMessage(note.id, 'First', 'r1', () => {})
    notes.updateNote(note.id, { body: body('Pack the stove.') })

    await assistant.sendMessage(note.id, 'Second', 'r2', () => {})
    const call = generate.mock.calls[1][0]
    expect(call.system).toContain('Pack the stove.')
    expect(call.history.map((m: { role: string; content: string }) => [m.role, m.content])).toEqual(
      [
        ['user', 'First'],
        ['assistant', 'Ok.']
      ]
    )
  })

  it('keeps what was said before a stop', async () => {
    const note = notes.createNote('Trip', body(''))
    generate.mockImplementation(
      ({ onChunk, signal }: { onChunk: (t: string) => void; signal: AbortSignal }) =>
        new Promise((resolve) => {
          onChunk('Half a')
          signal.addEventListener('abort', () => resolve('Half a'))
        })
    )
    const pending = assistant.sendMessage(note.id, 'Go', 'r1', () => {})
    await flush()
    assistant.stopMessage('r1')
    expect((await pending)?.content).toBe('Half a')
  })

  it('refuses before the model is on disk, or for a note that is gone', async () => {
    const note = notes.createNote('Trip', body(''))
    locate.mockResolvedValue(null)
    await expect(assistant.sendMessage(note.id, 'Hi', 'r1', () => {})).rejects.toThrow(/model/i)

    locate.mockResolvedValue({ path: '/m.gguf', source: 'huggingface' })
    await expect(assistant.sendMessage('nope', 'Hi', 'r2', () => {})).rejects.toThrow(/note/i)
  })

  it('clears one note’s conversation, and forgets it when the note is deleted', async () => {
    const a = notes.createNote('A', body(''))
    const b = notes.createNote('B', body(''))
    generate.mockResolvedValue('Ok.')
    await assistant.sendMessage(a.id, 'Hi', 'r1', () => {})
    await assistant.sendMessage(b.id, 'Hi', 'r2', () => {})

    assistant.clearMessages(a.id)
    expect(assistant.listMessages(a.id)).toEqual([])
    expect(assistant.listMessages(b.id)).toHaveLength(2)

    notes.deleteNote(b.id)
    expect(assistant.listMessages(b.id)).toEqual([])
  })
})

describe('buildSystemPrompt', () => {
  it('cuts a long note short and says so', () => {
    const prompt = assistant.buildSystemPrompt({ title: 'Long', plainText: 'x'.repeat(100_000) })
    expect(prompt.length).toBeLessThan(30_000)
    expect(prompt).toMatch(/cut short/)
  })

  it('names an untitled note as such', () => {
    expect(assistant.buildSystemPrompt({ title: '', plainText: 'Hi' })).toContain('Untitled')
  })
})
