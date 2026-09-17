import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import type { SidenoteEntry } from '@/utils/sidenotes'

// ---------------------------------------------------------------------------
// SidenoteLayer — the margin notes.
//
// A note's card is CSS-anchored (see `cardStyle`) and revealed only when its
// annotation is "active": in the editor (`trigger="caret"`) that means the
// caret sits on the annotated text (or the card is being edited); in the
// reader (`trigger="pointer"`) it means the annotation is hovered or clicked.
//
// Placement is chosen per active note: `side` (100px right of the text-content
// column, 8px above the line) when the viewport has room, else `stacked`
// (centred on the column, 4px below/above the line — like the slash menu).
// ---------------------------------------------------------------------------

// The `sidenoteCard` recipe. Fixed (not absolute) so anchor()'s flip-block
// fallback measures overflow against the VIEWPORT — absolute would measure
// against the tall <article>, always find room below, and never flip above.
// Hidden until its annotation is active; `allow-discrete` flips `visibility`
// at the START of the reveal so Edit auto-focus has something to land on.
const cardStyle =
  'fixed z-40 flex flex-col gap-1 p-2 max-w-(--size-sidenote-max-width) ' +
  'bg-surface [--color-field:var(--color-field-on-surface)] rounded-md border-[0.5px] border-divider ' +
  'shadow-[0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)] text-fg ' +
  'opacity-0 invisible pointer-events-none transition-[opacity,visibility] duration-[120ms] ease-out [transition-behavior:allow-discrete] ' +
  'data-[active]:opacity-100 data-[active]:visible data-[active]:pointer-events-auto'
// Vertical geometry per placement. `left`/`width` come from inline styles
// computed below — see the note at `SIDE_OFFSET`.
const placementStyle = {
  side: '-mt-2',
  stacked: 'mt-1 -translate-x-1/2 [position-try-fallbacks:flip-block]'
} as const
// The text row: ordinal marker, then the note body.
const contentStyle = 'flex gap-0.5 flex-[1_0_0] min-w-0 text-style-sidenote text-fg'
// The ordinal, painted in the brand gradient like the annotation's superscript.
const markerStyle = 'font-medium text-branded select-none'
// inline-block + a min width gives an EMPTY contentEditable a line box, so the
// caret is placeable on click. Paragraphs are block children 4px apart.
const bodyStyle =
  'inline-block min-w-2 caret-fg outline-none [&>*+*]:mt-1 ' +
  'empty:after:content-[attr(data-placeholder)] empty:after:text-fg/40'
// "Esc to exit" below the note body — mirrors the link-input hint in the
// selection toolbar (an Esc key-cap followed by a muted label).
const hintStyle = 'flex items-center gap-1 select-none'
const hintKeyStyle =
  'flex items-center h-5 px-1 rounded-sm border-[0.5px] border-divider bg-item-hover text-fg text-style-caption whitespace-nowrap'
const hintLabelStyle = 'text-fg/50 text-style-caption whitespace-nowrap'

// Horizontal geometry (mirrors the `--size-sidenote-*` tokens in main.css).
// The `left`/`width` of a card are computed here from the rail's measured rect
// and applied inline, rather than via CSS `anchor(--sidenote-rail …)`: WebKit
// resolves only an element's default `position-anchor` (here the annotation,
// used for the vertical axis), so a second named-anchor query for the
// horizontal axis silently fails in Safari. Doing it in JS is safe because the
// content column's x-edges are scroll-invariant.
const SIDE_OFFSET = 100 // --size-sidenote-offset — 100px right of the column.
const CARD_WIDTH = 320 // --size-sidenote-width
const SIDE_SAFE_GAP = 16 // room to keep before falling back to `stacked`.
const STACKED_INSET = 80 // --size-sidenote-stacked-inset
const STACKED_MIN_WIDTH = 320 // --size-sidenote-min-width
const STACKED_MAX_WIDTH = 480 // --size-sidenote-max-width

type Placement = 'side' | 'stacked'

// Inline horizontal geometry for the active card. `left` is a viewport px value
// (the card is position:fixed); `stacked` is centred on the column via the
// `-translate-x-1/2`.
interface CardGeometry {
  left: number
  width: number
}

