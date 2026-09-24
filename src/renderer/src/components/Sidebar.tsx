import { useCallback, useEffect, useRef, useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import { SwipeActions } from '@/components/swipe-actions'
import { formatRelativeTime, noteDisplayTitle } from '@/utils/note-display'
import TrashIcon from '@/assets/icons/trash.svg'

interface SidebarProps {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  collapsed: boolean
}

const NOTE_ROW_HEIGHT = 56
/** Below this many notes the list renders plainly; above it, virtualised. */
const VIRTUALISE_FROM = 100

// The rail paints nothing of its own: it stands on the shell's glass under the
// top bar, and the note panel's card edge is the only line between the two.
// Collapsed it keeps no width at all — what used to head it, the new-note
// button and the search, lives in the top bar and stays in view.
const sidebarShell = 'flex flex-col transition-[width] duration-200 ease-in-out overflow-hidden'

// The rows are inset 8px from either edge — the window's on the left and, on
// the right, the card's, which keeps no margin of its own beside the rail.
// The list's scrollbar (6px, main.css) lives in that right margin rather than
// eating into the rows: the list's own inset stops 2px short so the reserved
// gutter makes up the 8px, and it is held open even when the list is too
// short to scroll — otherwise the rows would widen the moment a note is
// deleted.
const listInset = 'pl-2 pr-0.5'
const listScroll = '[scrollbar-gutter:stable]'

export default function Sidebar({ notes, activeId, onSelect, onDelete, collapsed }: SidebarProps) {
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
    <aside aria-label="Notes" className={`${sidebarShell} ${collapsed ? 'w-0' : 'w-64'}`}>
      {!collapsed && (
        <div ref={listRef} className={`flex-1 overflow-hidden ${listInset}`}>
          {notes.length === 0 ? (
            <p className="px-3 py-6 text-style-body-sm text-fg-body/50 text-center">No notes yet</p>
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
// over its name, in the canvas ink so it reads on the danger fill in both
// themes.
const deleteActionStyle =
  'flex flex-col items-center justify-center gap-0.5 w-full h-full bg-danger text-canvas text-style-fineprint font-medium'

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
      className="rounded-sm mb-0.5"
      actions={
        <button
          type="button"
          className={deleteActionStyle}
          onClick={() => {
            onSwipeOpenChange(note.id, false)
            onDelete(note.id)
          }}
        >
          <TrashIcon className="w-5 h-5" aria-hidden />
          Delete
        </button>
      }
    >
      <button
        type="button"
        onClick={() => onSelect(note.id)}
        onKeyDown={(e) => onKeyDown(e, note.id)}
        aria-current={isActive ? 'true' : undefined}
        className={`w-full text-left px-3 py-2 rounded-sm transition-colors ${
          isActive ? 'bg-field-selected' : 'hover:bg-field-hover'
        }`}
      >
        <div className="text-style-body-sm font-medium truncate text-fg">
          {noteDisplayTitle(note)}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-style-caption text-fg-body/50 leading-none">
            {formatRelativeTime(note.updatedAt)}
          </span>
          {note.tags.length > 0 && (
            <div className="flex gap-1 overflow-hidden">
              {note.tags.slice(0, 3).map((tag) => (
                <span
                  key={tag}
                  className="text-style-fineprint px-1.5 rounded-full bg-surface-raised text-fg-body truncate max-w-[60px]"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </SwipeActions>
  )
}
