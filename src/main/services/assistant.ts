import { existsSync } from 'fs'
import { readdir, realpath, rm, rmdir } from 'fs/promises'
import { homedir } from 'os'
import { basename, dirname } from 'path'
import { v4 as uuidv4 } from 'uuid'
import {
  DEFAULT_EFFORT,
  GEMMA_MODEL,
  type AssistantEffort,
  type AssistantMessage,
  type AssistantModelCopy,
  type AssistantModelStatus,
  type AssistantRole,
  type AssistantUsage
} from '@shared/domain/assistant'
import { getDb } from '../db/database'
import { contextWindow, countTokens, disposeEngine, generate } from './llama-engine'
import { downloadModel } from './model-download'
import {
  huggingFaceHubDir,
  locateGemmaModel,
  locateGemmaModels,
  type LocatorEnv
} from './model-locator'
import { getNote } from './notes'

// ---------------------------------------------------------------------------
// The note assistant: where the model is, getting it when it is not, and each
// note's conversation with it. Everything runs on this machine; the only
// network this touches is the one download, started by the first message
// sent while no copy is on disk.
// ---------------------------------------------------------------------------

/** How often download progress is reported; the bytes arrive far faster. */
const PROGRESS_INTERVAL_MS = 250
/** Earlier turns handed back to the model, newest kept. */
const HISTORY_TURNS = 20
/** The most of a note the model is shown, about 6k tokens. */
const NOTE_CHARS = 24_000
/** Characters to a token, near enough for English, until the model can count. */
const CHARS_PER_TOKEN = 4
/** What the chat template wraps each turn in, in tokens, when estimating. */
const TURN_OVERHEAD_TOKENS = 4

let status: AssistantModelStatus = { state: 'missing' }
let downloading: AbortController | null = null
const listeners = new Set<(status: AssistantModelStatus) => void>()
const running = new Map<string, AbortController>()

function locatorEnv(): LocatorEnv {
  return { home: homedir(), platform: process.platform, vars: process.env }
}

function setStatus(next: AssistantModelStatus): void {
  status = next
  for (const listener of listeners) listener(next)
}