interface SidenoteLayerProps {
  entries: SidenoteEntry[]
  /** Reveal model: caret (editor) or hover/click (reader). */
  trigger?: 'caret' | 'pointer'
  /** Editor mode — the note body is contentEditable. */
  editable?: boolean
  /** Editor: id of the note whose card is open for editing. */
  activeId?: string | null
  /** Id of a card whose body should grab focus on mount (freshly added note). */
  autoFocusId?: string | null
  onAutoFocused?: () => void
  /** Editor: the editing card lost focus — the parent should close it. */
  onStopEditing?: () => void
  /** Editor: Escape pressed in the note body — close the card and return the
   *  caret to the annotated text. */
  onExitEdit?: (entry: SidenoteEntry) => void
  onChangeText?: (entry: SidenoteEntry, text: string) => void
}

export function SidenoteLayer({
  entries,
  trigger = 'pointer',
  editable = false,
  activeId = null,
  autoFocusId,
  onAutoFocused,
  onStopEditing,
  onExitEdit,
  onChangeText
}: SidenoteLayerProps) {
  const railRef = useRef<HTMLDivElement>(null)
  // Reader: annotation hovered / clicked. Both surfaces: card being edited.
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [clickId, setClickId] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [placement, setPlacement] = useState<Placement>('side')
  const [geometry, setGeometry] = useState<CardGeometry | null>(null)

  const triggered = trigger === 'caret' ? activeId : (hoverId ?? clickId)
  const visibleId = triggered ?? focusedId ?? autoFocusId ?? null

  // Reader: hover reveals, click pins (toggle), outside pointer-down clears.
  useEffect(() => {
    if (trigger !== 'pointer') return
    const annOf = (t: EventTarget | null) =>
      (t as Element | null)?.closest?.('[data-sidenote-id]') ?? null
    function over(e: PointerEvent) {
      const el = annOf(e.target)
      if (el) setHoverId(el.getAttribute('data-sidenote-id'))
    }
    function out(e: PointerEvent) {
      if (annOf(e.target)) setHoverId(null)
    }
    function down(e: PointerEvent) {
      const el = annOf(e.target)
      if (el) {
        const id = el.getAttribute('data-sidenote-id')
        setClickId((cur) => (cur === id ? null : id))
      } else if (!(e.target as Element | null)?.closest?.('[data-sidenote-card]')) {
        setClickId(null)
      }
    }
    document.addEventListener('pointerover', over)
    document.addEventListener('pointerout', out)
    document.addEventListener('pointerdown', down)
    return () => {
      document.removeEventListener('pointerover', over)
      document.removeEventListener('pointerout', out)
      document.removeEventListener('pointerdown', down)
    }
  }, [trigger])

  // Choose side vs stacked for the visible note and compute its horizontal
  // geometry from the rail's rect. Layout effect so the inline left/width is set
  // before paint (no flash at a stale position as the card reveals). Runs on
  // mount + resize; horizontal geometry is scroll-invariant so scroll needs no
  // recompute (the card is position:fixed and the column's x-edges don't move).
  useLayoutEffect(() => {
    if (!visibleId) return
    function measure() {
      const rail = railRef.current
      if (!rail) return
      const rect = rail.getBoundingClientRect()
      const fits = rect.right + SIDE_OFFSET + CARD_WIDTH + SIDE_SAFE_GAP <= window.innerWidth
      if (fits) {
        setPlacement('side')
        setGeometry({ left: rect.right + SIDE_OFFSET, width: CARD_WIDTH })
      } else {
        setPlacement('stacked')
        const width = Math.max(
          STACKED_MIN_WIDTH,
          Math.min(rect.width - STACKED_INSET, STACKED_MAX_WIDTH)
        )
        // Centred on the column — the card translates itself back by half.
        setGeometry({ left: rect.left + rect.width / 2, width })
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [visibleId])

  return (
    <>
      <div ref={railRef} data-sidenote-rail aria-hidden />
      {entries.map((entry) => (
        <aside
          key={entry.id}
          data-sidenote-card
          data-sidenote-card-id={entry.id}
          data-placement={placement}
          data-active={visibleId === entry.id ? '' : undefined}
          className={`${cardStyle} ${placementStyle[placement]}`}
          style={
            {
              // Vertical: CSS-anchored to the annotation so it tracks scroll.
              // `side` hangs from the line's top, `stacked` from its bottom.
              positionAnchor: entry.anchorName,
              top: placement === 'side' ? 'anchor(top)' : 'anchor(bottom)',
              ...(geometry && {
                left: `${geometry.left}px`,
                width: `${geometry.width}px`
              })
            } as CSSProperties
          }
          onPointerEnter={trigger === 'pointer' ? () => setHoverId(entry.id) : undefined}
          onPointerLeave={trigger === 'pointer' ? () => setHoverId(null) : undefined}
          onFocusCapture={() => setFocusedId(entry.id)}
          onBlurCapture={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              setFocusedId((cur) => (cur === entry.id ? null : cur))
              // Editing this note is over once its card loses focus.
              onStopEditing?.()
            }
          }}
        >
          <div className={contentStyle}>
            <span className={markerStyle} aria-hidden>
              {entry.number}.
            </span>
            <SidenoteBody
              text={entry.text}
              editable={editable}
              ariaLabel={`Sidenote ${entry.number}`}
              autoFocus={editable && autoFocusId === entry.id}
              onAutoFocused={onAutoFocused}
              onExit={() => onExitEdit?.(entry)}
              onChange={(text) => onChangeText?.(entry, text)}
            />
          </div>
          {editable && (
            <div className={hintStyle} aria-hidden>
              <span className={hintKeyStyle}>Esc</span>
              <span className={hintLabelStyle}>to exit</span>
            </div>
          )}
        </aside>
      ))}
    </>
  )
}

// ---------------------------------------------------------------------------
// Note text ↔ DOM.
//
// A note is stored as plain text on its mark, with `\n` between paragraphs. In
// the card each paragraph is its own <div> so the gap between them is a real
// margin (a `\n` under `white-space: pre-wrap` can't be spaced). An EMPTY note
// keeps a childless body so the `:empty` placeholder still shows.
// ---------------------------------------------------------------------------

const PARAGRAPH_TAGS = new Set(['DIV', 'P'])

/** Paragraph-aware text of a note body (or of a cloned range fragment). */
function readNoteText(root: Node): string {
  const lines: string[] = []
  let pending: string | null = null
  for (const node of Array.from(root.childNodes)) {
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as HTMLElement) : null
    // A lone <br> is the browser's placeholder for an empty line box, not text.
    if (el?.tagName === 'BR') continue
    if (el && PARAGRAPH_TAGS.has(el.tagName)) {
      if (pending !== null) lines.push(pending)
      pending = null
      lines.push(el.textContent ?? '')
      continue
    }
    pending = (pending ?? '') + (node.textContent ?? '')
  }
  if (pending !== null) lines.push(pending)
  return lines.join('\n')
}

