import { existsSync } from 'fs'
import { homedir } from 'os'
import { v4 as uuidv4 } from 'uuid'
import {
  GEMMA_MODEL,
  type AssistantMessage,
  type AssistantModelStatus,
  type AssistantRole
} from '@shared/domain/assistant'
import { getDb } from '../db/database'
import { generate } from './llama-engine'
import { downloadModel } from './model-download'
import { huggingFaceHubDir, locateGemmaModel, type LocatorEnv } from './model-locator'
import { getNote } from './notes'

// ---------------------------------------------------------------------------
// The note assistant: where the model is, getting it when it is not, and each
// note's conversation with it. Everything runs on this machine; the only
// network this touches is the one download the user starts from the rail.
// ---------------------------------------------------------------------------

/** How often download progress is reported; the bytes arrive far faster. */
const PROGRESS_INTERVAL_MS = 250
/** Earlier turns handed back to the model, newest kept. */
const HISTORY_TURNS = 20
/** The most of a note the model is shown, about 6k tokens. */
const NOTE_CHARS = 24_000

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

export function clearMessages(noteId: string): void {
  getDb().prepare('DELETE FROM assistant_messages WHERE note_id = ?').run(noteId)
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

/**
 * Ask about a note. The user's turn is kept at once; the reply streams to
 * `onChunk` and is kept when it ends, even part of one stopped by `stopMessage`.
 */
export async function sendMessage(
  noteId: string,
  text: string,
  requestId: string,
  onChunk: (text: string) => void
): Promise<AssistantMessage | null> {
  const model = await getModelStatus()
  if (model.state !== 'ready') throw new Error('The model is not downloaded yet.')
  const note = getNote(noteId)
  if (!note) throw new Error('That note no longer exists.')

  const history = listMessages(noteId)
    .slice(-HISTORY_TURNS)
    .map(({ role, content }) => ({ role, content }))
  addMessage(noteId, 'user', text)

  const controller = new AbortController()
  running.set(requestId, controller)
  try {
    const reply = await generate({
      modelPath: model.path,
      system: buildSystemPrompt(note),
      history,
      prompt: text,
      onChunk,
      signal: controller.signal
    })
    return reply.trim() ? addMessage(noteId, 'assistant', reply.trim()) : null
  } finally {
    running.delete(requestId)
  }
}

export function stopMessage(requestId: string): void {
  running.get(requestId)?.abort()
}
