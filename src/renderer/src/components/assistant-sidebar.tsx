import { useEffect, useRef, useState } from 'react'
import {
  ASSISTANT_EFFORTS,
  GEMMA_MODEL,
  type AssistantEffort,
  type AssistantModelStatus,
  type AssistantUsage
} from '@shared/domain/assistant'
import {
  useAssistantChat,
  useAssistantEffort,
  useAssistantModel,
  type PendingReply
} from '@/hooks/use-assistant'
import { useRailGlass } from '@/hooks/use-sidebar-glass'
import { railFadeHeight } from '@/utils/rail-fade'
import { Button } from '@/components/ui/button'
import { GlassMenu } from '@/components/ui/glass-menu'
import { Menu, MenuItem } from '@/components/ui/menu'
import { menuItemStyle, menuPopupFrame } from '@/components/menu-button'
import CopyIcon from '@/assets/icons/copy.svg'
import AddIcon from '@/assets/icons/add.svg'
import ChevronDownIcon from '@/assets/icons/chevron-down.svg'
import ArrowUpIcon from '@/assets/icons/arrow-up.svg'
import StopIcon from '@/assets/icons/stop.svg'

// ---------------------------------------------------------------------------
// The assistant rail: the right-hand twin of the notes sidebar, toggled from
// the top bar. It talks about the open note with Gemma, which main runs on
// this machine. It always opens on the composer: with no model on disk, a
// line over the box says the first message downloads it, and main does.
// ---------------------------------------------------------------------------

// The rail runs the window's height under the top bar, as the notes sidebar
// does, ruled off from the note by one hairline, the handle that resizes it
// (`ASSISTANT_RAIL`, its width `--size-assistant` on the shell). Pinned beside the note as the
// sidebar is, it stands on the same glass: where the window is frosted it
// paints nothing, and on macOS 27 AppKit's inspector lies under it
// (main/sidebar-glass.ts), and the sheet fades in over it under the
// conversation alone (`railFade`). Elsewhere it is the solid sheet.
const railOnGlass =
  'relative isolate shrink-0 w-(--size-assistant) flex flex-col min-h-0 pt-12 bg-level-1 [--ink-body:var(--ink-sidebar)] border-l border-border-divider text-ink-body'
const railOnSheet =
  'shrink-0 w-(--size-assistant) flex flex-col min-h-0 pt-12 bg-bg-sheet bg-level-1 [--ink-body:var(--ink-sidebar)] border-l border-border-divider text-ink-body'
const mutedText = 'text-style-caption text-ink-body/50'
const notice = 'shrink-0 flex flex-col gap-2 mx-3 mb-2'
const noticeRow = 'flex items-center justify-between gap-2'
const progressTrack = 'h-1 rounded-full bg-bg-field-default overflow-hidden'
const list = 'flex-1 min-h-0 overflow-y-auto px-3 pb-3 flex flex-col'
// Stacked up from the box, so the conversation grows upward as a reply comes.
const conversation = 'mt-auto flex flex-col gap-3'
// The sheet, faded in from clear under the rail's lower 60% at least, or from
// the conversation's top once it climbs past that, to the rail's foot: the
// whole rail once the conversation fills it.
const railFade =
  'pointer-events-none absolute inset-x-0 bottom-0 -z-10 bg-linear-to-b from-bg-sheet/0 to-bg-sheet to-75% transition-[height] duration-150'
const userTurn =
  'self-end max-w-[85%] px-3 py-2 rounded-lg bg-bg-field-default text-style-body-sm text-ink-field-default whitespace-pre-wrap break-words'
const replyTurn = 'flex flex-col gap-1'
const replyText = 'text-style-body-sm text-ink-body whitespace-pre-wrap break-words'
// Under a reply its actions are small: 16px glyphs, not the toolbar's 20px.
const replyActions = 'flex items-center gap-0.5 -ml-1 [&_button_svg]:size-4'
const composer =
  'shrink-0 flex items-end gap-1 mx-3 p-1.5 rounded-2xl bg-bg-field-default shadow-[inset_0_0_0_0.5px_var(--border-field-default)] focus-within:bg-bg-field-focus focus-within:shadow-[inset_0_0_0_0.5px_var(--border-field-focus)]'
// One line to start, as tall as the send button, so the box is the command
// palette's 40px field in its type; growing upward with what is typed to five
// lines, then scrolling.
const composerInput =
  'flex-1 min-w-0 field-sizing-content max-h-[calc(4lh+var(--size-toolbar-button))] overflow-y-auto px-1.5 py-[calc((var(--size-toolbar-button)-1lh)/2)] resize-none bg-transparent outline-none text-style-sidebar text-ink-field-default placeholder:text-ink-field-placeholder focus:text-ink-field-focus focus:placeholder:text-ink-field-placeholder-focus disabled:opacity-50'