/** Rebuild a note body's DOM from its text. */
function renderNoteText(el: HTMLElement, text: string): void {
  if (text === '') {
    el.replaceChildren()
    return
  }
  el.replaceChildren(
    ...text.split('\n').map((line) => {
      const paragraph = document.createElement('div')
      // An empty paragraph needs a <br> to keep its line box (and its caret).
      if (line) paragraph.textContent = line
      else paragraph.appendChild(document.createElement('br'))
      return paragraph
    })
  )
}

/** Text offset of a DOM point in `el`, counting each paragraph break as one char. */
function offsetOf(el: HTMLElement, node: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(el)
  range.setEnd(node, offset)
  return readNoteText(range.cloneContents()).length
}

/** The selection as text offsets in `el`, or null if it isn't inside the body. */
function selectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) {
    return null
  }
  return {
    start: offsetOf(el, range.startContainer, range.startOffset),
    end: offsetOf(el, range.endContainer, range.endOffset)
  }
}

/** Collapse the caret at text offset `at` in a freshly rendered body. */
function placeCaret(el: HTMLElement, at: number): void {
  const lines = readNoteText(el).split('\n')
  let index = 0
  let column = at
  while (index < lines.length - 1 && column > lines[index].length) {
    column -= lines[index].length + 1
    index++
  }
  const paragraph = el.children[index]
  const textNode = paragraph?.firstChild
  const range = document.createRange()
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, Math.min(column, (textNode as Text).length))
  } else {
    range.setStart(paragraph ?? el, 0)
  }
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

