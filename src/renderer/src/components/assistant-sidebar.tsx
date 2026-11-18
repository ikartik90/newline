import { useEffect, useRef, useState } from 'react'
import { GEMMA_MODEL, type AssistantModelStatus, type ModelSource } from '@shared/domain/assistant'
import { useAssistantChat, useAssistantModel } from '@/hooks/use-assistant'
import { useRailGlass } from '@/hooks/use-sidebar-glass'
import { Button } from '@/components/ui/button'
import CopyIcon from '@/assets/icons/copy.svg'
import AddIcon from '@/assets/icons/add.svg'
import ResetIcon from '@/assets/icons/reset.svg'
import ReturnIcon from '@/assets/icons/return.svg'
import StopIcon from '@/assets/icons/stop.svg'

// ---------------------------------------------------------------------------
// The assistant rail: the right-hand twin of the notes sidebar, toggled from
// the top bar. It talks about the open note with Gemma, which main runs on
// this machine. Until the model is on disk the rail is where the user
// chooses to download it — nothing is fetched until they say so.
// ---------------------------------------------------------------------------

// The rail runs the window's height under the top bar, as the notes sidebar
// does, ruled off from the note by one hairline, the handle that resizes it
// (`ASSISTANT_RAIL`, its width `--size-assistant` on the shell). Pinned beside the note as the
// sidebar is, it stands on the same glass: where the window is frosted it
// paints nothing, and on macOS 27 AppKit's inspector lies under it
// (main/sidebar-glass.ts). Elsewhere it is the solid sheet.
const railOnGlass =
  'shrink-0 w-(--size-assistant) flex flex-col min-h-0 pt-12 bg-level-1 [--ink-body:var(--ink-sidebar)] border-l border-border-divider text-ink-body'
const railOnSheet =
  'shrink-0 w-(--size-assistant) flex flex-col min-h-0 pt-12 bg-bg-sheet bg-level-1 [--ink-body:var(--ink-sidebar)] border-l border-border-divider text-ink-body'
const head = 'shrink-0 flex items-center justify-between gap-2 h-10 px-3'
const intro = 'flex-1 flex flex-col justify-center gap-3 px-5 pb-12'
const bodyText = 'text-style-body-sm text-ink-body'
const mutedText = 'text-style-caption text-ink-body/50'
const progressTrack = 'h-1 rounded-full bg-bg-field-default overflow-hidden'
const list = 'flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col gap-3'
const userTurn =
  'self-end max-w-[85%] px-3 py-2 rounded-lg bg-bg-field-default text-style-body-sm text-ink-field-default whitespace-pre-wrap break-words'
const replyTurn = 'flex flex-col gap-1'
const replyText = 'text-style-body-sm text-ink-body whitespace-pre-wrap break-words'
const replyActions = 'flex items-center gap-0.5 -ml-1'
const composer =
  'shrink-0 flex items-end gap-1 m-3 mt-0 p-1 rounded-lg bg-bg-field-default shadow-[inset_0_0_0_0.5px_var(--border-field-default)] focus-within:bg-bg-field-focus focus-within:shadow-[inset_0_0_0_0.5px_var(--border-field-focus)]'
const composerInput =
  'flex-1 min-w-0 max-h-40 px-2 py-1.5 resize-none bg-transparent outline-none text-style-body-sm text-ink-field-default placeholder:text-ink-field-placeholder focus:text-ink-field-focus focus:placeholder:text-ink-field-placeholder-focus'

const SOURCE_NAMES: Record<ModelSource, string> = {
  huggingface: 'the Hugging Face cache',
  'lm-studio': 'LM Studio',
  ollama: 'Ollama',
  'llama.cpp': 'llama.cpp',
  'node-llama-cpp': 'node-llama-cpp'
}