// Under the box, as a chat app sets it: the context, then the model and the
// effort at the right, in the account button's size.
const footer = 'shrink-0 flex items-center gap-1 h-10 pl-4 pr-3'
const modelName = 'ml-auto text-style-sidebar text-ink-body/50 whitespace-nowrap'
const meterStyle = 'flex items-center'
// The account button's, opening its menu as that one does: on AppKit's glass
// over the button, which hides under it; else above it, frosted or solid.
const effortTrigger =
  'flex items-center gap-1 h-8 px-[6.5px] rounded-xl text-style-sidebar text-ink-body hover:bg-bg-field-hover data-[popup-open]:bg-bg-field-hover transition-colors outline-none'
const effortTriggerUnderGlass =
  'flex items-center gap-1 h-8 px-[6.5px] rounded-xl text-style-sidebar text-ink-body hover:bg-bg-field-hover data-[popup-open]:opacity-0 transition-colors outline-none'
const effortPopup = `${menuPopupFrame} bg-bg-sheet rounded-lg`
const effortPopupFrosted = `${menuPopupFrame} frosted-sheet rounded-lg`
const effortRow = `${menuItemStyle} justify-between`
const effortLabel = 'text-ink-body'
const effortLabelCurrent = 'text-ink-title font-medium'
const effortHint = 'text-style-caption text-ink-body/50'

const EFFORTS: Record<AssistantEffort, { label: string; hint: string }> = {
  low: { label: 'Low', hint: 'Answers at once' },
  medium: { label: 'Medium', hint: 'Thinks briefly' },
  high: { label: 'High', hint: 'Thinks it through' }
}

/** Characters to a token, as main estimates them, for a reply still streaming. */
const CHARS_PER_TOKEN = 4

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
  const { status, cancel } = useAssistantModel()
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
      {status && (
        <Chat
          noteId={noteId}
          status={status}
          fadeOver={frosted ? element : null}
          onCancel={cancel}
          onInsert={onInsert}
        />
      )}
    </aside>
  )
}

function Chat({
  noteId,
  status,
  fadeOver,
  onCancel,
  onInsert
}: {
  noteId: string | null
  status: AssistantModelStatus
  /** The rail, where it stands on the glass and so fades the sheet in. */
  fadeOver: HTMLElement | null
  onCancel: () => void
  onInsert: (markdown: string) => void
}) {
  const { messages, usage, pending, error, send, stop, refreshUsage } = useAssistantChat(noteId)
  const [effort, setEffort] = useAssistantEffort()
  const [draft, setDraft] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const [said, setSaid] = useState<HTMLDivElement | null>(null)
  const fadeHeight = useRailFade(fadeOver, said)

  // Keep the newest words in view as they arrive.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, pending?.text])

  async function submit() {
    const prompt = draft
    if (!prompt.trim() || pending) return
    setDraft('')
    // Not kept — stopped while the model downloaded, or failed: the words come back.
    if (!(await send(prompt, effort))) setDraft((now) => now || prompt)
  }

  return (
    <>
      {fadeOver && fadeHeight !== null && (
        <div data-rail-fade="" aria-hidden className={railFade} style={{ height: fadeHeight }} />
      )}
      <div ref={listRef} className={list} aria-live="polite">
        <div ref={setSaid} className={conversation}>
          {/* With no note open, the box's own placeholder says what to do. */}
          {noteId && messages.length === 0 && !pending && (
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
                {pending.text || (
                  <span className="text-ink-body/50">
                    {status.state === 'ready' ? 'Thinking…' : 'Waiting for the download…'}
                  </span>
                )}
              </p>
            </>
          )}
          {error && (
            <p role="alert" className="text-style-body-sm text-ink-error">
              {error}
            </p>
          )}
        </div>
      </div>

      <ModelNotice status={status} waiting={pending !== null} onCancel={onCancel} />

      <div className={composer}>
        <textarea
          aria-label="Ask Gemma"
          placeholder={noteId ? 'Ask about this note…' : 'Open a note to ask Gemma about it.'}
          disabled={!noteId}
          rows={1}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          // The note may have changed since the last count.
          onFocus={() => void refreshUsage()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              void submit()
            }
          }}
          className={composerInput}
        />
        {pending ? (
          <Button aria-label="Stop" onClick={stop}>
            <StopIcon aria-hidden />
          </Button>
        ) : (
          <Button aria-label="Send" disabled={!draft.trim()} onClick={() => void submit()}>
            <ArrowUpIcon aria-hidden />
          </Button>
        )}
      </div>

      <div className={footer}>
        {usage && <ContextMeter usage={usage} pending={pending} />}
        <span className={modelName}>{GEMMA_MODEL.label}</span>
        <EffortMenu effort={effort} onChange={setEffort} />
      </div>
    </>
  )
}

/**
 * How tall the rail's fade stands, kept as the conversation, the box under it
 * and the rail itself change size.
 */
