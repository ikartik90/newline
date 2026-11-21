import { existsSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'fs'
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
const locateAll = vi.fn()
vi.mock('../model-locator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model-locator')>()),
  locateGemmaModel: (...args: unknown[]) => locate(...args),
  locateGemmaModels: (...args: unknown[]) => locateAll(...args)
}))

const download = vi.fn()
vi.mock('../model-download', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../model-download')>()),
  downloadModel: (...args: unknown[]) => download(...args)
}))

const generate = vi.fn()
const countTokens = vi.fn()
const disposeEngine = vi.fn()
vi.mock('../llama-engine', () => ({
  generate: (...args: unknown[]) => generate(...args),
  countTokens: (...args: unknown[]) => countTokens(...args),
  contextWindow: () => 16_384,
  disposeEngine: (...args: unknown[]) => disposeEngine(...args)
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
  locateAll.mockReset().mockResolvedValue([])
  download.mockReset()
  generate.mockReset()
  countTokens.mockReset().mockResolvedValue(null)
  disposeEngine.mockReset().mockResolvedValue(undefined)
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

  it('refuses a note that is gone', async () => {
    await expect(assistant.sendMessage('nope', 'Hi', 'r2', () => {})).rejects.toThrow(/note/i)
  })

  it('thinks as hard as asked', async () => {
    const note = notes.createNote('Trip', body(''))
    generate.mockResolvedValue('Ok.')
    await assistant.sendMessage(note.id, 'Hi', 'r1', () => {}, 'high')
    await assistant.sendMessage(note.id, 'Hi', 'r2', () => {})
    expect(generate.mock.calls[0][0].effort).toBe('high')
    expect(generate.mock.calls[1][0].effort).toBe('medium')
  })

  it('forgets a note’s conversation when the note is deleted', async () => {
    const a = notes.createNote('A', body(''))
    const b = notes.createNote('B', body(''))
    generate.mockResolvedValue('Ok.')
    await assistant.sendMessage(a.id, 'Hi', 'r1', () => {})
    await assistant.sendMessage(b.id, 'Hi', 'r2', () => {})

    notes.deleteNote(b.id)
    expect(assistant.listMessages(b.id)).toEqual([])
    expect(assistant.listMessages(a.id)).toHaveLength(2)
  })
})

describe('the first message', () => {
  function holdDownload() {
    let finish!: (path: string) => void
    let fail!: (error: Error) => void
    download.mockImplementation(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise<string>((resolve, reject) => {
          finish = resolve
          fail = reject
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        })
    )
    return { finish: (path: string) => finish(path), fail: (e: Error) => fail(e) }
  }

  it('downloads the model first, then answers, keeping the turn once it can', async () => {
    const note = notes.createNote('Trip', body(''))
    const held = holdDownload()
    generate.mockResolvedValue('Ok.')

    const reply = assistant.sendMessage(note.id, 'Hi', 'r1', () => {})
    await flush()
    expect((await assistant.getModelStatus()).state).toBe('downloading')
    expect(assistant.listMessages(note.id)).toEqual([])

    const path = join(mkdtempSync(join(tmpdir(), 'hub-')), 'gemma.gguf')
    writeFileSync(path, 'GGUF')
    held.finish(path)
    expect(await reply).toMatchObject({ content: 'Ok.' })
    expect(generate.mock.calls[0][0].modelPath).toBe(path)
    expect(assistant.listMessages(note.id).map((m) => m.content)).toEqual(['Hi', 'Ok.'])
  })

  it('joins a download already running rather than starting another', async () => {
    const note = notes.createNote('Trip', body(''))
    holdDownload()
    assistant.startModelDownload()
    void assistant.sendMessage(note.id, 'Hi', 'r1', () => {})
    await flush()
    expect(download).toHaveBeenCalledTimes(1)
  })

  it('stopped while the model downloads, cancels the download and keeps nothing', async () => {
    const note = notes.createNote('Trip', body(''))
    holdDownload()
    const reply = assistant.sendMessage(note.id, 'Hi', 'r1', () => {})
    await flush()
    assistant.stopMessage('r1')
    expect(await reply).toBeNull()
    expect(await assistant.getModelStatus()).toEqual({ state: 'missing' })
    expect(assistant.listMessages(note.id)).toEqual([])
    expect(generate).not.toHaveBeenCalled()
  })

  it('says why the download failed, keeping nothing', async () => {
    const note = notes.createNote('Trip', body(''))
    const held = holdDownload()
    const reply = assistant.sendMessage(note.id, 'Hi', 'r1', () => {})
    await flush()
    held.fail(new Error('Not enough disk space'))
    await expect(reply).rejects.toThrow('Not enough disk space')
    expect(assistant.listMessages(note.id)).toEqual([])
  })
})

describe('context usage', () => {
  beforeEach(() => {
    locate.mockResolvedValue({ path: '/m.gguf', source: 'huggingface' })
  })

  it('estimates the note and the turns from their text until the model can count them', async () => {
    const note = notes.createNote('Trip', body('x'.repeat(4000)))
    const empty = await assistant.getUsage(note.id)
    expect(empty.estimated).toBe(true)
    expect(empty.contextTokens).toBe(16_384)
    expect(empty.usedTokens).toBeGreaterThan(1000)

    generate.mockResolvedValue('y'.repeat(4000))
    await assistant.sendMessage(note.id, 'Go', 'r1', () => {})
    expect((await assistant.getUsage(note.id)).usedTokens).toBeGreaterThan(empty.usedTokens + 900)
  })

  it('counts exactly once the model is loaded, handing it what the next request carries', async () => {
    const note = notes.createNote('Trip', body('Pack the tent.'))
    generate.mockResolvedValue('Ok.')
    await assistant.sendMessage(note.id, 'Hi', 'r1', () => {})
    countTokens.mockResolvedValue(321)

    expect(await assistant.getUsage(note.id)).toEqual({
      usedTokens: 321,
      contextTokens: 16_384,
      estimated: false
    })
    const call = countTokens.mock.calls[0][0]
    expect(call.system).toContain('Pack the tent.')
    expect(call.history.map((m: { content: string }) => m.content)).toEqual(['Hi', 'Ok.'])
  })

  it('counts nothing for a note that is gone', async () => {
    expect(await assistant.getUsage('nope')).toEqual({
      usedTokens: 0,
      contextTokens: 16_384,
      estimated: true
    })
  })
})

describe('model copies', () => {
  it('lists every copy, deletable unless Ollama holds it', async () => {
    locateAll.mockResolvedValue([
      { path: '/hf/gemma.gguf', source: 'huggingface', sizeBytes: 5 },
      { path: '/ollama/blob', source: 'ollama', sizeBytes: 6 }
    ])
    expect(await assistant.listModelCopies()).toEqual([
      { path: '/hf/gemma.gguf', source: 'huggingface', sizeBytes: 5, deletable: true },
      { path: '/ollama/blob', source: 'ollama', sizeBytes: 6, deletable: false }
    ])
  })

  it('deletes a Hugging Face copy whole — link, blob and repo — and looks again', async () => {
    const hub = mkdtempSync(join(tmpdir(), 'hub-'))
    const repo = join(hub, 'models--google--gemma-4-E4B-it-qat-q4_0-gguf')
    mkdirSync(join(repo, 'blobs'), { recursive: true })
    mkdirSync(join(repo, 'snapshots', 'c0ffee'), { recursive: true })
    const blob = join(repo, 'blobs', 'abc')
    writeFileSync(blob, 'GGUF')
    const snapshot = join(repo, 'snapshots', 'c0ffee', 'gemma-4-E4B_q4_0-it.gguf')
    symlinkSync(blob, snapshot)
    locateAll.mockResolvedValue([{ path: snapshot, source: 'huggingface', sizeBytes: 4 }])
    locate.mockResolvedValue({ path: snapshot, source: 'huggingface' })
    expect((await assistant.getModelStatus()).state).toBe('ready')
    const seen: unknown[] = []
    assistant.onModelStatus((s) => seen.push(s))

    locate.mockResolvedValue(null)
    await assistant.deleteModelCopy(snapshot)
    expect(existsSync(repo)).toBe(false)
    expect(existsSync(hub)).toBe(true)
    expect(disposeEngine).toHaveBeenCalled()
    expect(seen.at(-1)).toEqual({ state: 'missing' })
  })

  it('deletes another app’s plain file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'lm-'))
    const file = join(dir, 'gemma-4-E4B-it-Q4_K_M.gguf')
    writeFileSync(file, 'GGUF')
    locateAll.mockResolvedValue([{ path: file, source: 'lm-studio', sizeBytes: 4 }])
    await assistant.deleteModelCopy(file)
    expect(existsSync(file)).toBe(false)
  })

  it('refuses a path it did not find, and Ollama’s copy', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'other-'))
    const file = join(dir, 'notes.db')
    writeFileSync(file, 'x')
    locateAll.mockResolvedValue([{ path: '/ollama/blob', source: 'ollama', sizeBytes: 6 }])
    await expect(assistant.deleteModelCopy(file)).rejects.toThrow(/not a model/i)
    await expect(assistant.deleteModelCopy('/ollama/blob')).rejects.toThrow(/Ollama/)
    expect(existsSync(file)).toBe(true)
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
