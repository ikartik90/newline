import { useCallback, useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { SwipeActions } from '@/components/swipe-actions'
import { useHasCursor } from '@/hooks/use-has-cursor'
import { useScrolled } from '@/hooks/use-scrolled'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { noteDisplayTitle } from '@/utils/note-display'
import TrashIcon from '@/assets/icons/trash.svg'
import AddIcon from '@/assets/icons/add.svg'
import SearchIcon from '@/assets/icons/search.svg'

interface SidebarProps {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onNewNote: () => void
  /** Open the search — the command menu. */
  onSearch: () => void
  /** What stands at the foot: the account and the app's settings. */
  footer: ReactNode
  collapsed: boolean
  /** Collapsed, but brought up over the note pane while the pointer is on it. */
  peeking?: boolean
  /** While its divider is being dragged the rail follows the pointer, not its clock. */
  resizing?: boolean
  ref?: Ref<HTMLElement>
}

/** A row is as tall as New note and Search (h-8), plus the 2px gap below it. */
const NOTE_ROW_HEIGHT = 34
/** Past the rail's 150ms transitions, when what they lead to is settled anyway. */
const SETTLE_AFTER_MS = 200
/** Below this many notes the list renders plainly; above it, virtualised. */
const VIRTUALISE_FROM = 100

// The rail's own edge is the only line between it and the note pane. Its
// spacing is padding inside it, never margin around it; the first 48px are the
// top bar's, which stands over it. Open, it is as wide as its divider was last
// dragged (`--size-sidebar`, on the shell); collapsed it keeps no width at all,
// the note pane's edge gliding over in the same 150ms. What it holds is clipped
// to it, except while it floats over the pane (peeked at, toggled, or widening
// from a peek to pinned), when it stands above the pane and under the top bar.
// Its `text-ink-body` is the sidebar's own grey: `inline` makes the utility read
// `--ink-body` itself, so reassigning that here inks everything inside.
const sidebarShell =
  'relative shrink-0 duration-150 ease-in-out bg-level-1 [--ink-body:var(--ink-sidebar)]'
const sidebarOpen = `${sidebarShell} overflow-hidden w-(--size-sidebar) transition-[width,filter]`
const sidebarResizing = `${sidebarShell} overflow-hidden w-(--size-sidebar) transition-[filter]`
const sidebarCollapsed = `${sidebarShell} overflow-hidden w-0 transition-[width,filter]`
// Floating, it paints the canvas: a toggle still glides the note pane's edge
// its whole width, and behind the fading sheet glass (or the sheet) one side of
// that edge and the canvas the other would read as the sidebar sliding.
const sidebarFloatingCollapsed = `${sidebarShell} overflow-visible z-[5] w-0 bg-bg-canvas transition-[width,filter]`
const sidebarFloatingOpen = `${sidebarShell} overflow-visible z-[5] w-(--size-sidebar) bg-bg-canvas transition-[width,filter]`

// What the rail holds is not cut off by its narrowing edge: held at the open
// width, it slides 8px toward the edge and fades in the same 150ms, and comes
// back the same way. It stays mounted until the fade ends, out of reach.
// Peeked at, it stands over the note pane rather than the glass, so it is a
// sheet there: solid, edged and shadowed. Pinned, it holds still while the
// pane makes room, then its fill fades off into the glass laid under it.
const railContents =
  'absolute inset-y-0 left-0 flex flex-col w-(--size-sidebar) pt-12 pb-2 transition-[opacity,translate,background-color,box-shadow] duration-150 ease-in-out'
const railContentsShown = `${railContents} opacity-100 translate-x-0 starting:opacity-0 starting:-translate-x-2`
const railContentsHiding = `${railContents} opacity-0 -translate-x-2`
const railContentsPeeking = `${railContents} bg-bg-sheet shadow-[0_4px_16px_var(--shadow-sheet)] opacity-100 translate-x-0 starting:opacity-0 starting:-translate-x-2`
// Going, it is the sheet at once, over the canvas the floating rail paints.
const railContentsPeekEnding =
  'absolute inset-y-0 left-0 flex flex-col w-(--size-sidebar) pt-12 pb-2 transition-[opacity,translate] duration-150 ease-in-out bg-bg-sheet shadow-[0_4px_16px_var(--shadow-sheet)] opacity-0 -translate-x-2'

// The rail paints nothing: AppKit's own sidebar, the one Finder's is, lies
// under it as its ground (main/sidebar-glass.ts).
const railTop = 'relative shrink-0 flex flex-col'
const railBody = 'relative flex-1 min-h-0 flex flex-col'
// The rail's edge stands on the rail, on the same glass as the footer's rule,
// so the two read alike. Collapsed, the rail's clip hides it; floating, the
// sheet carries it at its own right edge instead.
const railEdge = 'absolute inset-y-0 right-0 w-px bg-border-divider pointer-events-none'

// New note and Search head the rail as rows, their glyphs on the line the
// notes' titles start on. The rail and every row are padded alike, 6.5px, so a
// 20px glyph is centred at 23px — under macOS's red window button.
const headStyle = 'flex flex-col gap-0.5 px-[6.5px] pb-2 shrink-0'
const headRowStyle =
  'flex items-center gap-2 w-full h-8 px-[6.5px] rounded-xl text-left text-style-body-sm text-ink-body hover:bg-bg-field-hover transition-colors'
const headGlyphStyle = 'shrink-0 size-5 text-ink-body'
const headShortcutStyle = 'ml-auto text-style-caption text-ink-body/40'

const sectionLabelStyle = 'px-[13px] pt-2 pb-1 text-style-caption text-ink-body/50 shrink-0'

// The rows are inset 6.5px from the left. The list's scrollbar (8px,
// main.css) lives in the right margin rather than eating into the rows: past
// the list's own 0.5px inset, the reserved gutter makes the right 8.5px, and
// it is held open even when the list is too short to scroll — otherwise the
// rows would widen the moment a note is deleted.
const listInset = 'relative flex-1 min-h-0 overflow-hidden pl-[6.5px] pr-[0.5px]'
const listScroll = '[scrollbar-gutter:stable]'

// Once the notes have scrolled under the head, a hairline rules it off from
// them, across the rail to its edge, short of the edge's own line.
const listEdge =
  'absolute top-0 left-0 right-px border-t border-border-divider pointer-events-none transition-opacity duration-150'
const listEdgeHidden = `${listEdge} opacity-0`
const listEdgeShown = `${listEdge} opacity-100`

// The account and settings are ruled off from the list for good, not only
// once it scrolls: across the rail to its edge's line, 8px above them.
const footStyle =
  'relative flex items-center gap-1 px-[6.5px] pt-[9px] shrink-0 ' +
  'before:content-[""] before:absolute before:top-0 before:left-0 before:right-px before:h-px before:bg-border-divider before:pointer-events-none'

export default function Sidebar({
  notes,
  activeId,
  onSelect,
  onDelete,
  onNewNote,
  onSearch,
  footer,
  collapsed,
  peeking = false,
  resizing = false,
  ref
}: SidebarProps) {
  const hasCursor = useHasCursor()
  const newNoteShortcut = useShortcutLabel('N')
  const searchShortcut = useShortcutLabel('K')
  const listRef = useRef<HTMLDivElement>(null)
  const hidden = collapsed && !peeking
  // Whether the rail's contents are mounted: from showing until the fade that
  // follows has ended.
  const [contentsMounted, setContentsMounted] = useState(!hidden)
  if (!hidden && !contentsMounted) setContentsMounted(true)
  // Whether the rail stands over the note pane: from a peek until its fade
  // has ended, or until a pin from it has widened the rail.
  const [floating, setFloating] = useState(peeking)
  if (peeking && !floating) setFloating(true)
  // A toggle floats it too, so it goes and comes as a peek does: the rail's
  // narrowing or widening edge would otherwise cut what it holds off, which
  // reads as the whole sidebar sliding its width.
  const [wasCollapsed, setWasCollapsed] = useState(collapsed)
  if (wasCollapsed !== collapsed) {
    setWasCollapsed(collapsed)
    if (!floating) setFloating(true)
  }
  // Each settles on its transition's end, or just after its 150ms should a
  // transition be cut short and never report one.
  const settling = floating && !collapsed && !peeking
  useEffect(() => {
    if (!settling) return
    const timer = setTimeout(() => setFloating(false), SETTLE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [settling])
  const unmounting = hidden && contentsMounted
  useEffect(() => {
    if (!unmounting) return
    const timer = setTimeout(() => {
      setContentsMounted(false)
      setFloating(false)
    }, SETTLE_AFTER_MS)
    return () => clearTimeout(timer)
  }, [unmounting])
  const contentsStyle =
    peeking || (floating && !collapsed)
      ? railContentsPeeking
      : !collapsed
        ? railContentsShown
        : floating
          ? railContentsPeekEnding
          : railContentsHiding
  const railStyle = floating
    ? collapsed
      ? sidebarFloatingCollapsed
      : sidebarFloatingOpen
    : collapsed
      ? sidebarCollapsed
      : resizing
        ? sidebarResizing
        : sidebarOpen
  const [listHeight, setListHeight] = useState(400)
  // The one row slid aside to show its actions, if any.
  const [swipeOpenId, setSwipeOpenId] = useState<string | null>(null)
  const listScrolled = useScrolled()
  const { ref: trackListScroller, onScroll: onListScroll } = listScrolled
  // The virtualised list hands over a handle, not its scroller.
  const trackVirtualList = useCallback(
    (api: { readonly element: HTMLDivElement | null } | null) =>
      trackListScroller(api?.element ?? null),
    [trackListScroller]
  )

  useEffect(() => {
    if (!listRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setListHeight(entry.contentRect.height)
    })
    observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [contentsMounted])

  // A press anywhere but on the open row puts it back.
  useEffect(() => {
    if (!swipeOpenId) return
    const close = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target?.closest?.('[data-swipe-open]')) setSwipeOpenId(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [swipeOpenId])

  const handleSelect = useCallback(
    (id: string) => {
      setSwipeOpenId(null)
      onSelect(id)
    },
    [onSelect]
  )

  const handleSwipeOpenChange = useCallback((id: string, open: boolean) => {
    setSwipeOpenId((current) => (open ? id : current === id ? null : current))
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onDelete(id)
      }
    },
    [onDelete]
  )

  const rowProps: NoteRowProps = {
    notes,
    activeId,
    swipeOpenId,
    onSelect: handleSelect,
    onDelete,
    onSwipeOpenChange: handleSwipeOpenChange,
    onKeyDown: handleKeyDown
  }

  return (
    <aside
      ref={ref}
      aria-label="Notes"
      data-on-glass={collapsed || floating ? undefined : ''}
      className={railStyle}
      onTransitionEnd={(event) => {
        if (event.target !== event.currentTarget || event.propertyName !== 'width') return
        if (!collapsed) setFloating(false)
      }}
    >
      {contentsMounted && (
        <div
          data-rail-contents=""
          inert={hidden}
          aria-hidden={hidden || undefined}
          className={contentsStyle}
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== 'opacity') return
            if (!hidden) return
            setContentsMounted(false)
            setFloating(false)
          }}
        >
          <div className={railTop}>
            <div className={headStyle}>
              <button
                type="button"
                className={headRowStyle}
                aria-label="New note"
                onClick={onNewNote}
              >
                <AddIcon className={headGlyphStyle} aria-hidden />
                New note
                {hasCursor && (
                  <kbd aria-hidden className={headShortcutStyle}>
                    {newNoteShortcut}
                  </kbd>
                )}
              </button>
              <button type="button" className={headRowStyle} aria-label="Search" onClick={onSearch}>
                <SearchIcon className={headGlyphStyle} aria-hidden />
                Search
                {hasCursor && (
                  <kbd aria-hidden className={headShortcutStyle}>
                    {searchShortcut}
                  </kbd>
                )}
              </button>
            </div>
            <div className={sectionLabelStyle}>Notes</div>
          </div>
          <div className={railBody}>
            <div ref={listRef} className={listInset}>
              {notes.length === 0 ? (
                <p className="px-3 py-6 text-style-body-sm text-ink-body/50 text-center">
                  No notes yet
                </p>
              ) : notes.length < VIRTUALISE_FROM ? (
                <div
                  ref={trackListScroller}
                  className={`h-full overflow-y-auto ${listScroll}`}
                  onScroll={(event) => {
                    setSwipeOpenId(null)
                    onListScroll(event)
                  }}
                >
                  {notes.map((note) => (
                    <NoteItem key={note.id} note={note} {...rowProps} />
                  ))}
                </div>
              ) : (
                <List
                  listRef={trackVirtualList}
                  onScroll={onListScroll}
                  className={listScroll}
                  style={{ height: listHeight }}
                  rowComponent={NoteRow}
                  rowCount={notes.length}
                  rowHeight={NOTE_ROW_HEIGHT}
                  rowProps={rowProps}
                />
              )}
              <div
                aria-hidden
                data-list-edge=""
                className={listScrolled.scrolled ? listEdgeShown : listEdgeHidden}
              />
            </div>
            <div className={footStyle}>{footer}</div>
          </div>
          {floating && <div aria-hidden data-rail-edge="" className={railEdge} />}
        </div>
      )}
      {!floating && <div aria-hidden data-rail-edge="" className={railEdge} />}
    </aside>
  )
}