/**
 * Shift+Enter: break the note into a new paragraph at the caret (replacing any
 * selected text). Returns the new note text, or null if the caret isn't in the
 * body. The body is uncontrolled, so the DOM is rebuilt here and the caret
 * restored just after the break.
 */
function splitParagraphAtCaret(el: HTMLElement): string | null {
  const offsets = selectionOffsets(el)
  if (!offsets) return null
  const text = readNoteText(el)
  const next = `${text.slice(0, offsets.start)}\n${text.slice(offsets.end)}`
  renderNoteText(el, next)
  placeCaret(el, offsets.start + 1)
  return next
}

// ---------------------------------------------------------------------------
// SidenoteBody — the note text. Editable bodies are uncontrolled (seeded via a
// ref) so React never reconciles the contentEditable children and steals the
// caret; external changes (undo, another card) re-seed only while unfocused.
// ---------------------------------------------------------------------------

interface SidenoteBodyProps {
  text: string
  editable: boolean
  ariaLabel: string
  autoFocus: boolean
  onAutoFocused?: () => void
  onExit?: () => void
  onChange: (text: string) => void
}

function SidenoteBody({
  text,
  editable,
  ariaLabel,
  autoFocus,
  onAutoFocused,
  onExit,
  onChange
}: SidenoteBodyProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (document.activeElement !== el && readNoteText(el) !== text) {
      renderNoteText(el, text)
    }
  }, [text])

  useEffect(() => {
    if (!autoFocus) return
    const el = ref.current
    if (!el) return
    // The card reveals via a visibility transition (hidden → visible), so it
    // isn't focusable the instant its annotation becomes active: focus() on a
    // still-hidden element is a silent no-op. Retry across a few frames until
    // focus actually lands (fresh cards mount visible and land on the first
    // try; a re-opened card takes a frame for `visibility` to compute visible).
    let raf = 0
    let tries = 0
    const attempt = () => {
      el.focus()
      if (document.activeElement !== el && tries++ < 10) {
        raf = requestAnimationFrame(attempt)
        return
      }
      const range = document.createRange()
      range.selectNodeContents(el)
      range.collapse(false)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      onAutoFocused?.()
    }
    raf = requestAnimationFrame(attempt)
    return () => cancelAnimationFrame(raf)
  }, [autoFocus, onAutoFocused])

  if (!editable) {
    return (
      <div className={bodyStyle}>
        {text.split('\n').map((line, i) => (
          <div key={i}>{line || <br />}</div>
        ))}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      className={bodyStyle}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      aria-label={ariaLabel}
      data-placeholder="Add a note…"
      onInput={(e) => {
        const el = e.currentTarget
        const next = readNoteText(el)
        // Deleting the last character leaves an empty paragraph (or the
        // browser's <br>) behind, which would keep the `:empty` placeholder
        // hidden — drop it so the note reads as empty again.
        if (next === '' && el.childNodes.length > 0) {
          el.replaceChildren()
          if (document.activeElement === el) placeCaret(el, 0)
        }
        onChange(next)
      }}
      onKeyDown={(e) => {
        // Esc exits the card (mirrors the link input) — hand back to the parent
        // to close it and restore the caret to the annotated text.
        if (e.key === 'Escape') {
          e.preventDefault()
          e.stopPropagation()
          onExit?.()
          return
        }
        // Shift+Enter opens a new paragraph inside the note; a plain Enter is
        // "done" — the text is already committed on every input, so exiting is
        // all that's left.
        if (e.key === 'Enter') {
          e.preventDefault()
          e.stopPropagation()
          if (!e.shiftKey) {
            onExit?.()
            return
          }
          const next = splitParagraphAtCaret(e.currentTarget)
          if (next !== null) onChange(next)
        }
      }}
    />
  )
}
