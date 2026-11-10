import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { SwipeActions } from '@/components/swipe-actions'
import { useHasCursor } from '@/hooks/use-has-cursor'
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

// The rail paints nothing of its own: it stands on the shell's glass, and the
// note pane's edge is the only line between the two. Its spacing is padding
// inside it, never margin around it; the first 48px are the top bar's, which
// stands over it. Open, it is as wide as its divider was last dragged
// (`--size-sidebar`, on the shell); collapsed it keeps no width at all.
const sidebarShell = 'flex flex-col shrink-0 pt-12 pb-2 overflow-hidden duration-200 ease-in-out'
const sidebarOpen = `${sidebarShell} w-(--size-sidebar) transition-[width,filter]`
const sidebarResizing = `${sidebarShell} w-(--size-sidebar) transition-[filter]`
const sidebarCollapsed = `${sidebarShell} w-0 transition-[width,filter]`

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
const listInset = 'flex-1 min-h-0 overflow-hidden pl-[6.5px] pr-[0.5px]'
const listScroll = '[scrollbar-gutter:stable]'

const footStyle = 'flex items-center gap-1 px-[6.5px] pt-2 shrink-0'

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
      {!collapsed && (
        <div className={headStyle}>
          <button type="button" className={headRowStyle} aria-label="New note" onClick={onNewNote}>
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
      {!collapsed && (
        <div ref={listRef} className={listInset}>
          {notes.length === 0 ? (
            <p className="px-3 py-6 text-style-sidebar text-fg-body/50 text-center">No notes yet</p>
          ) : notes.length < VIRTUALISE_FROM ? (
            <div
              className={`h-full overflow-y-auto ${listScroll}`}
              onScroll={() => setSwipeOpenId(null)}
            >
              {notes.map((note) => (
                <NoteItem key={note.id} note={note} {...rowProps} />
              ))}
            </div>
          ) : (
            <List
              className={listScroll}
              style={{ height: listHeight }}
              rowComponent={NoteRow}
              rowCount={notes.length}
              rowHeight={NOTE_ROW_HEIGHT}
              rowProps={rowProps}
            />
          )}
        </div>
      )}
      {!collapsed && <div className={footStyle}>{footer}</div>}
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