function gigabytes(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`
}

export interface AssistantSidebarProps {
  /** The note on screen, or null when none is open. */
  noteId: string | null
  /** Put a reply into that note. */
  onInsert: (markdown: string) => void
}

export function AssistantSidebar({ noteId, onInsert }: AssistantSidebarProps) {
  const { status, download, cancel } = useAssistantModel()
  const [element, setElement] = useState<HTMLElement | null>(null)
  useRailGlass(element)
  const frosted = window.api.frosted
  return (
    <aside
      ref={setElement}
      aria-label="Gemma"
      data-on-glass={frosted ? '' : undefined}
      className={frosted ? railOnGlass : railOnSheet}
    >
      <ModelGate status={status} onDownload={download} onCancel={cancel}>
        {status?.state === 'ready' &&
          (noteId ? (
            <Chat noteId={noteId} source={status.source} onInsert={onInsert} />
          ) : (
            <div className={intro}>
              <p className={bodyText}>Open a note to ask Gemma about it.</p>
            </div>
          ))}
      </ModelGate>
    </aside>
  )
}

function ModelGate({
  status,
  onDownload,
  onCancel,
  children
}: {
  status: AssistantModelStatus | null
  onDownload: () => void
  onCancel: () => void
  children: React.ReactNode
}) {
  if (!status) return null
  if (status.state === 'ready') return <>{children}</>

  if (status.state === 'downloading') {
    const percent = Math.floor((status.receivedBytes / status.totalBytes) * 100)
    return (
      <div className={intro}>
        <p className={bodyText}>Downloading {GEMMA_MODEL.label}…</p>
        <div
          role="progressbar"
          aria-label="Model download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={progressTrack}
        >
          <div className="h-full bg-ink-body transition-[width]" style={{ width: `${percent}%` }} />
        </div>
        <p className={mutedText}>
          {gigabytes(status.receivedBytes)} of {gigabytes(status.totalBytes)}
        </p>
        <div>
          <Button onClick={onCancel}>
            <Button.Text>Cancel</Button.Text>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className={intro}>
      <p className="text-style-body-lg text-ink-title">Ask Gemma about your notes</p>
      <p className={bodyText}>
        {GEMMA_MODEL.label} runs entirely on this computer, so your notes never leave it. It is a
        one-time {gigabytes(GEMMA_MODEL.size)} download from Hugging Face, kept where LM Studio,
        llama.cpp and other apps can use it too.
      </p>
      {status.state === 'error' && (
        <p role="alert" className="text-style-body-sm text-ink-error">
          {status.message}
        </p>
      )}
      <div>
        <Button emphasis="primary" onClick={onDownload}>
          <Button.Text>
            {status.state === 'error' ? 'Try again' : `Download · ${gigabytes(GEMMA_MODEL.size)}`}
          </Button.Text>
        </Button>
      </div>
    </div>
  )
}

function Chat({
  noteId,
  source,
  onInsert
}: {
  noteId: string
  source: ModelSource
  onInsert: (markdown: string) => void
}) {
  const { messages, pending, error, send, stop, clear } = useAssistantChat(noteId)
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending?.text])

  function submit() {
    if (!draft.trim() || pending) return
    void send(draft)
    setDraft('')
  }

  return (
    <>
      <div className={head}>
        <p className={mutedText}>
          {GEMMA_MODEL.label}
          {source === 'huggingface' ? '' : ` · from ${SOURCE_NAMES[source]}`}
        </p>
        {messages.length > 0 && !pending && (
          <Button aria-label="Clear conversation" onClick={() => void clear()}>
            <ResetIcon aria-hidden />
          </Button>
        )}
      </div>

      <div ref={listRef} className={list} aria-live="polite">
        {messages.length === 0 && !pending && (
          <p className={`${mutedText} pt-2`}>
            Ask about this note: summarise it, question it, or draft what comes next.
          </p>
        )}
        {messages.map((m) =>
          m.role === 'user' ? (
            <p key={m.id} className={userTurn}>
              {m.content}
            </p>
          ) : (
            <div key={m.id} className={replyTurn}>
              <p className={replyText}>{m.content}</p>
              <div className={replyActions}>
                <Button
                  aria-label="Copy reply"
                  onClick={() => void navigator.clipboard.writeText(m.content)}
                >
                  <CopyIcon aria-hidden />
                </Button>
                <Button aria-label="Insert into note" onClick={() => onInsert(m.content)}>
                  <AddIcon aria-hidden />
                </Button>
              </div>
            </div>
          )
        )}
        {pending && (
          <>
            <p className={userTurn}>{pending.prompt}</p>
            <p className={replyText} data-pending-reply="">
              {pending.text || <span className="text-ink-body/50">Thinking…</span>}
            </p>
          </>
        )}
        {error && (
          <p role="alert" className="text-style-body-sm text-ink-error">
            {error}
          </p>
        )}
      </div>

      <div className={composer}>
        <textarea
          aria-label="Ask Gemma"
          placeholder="Ask about this note…"
          rows={2}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
          className={composerInput}
        />
        {pending ? (
          <Button aria-label="Stop" onClick={stop}>
            <StopIcon aria-hidden />
          </Button>
        ) : (
          <Button aria-label="Send" disabled={!draft.trim()} onClick={submit}>
            <ReturnIcon aria-hidden />
          </Button>
        )}
      </div>
    </>
  )
}
