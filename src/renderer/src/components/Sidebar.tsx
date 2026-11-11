import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
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
  /** While its divider is being dragged the rail follows the pointer, not its clock. */
  resizing?: boolean
}

/** A row is as tall as New note and Search (h-8), plus the 2px gap below it. */
const NOTE_ROW_HEIGHT = 34
/** Below this many notes the list renders plainly; above it, virtualised. */
const VIRTUALISE_FROM = 100

// The rail's own edge is the only line between it and the note pane. Its
// spacing is padding inside it, never margin around it; the first 48px are the
// top bar's, which stands over it. Open, it is as wide as its divider was last
// dragged (`--size-sidebar`, on the shell); collapsed it keeps no width at all.
const sidebarShell =
  'relative flex flex-col shrink-0 pt-12 pb-2 overflow-hidden duration-200 ease-in-out'
const sidebarOpen = `${sidebarShell} w-(--size-sidebar) transition-[width,filter]`
const sidebarResizing = `${sidebarShell} w-(--size-sidebar) transition-[filter]`
const sidebarCollapsed = `${sidebarShell} w-0 transition-[width,filter]`

// As in Finder, the rail is solid towards the app's centre and the window's
// vibrancy comes in only from its outer edges, fading out gradually in a
// rounded shape: a tint in the rail's fill, 32px in from the left, top and
// bottom and blurred 64px, so it is about a third solid at the window's edge
// and whole some 160px in. It reaches 128px past the side against the note
// pane, twice the blur, so no glass shows there. Being first and unstacked,
// it paints under everything else the rail holds.
const railTint =
  'absolute left-8 top-8 bottom-8 -right-32 rounded-[96px] bg-sidebar blur-3xl pointer-events-none'
const railTop = 'relative shrink-0 flex flex-col'
const railBody = 'relative flex-1 min-h-0 flex flex-col'
// The rail's edge stands on the rail, on the same glass as the footer's rule,
// so the two read alike. Collapsed, the rail's clip hides it.
const railEdge = 'absolute inset-y-0 right-0 w-px bg-divider pointer-events-none'

// New note and Search head the rail as rows, their glyphs on the line the
// notes' titles start on. The rail and every row are padded alike, 6.5px, so a
// 20px glyph is centred at 23px — under macOS's red window button.
const headStyle = 'flex flex-col gap-0.5 px-[6.5px] pb-2 shrink-0'
const headRowStyle =
  'flex items-center gap-2 w-full h-8 px-[6.5px] rounded-lg squircle text-left text-style-sidebar text-fg hover:bg-field-hover transition-colors'
const headGlyphStyle = 'shrink-0 size-5 text-fg'
const headShortcutStyle = 'ml-auto text-style-caption text-fg-body/40'

const sectionLabelStyle = 'px-[13px] pt-2 pb-1 text-style-caption text-fg-body/50 shrink-0'

// The rows are inset 6.5px from either edge. The list's scrollbar (6px,
// main.css) lives in that right margin rather than eating into the rows: the
// list's own inset stops 6px short so the reserved gutter makes up the 6.5px,
// and it is held open even when the list is too short to scroll — otherwise
// the rows would widen the moment a note is deleted.
const listInset = 'relative flex-1 min-h-0 overflow-hidden pl-[6.5px] pr-[0.5px]'
const listScroll = '[scrollbar-gutter:stable]'

// Once the notes have scrolled under the head, a hairline rules it off from
// them, across the rail to its edge, short of the edge's own line.
const listEdge =
  'absolute top-0 left-0 right-px border-t border-divider pointer-events-none transition-opacity duration-150'
const listEdgeHidden = `${listEdge} opacity-0`
const listEdgeShown = `${listEdge} opacity-100`

// The account and settings are ruled off from the list for good, not only
// once it scrolls: across the rail to its edge's line, 8px above them.
const footStyle =
  'relative flex items-center gap-1 px-[6.5px] pt-[9px] shrink-0 ' +
  'before:content-[""] before:absolute before:top-0 before:left-0 before:right-px before:h-px before:bg-divider before:pointer-events-none'

export default function Sidebar({
  notes,
  activeId,
  onSelect,
  onDelete,
  onNewNote,
  onSearch,
  footer,
  collapsed,
  resizing = false
}: SidebarProps) {
  const hasCursor = useHasCursor()
  const newNoteShortcut = useShortcutLabel('N')
  const searchShortcut = useShortcutLabel('K')
  const listRef = useRef<HTMLDivElement>(null)
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
  }, [collapsed])

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
      aria-label="Notes"
      data-on-glass=""
      className={collapsed ? sidebarCollapsed : resizing ? sidebarResizing : sidebarOpen}
    >
      <div aria-hidden data-rail-tint="" className={railTint} />
      <div className={railTop}>
        {!collapsed && (
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
        )}
        {!collapsed && <div className={sectionLabelStyle}>Notes</div>}
      </div>
      <div className={railBody}>
        {!collapsed && (
          <div ref={listRef} className={listInset}>
            {notes.length === 0 ? (
              <p className="px-3 py-6 text-style-sidebar text-fg-body/50 text-center">
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
        )}
        {!collapsed && <div className={footStyle}>{footer}</div>}
      </div>
      <div aria-hidden data-rail-edge="" className={railEdge} />
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

// The action the row uncovers: a red block the height of the row, the glyph
// beside its name (a 32px row has no room to stack them), in the canvas ink so it reads on the danger fill in both
// themes.
const deleteActionStyle =
  'flex items-center justify-center gap-1 w-full h-full bg-danger text-canvas text-style-fineprint font-medium'

// One line per note — its title alone — as tall as the head's rows.
const noteRow =
  'flex items-center w-full h-8 px-[6.5px] rounded-lg squircle text-left transition-colors'
const noteRowIdle = `${noteRow} hover:bg-field-hover`
const noteRowActive = `${noteRow} bg-field-selected`

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
      className="rounded-lg squircle mb-0.5"
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
        <span className="min-w-0 flex-1 text-style-sidebar truncate text-fg">
          {noteDisplayTitle(note)}
        </span>
      </button>
    </SwipeActions>
  )
}