interface NoteRowProps {
  notes: Note[]
  activeId: string | null
  swipeOpenId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  onSwipeOpenChange: (id: string, open: boolean) => void
  onKeyDown: (e: React.KeyboardEvent, id: string) => void
}

function NoteRow({ index, style, ...rowProps }: RowComponentProps<NoteRowProps>) {
  return (
    <div style={style}>
      <NoteItem note={rowProps.notes[index]} {...rowProps} />
    </div>
  )
}

// The action the row uncovers: a danger block the height of the row, the glyph
// beside its name (a 32px row has no room to stack them).
const deleteActionStyle =
  'flex items-center justify-center gap-1 w-full h-full bg-bg-row-delete text-ink-row-delete text-style-sidenote font-medium'

// One line per note — its title alone — as tall as the head's rows.
const noteRow = 'flex items-center w-full h-8 px-[6.5px] rounded-xl text-left transition-colors'
const noteRowIdle = `${noteRow} hover:bg-bg-shell-hover`
const noteRowActive = `${noteRow} bg-bg-shell-selected`

function NoteItem({
  note,
  activeId,
  swipeOpenId,
  onSelect,
  onDelete,
  onSwipeOpenChange,
  onKeyDown
}: Omit<NoteRowProps, 'notes'> & { note: Note }) {
  const isActive = note.id === activeId
  return (
    <SwipeActions
      open={note.id === swipeOpenId}
      onOpenChange={(open) => onSwipeOpenChange(note.id, open)}
      className="rounded-xl mb-0.5"
      wells="rounded-xl shadow-[0_0_0_16px_var(--bg-row-delete)]"
      actions={
        <button
          type="button"
          className={deleteActionStyle}
          onClick={() => {
            onSwipeOpenChange(note.id, false)
            onDelete(note.id)
          }}
        >
          <TrashIcon className="w-4 h-4" aria-hidden />
          Delete
        </button>
      }
    >
      <button
        type="button"
        onClick={() => onSelect(note.id)}
        onKeyDown={(e) => onKeyDown(e, note.id)}
        aria-current={isActive ? 'true' : undefined}
        className={isActive ? noteRowActive : noteRowIdle}
      >
        <span className="min-w-0 flex-1 text-style-body-sm truncate text-ink-body">
          {noteDisplayTitle(note)}
        </span>
      </button>
    </SwipeActions>
  )
}