/** Hear every change of the model's status. Returns the unsubscribe. */
export function onModelStatus(listener: (status: AssistantModelStatus) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Where the model stands, looking on disk again unless it is downloading or still there. */
export async function getModelStatus(): Promise<AssistantModelStatus> {
  if (downloading) return status
  if (status.state === 'ready' && existsSync(status.path)) return status
  const found = await locateGemmaModel(locatorEnv())
  if (found) status = { state: 'ready', ...found }
  else if (status.state !== 'error') status = { state: 'missing' }
  return status
}

/** Start the one download; a second call while it runs, or once ready, does nothing. */
export function startModelDownload(): void {
  if (downloading || status.state === 'ready') return
  const controller = new AbortController()
  downloading = controller
  setStatus({ state: 'downloading', receivedBytes: 0, totalBytes: GEMMA_MODEL.size })

  let lastReport = 0
  const env = locatorEnv()
  downloadModel({
    spec: GEMMA_MODEL,
    hubDir: huggingFaceHubDir(env),
    platform: env.platform,
    fetch: (url, init) => fetch(url, init),
    signal: controller.signal,
    onProgress: (receivedBytes, totalBytes) => {
      const now = Date.now()
      if (now - lastReport < PROGRESS_INTERVAL_MS && receivedBytes < totalBytes) return
      lastReport = now
      setStatus({ state: 'downloading', receivedBytes, totalBytes })
    }
  })
    .then((path) => {
      downloading = null
      setStatus({ state: 'ready', path, source: 'huggingface' })
    })
    .catch((error: unknown) => {
      downloading = null
      if (controller.signal.aborted) setStatus({ state: 'missing' })
      else
        setStatus({
          state: 'error',
          message: error instanceof Error ? error.message : String(error)
        })
    })
}

/** Stop the download; what landed is kept, and the next start resumes from it. */
export function cancelModelDownload(): void {
  downloading?.abort()
}

interface MessageRow {
  id: string
  note_id: string
  role: AssistantRole
  content: string
  created_at: number
}

function rowToMessage(row: MessageRow): AssistantMessage {
  return {
    id: row.id,
    noteId: row.note_id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at
  }
}

export function listMessages(noteId: string): AssistantMessage[] {
  const rows = getDb()
    .prepare('SELECT * FROM assistant_messages WHERE note_id = ? ORDER BY created_at, rowid')
    .all(noteId) as MessageRow[]
  return rows.map(rowToMessage)
}

function addMessage(noteId: string, role: AssistantRole, content: string): AssistantMessage {
  const message = { id: uuidv4(), noteId, role, content, createdAt: Date.now() }
  getDb()
    .prepare(
      'INSERT INTO assistant_messages (id, note_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(message.id, noteId, role, content, message.createdAt)
  return message
}

/** What the model is told before the conversation: its job, and the note as it is now. */
export function buildSystemPrompt(note: { title: string; plainText: string }): string {
  const cut = note.plainText.length > NOTE_CHARS
  const text = cut ? note.plainText.slice(0, NOTE_CHARS) : note.plainText
  return [
    'You are a writing assistant inside Newline, a note-taking app, running entirely on the',
    'user’s own computer. Help with the note below: answer questions about it, summarise it,',
    'suggest edits or draft new passages. Be concise. Write in Markdown. When asked for text to',
    'put in the note, give only that text.',
    '',
    `Note title: ${note.title.trim() || 'Untitled'}`,
    cut ? 'Note text (cut short; the note goes on):' : 'Note text:',
    '"""',
    text.trim() || '(empty)',
    '"""'
  ].join('\n')
}

/** The download was stopped before it finished: nothing is wrong, nothing is kept. */
class DownloadStopped extends Error {}

/**
 * The model, downloading it first if no copy is on disk — joining the download
 * already running if there is one. Aborting `signal` cancels the download.
 */
async function ensureModel(
  signal: AbortSignal
): Promise<Extract<AssistantModelStatus, { state: 'ready' }>> {
  const now = await getModelStatus()
  if (now.state === 'ready') return now
  return new Promise((resolve, reject) => {
    const off = onModelStatus((next) => {
      if (next.state === 'downloading') return
      off()
      signal.removeEventListener('abort', cancelModelDownload)
      if (next.state === 'ready') resolve(next)
      else if (next.state === 'error') reject(new Error(next.message))
      else reject(new DownloadStopped())
    })
    signal.addEventListener('abort', cancelModelDownload)
    startModelDownload()
  })
}

/**
 * Ask about a note. With no model on disk yet, it is downloaded first. The
 * user's turn is kept once the model is there; the reply streams to `onChunk`
 * and is kept when it ends, even part of one stopped by `stopMessage`.
 * Stopped during the download, nothing is kept and it resolves to null.
 */
export async function sendMessage(
  noteId: string,
  text: string,
  requestId: string,
  onChunk: (text: string) => void,
  effort: AssistantEffort = DEFAULT_EFFORT
): Promise<AssistantMessage | null> {
  if (!getNote(noteId)) throw new Error('That note no longer exists.')
  const controller = new AbortController()
  running.set(requestId, controller)
  try {
    let model: Extract<AssistantModelStatus, { state: 'ready' }>
    try {
      model = await ensureModel(controller.signal)
    } catch (error) {
      if (error instanceof DownloadStopped) return null
      throw error
    }
    const note = getNote(noteId)
    if (!note) throw new Error('That note no longer exists.')

    const history = recentHistory(noteId)
    addMessage(noteId, 'user', text)
    const reply = await generate({
      modelPath: model.path,
      system: buildSystemPrompt(note),
      history,
      prompt: text,
      effort,
      onChunk,
      signal: controller.signal
    })
    return reply.trim() ? addMessage(noteId, 'assistant', reply.trim()) : null
  } finally {
    running.delete(requestId)
  }
}

function recentHistory(noteId: string): Pick<AssistantMessage, 'role' | 'content'>[] {
  return listMessages(noteId)
    .slice(-HISTORY_TURNS)
    .map(({ role, content }) => ({ role, content }))
}

/**
 * How much of the context window the note's next request starts with. Counted
 * by the model's own tokenizer once it is loaded; until then, from the text.
 */
export async function getUsage(noteId: string): Promise<AssistantUsage> {
  const contextTokens = contextWindow()
  const note = getNote(noteId)
  if (!note) return { usedTokens: 0, contextTokens, estimated: true }
  const system = buildSystemPrompt(note)
  const history = recentHistory(noteId)

  const model = status.state === 'ready' ? status.path : null
  const counted = model ? await countTokens({ modelPath: model, system, history }) : null
  if (counted !== null) return { usedTokens: counted, contextTokens, estimated: false }

  const chars = system.length + history.reduce((sum, m) => sum + m.content.length, 0)
  const usedTokens =
    Math.ceil(chars / CHARS_PER_TOKEN) + (history.length + 1) * TURN_OVERHEAD_TOKENS
  return { usedTokens, contextTokens, estimated: true }
}

/** Every Gemma on this machine, for Settings. */
export async function listModelCopies(): Promise<AssistantModelCopy[]> {
  const copies = await locateGemmaModels(locatorEnv())
  return copies.map((copy) => ({ ...copy, deletable: copy.source !== 'ollama' }))
}

/** Remove a folder once nothing is left in it; a folder still holding files stays. */
async function removeIfEmpty(dir: string): Promise<void> {
  if ((await readdir(dir).catch(() => ['?'])).length === 0) await rmdir(dir).catch(() => {})
}

/** Whether a folder, or any folder under it, holds a file. */
async function holdsFiles(dir: string): Promise<boolean> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  for (const entry of entries) {
    if (!entry.isDirectory()) return true
    if (await holdsFiles(`${dir}/${entry.name}`)) return true
  }
  return false
}

/**
 * Delete one copy Settings listed. A Hugging Face snapshot takes its blob with
 * it, and the repo's folder once no snapshot is left in it; another app's copy
 * is its one file. Only a path the locator found is ever touched.
 */
export async function deleteModelCopy(path: string): Promise<void> {
  const copy = (await listModelCopies()).find((c) => c.path === path)
  if (!copy) throw new Error('That is not a model Newline found on this computer.')
  if (!copy.deletable) throw new Error('Ollama keeps this copy; remove it with Ollama.')
  if (running.size > 0) throw new Error('Wait for Gemma to finish answering.')

  await disposeEngine()
  if (copy.source === 'huggingface' && basename(dirname(dirname(path))) === 'snapshots') {
    const repo = dirname(dirname(dirname(path)))
    const blob = await realpath(path).catch(() => path)
    await rm(path, { force: true })
    if (blob !== path) await rm(blob, { force: true })
    if (await holdsFiles(`${repo}/snapshots`)) await removeIfEmpty(dirname(path))
    else await rm(repo, { recursive: true, force: true })
  } else {
    await rm(path, { force: true })
    await removeIfEmpty(dirname(path))
  }

  status = { state: 'missing' }
  setStatus(await getModelStatus())
}

export function stopMessage(requestId: string): void {
  running.get(requestId)?.abort()
}