function useRailFade(rail: HTMLElement | null, said: HTMLElement | null): number | null {
  // None until measured, so the fade opens at its height rather than growing into it.
  const [height, setHeight] = useState<number | null>(null)
  useEffect(() => {
    const list = said?.parentElement
    if (!rail || !said || !list) return
    const measure = (): void =>
      setHeight(
        railFadeHeight(
          rail.getBoundingClientRect(),
          said.getBoundingClientRect().top,
          list.scrollHeight > list.clientHeight
        )
      )
    measure()
    const observer = new ResizeObserver(measure)
    for (const el of [rail, list, said]) observer.observe(el)
    return () => observer.disconnect()
  }, [rail, said])
  return height
}

/**
 * The line over the composer while the model is not on disk: that it will
 * download with the first message, how far that download has come, or why it
 * failed. Nothing once the model is there.
 */
function ModelNotice({
  status,
  waiting,
  onCancel
}: {
  status: AssistantModelStatus
  waiting: boolean
  onCancel: () => void
}) {
  if (status.state === 'ready') return null

  if (status.state === 'downloading') {
    const percent = Math.floor((status.receivedBytes / status.totalBytes) * 100)
    return (
      <div className={notice}>
        <div className={noticeRow}>
          <p className={mutedText}>
            Downloading {GEMMA_MODEL.label} · {(status.receivedBytes / 1e9).toFixed(1)} of{' '}
            {gigabytes(status.totalBytes)}
          </p>
          {/* A waiting message's Stop ends the download itself. */}
          {!waiting && (
            <Button emphasis="tertiary" onClick={onCancel} aria-label="Cancel download">
              <Button.Text>Cancel</Button.Text>
            </Button>
          )}
        </div>
        <div
          role="progressbar"
          aria-label="Model download"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className={progressTrack}
        >
          <div
            className="h-full bg-border-progress transition-[width]"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>
    )
  }

  if (status.state === 'error') {
    return (
      <div className={notice}>
        <p role="alert" className="text-style-caption text-ink-error">
          {status.message} Send again to retry.
        </p>
      </div>
    )
  }

  return (
    <div className={notice}>
      <p className={mutedText}>
        {GEMMA_MODEL.label} runs on this computer, so your notes never leave it. It downloads
        automatically when you send your first message ({gigabytes(GEMMA_MODEL.size)}, once).
      </p>
    </div>
  )
}

function EffortMenu({
  effort,
  onChange
}: {
  effort: AssistantEffort
  onChange: (effort: AssistantEffort) => void
}) {
  const current = EFFORTS[effort]
  const glass = window.api.glassMenu?.native
  const trigger = (
    <button
      type="button"
      aria-label={`Effort: ${current.label}`}
      className={glass ? effortTriggerUnderGlass : effortTrigger}
    >
      <span>{current.label}</span>
      <ChevronDownIcon className="shrink-0 size-4 text-ink-body" aria-hidden />
    </button>
  )

  if (glass) {
    return (
      <GlassMenu
        side="over"
        trigger={trigger}
        items={ASSISTANT_EFFORTS.map((value) => ({ id: value, label: EFFORTS[value].label }))}
        onSelect={(id) => {
          const picked = ASSISTANT_EFFORTS.find((value) => value === id)
          if (picked) onChange(picked)
        }}
      />
    )
  }

  return (
    <Menu
      side="top"
      className={window.api.frosted ? effortPopupFrosted : effortPopup}
      trigger={trigger}
    >
      {ASSISTANT_EFFORTS.map((value) => (
        <MenuItem
          key={value}
          aria-current={value === effort ? 'true' : undefined}
          className={effortRow}
          onSelect={() => onChange(value)}
        >
          <span className={value === effort ? effortLabelCurrent : effortLabel}>
            {EFFORTS[value].label}
          </span>
          <span className={effortHint}>{EFFORTS[value].hint}</span>
        </MenuItem>
      ))}
    </Menu>
  )
}

/**
 * How much of the context window the next request starts with, as a bare ring;
 * its count is for a screen reader alone. A reply still streaming is added to it
 * as an estimate.
 */
function ContextMeter({ usage, pending }: { usage: AssistantUsage; pending: PendingReply | null }) {
  const streaming = pending
    ? Math.ceil((pending.prompt.length + pending.text.length) / CHARS_PER_TOKEN)
    : 0
  const used = Math.min(usage.usedTokens + streaming, usage.contextTokens)
  const estimated = usage.estimated || streaming > 0
  const fraction = used / usage.contextTokens
  const percent = Math.round(fraction * 100)
  const radius = 6
  const circumference = 2 * Math.PI * radius
  const valueText = `${estimated ? 'About ' : ''}${used.toLocaleString('en-US')} of ${usage.contextTokens.toLocaleString('en-US')} tokens (${percent}%)`
  return (
    <div
      role="meter"
      aria-label="Context used"
      aria-valuemin={0}
      aria-valuemax={usage.contextTokens}
      aria-valuenow={used}
      aria-valuetext={valueText}
      className={meterStyle}
    >
      <svg viewBox="0 0 16 16" className="size-4 -rotate-90" aria-hidden>
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="2"
          className="stroke-border-divider"
        />
        <circle
          cx="8"
          cy="8"
          r={radius}
          fill="none"
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - fraction)}
          className="stroke-border-progress"
        />
      </svg>
    </div>
  )
}
