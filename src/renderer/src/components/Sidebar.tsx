import { useCallback, useEffect, useRef, useState } from 'react'
import { List, type RowComponentProps } from 'react-window'
import AddIcon from '@/assets/icons/add.svg'

interface SidebarProps {
  notes: Note[]
  activeId: string | null
  searchQuery: string
  onSearch: (query: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  collapsed: boolean
  searchInputRef?: React.RefObject<HTMLInputElement | null>
}

function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}

const TITLE_LENGTH = 40

/** What the list calls a note: its title, else its first line, else Untitled. */
export function noteDisplayTitle(note: Pick<Note, 'title' | 'plainText'>): string {
  if (note.title.trim()) return note.title.trim()
  const firstLine = (note.plainText ?? '').split('\n').find((line) => line.trim())
  return firstLine ? firstLine.trim().slice(0, TITLE_LENGTH) : 'Untitled'
}

const NOTE_ROW_HEIGHT = 56
/** Below this many notes the list renders plainly; above it, virtualised. */
const VIRTUALISE_FROM = 100

// Collapsed the rail keeps no width at all: with the toggle now in the top bar
// there is nothing left in here to show, and a divider down an empty strip
// reads as a seam rather than an edge.
const sidebarShell =
  'flex flex-col bg-surface/50 transition-[width] duration-200 ease-in-out overflow-hidden'

// The pill the standalone CTA wears everywhere else — a filled secondary chip,
// fully rounded (the site's own `About me`).
const newNoteButton =
  'inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-full bg-button-secondary text-fg-body hover:bg-button-secondary-hover transition-colors'

export default function Sidebar({
  notes,
  activeId,
  searchQuery,
  onSearch,
  onSelect,
  onCreate,
  onDelete,
  collapsed,
  searchInputRef
}: SidebarProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const [listHeight, setListHeight] = useState(400)

  useEffect(() => {
    if (!listRef.current) return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setListHeight(entry.contentRect.height)
    })
    observer.observe(listRef.current)
    return () => observer.disconnect()
  }, [collapsed])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent, id: string) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        onDelete(id)
      }
    },
    [onDelete]
  )

  return (
    <aside
      aria-label="Notes"
      className={`${sidebarShell} ${collapsed ? 'w-0' : 'w-64 border-r border-divider'}`}
    >
      {!collapsed && (
        <>
          {/* macOS draws the window's own controls over the left of this row,
              so the note button keeps to the far end of it. */}
          <div
            className="h-12 flex items-center justify-end px-2 shrink-0"
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
          >
            <button
              type="button"
              onClick={onCreate}
              className={newNoteButton}
              style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
              title="New note"
              aria-label="New note"
            >
              <AddIcon className="w-5 h-5" aria-hidden />
            </button>
          </div>

          <div className="px-2 pb-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search notes…"
              aria-label="Search notes"
              className="w-full h-8 px-3 text-style-body-sm rounded-sm bg-field text-field-fg placeholder:text-field-fg-placeholder border-[0.5px] border-solid border-field-border outline-none focus:border-field-border-active focus:bg-field-active"
            />
          </div>

          <div ref={listRef} className="flex-1 overflow-hidden px-1">
            {notes.length === 0 ? (
              <p className="px-3 py-6 text-style-body-sm text-fg-body/50 text-center">
                {searchQuery ? 'No results' : 'No notes yet'}
              </p>
            ) : notes.length < VIRTUALISE_FROM ? (
              <div className="h-full overflow-y-auto">
                {notes.map((note) => (
                  <NoteItem
                    key={note.id}
                    note={note}
                    isActive={note.id === activeId}
                    onSelect={onSelect}
                    onKeyDown={handleKeyDown}
                  />
                ))}
              </div>
            ) : (
              <List
                style={{ height: listHeight }}
                rowComponent={NoteRow}
                rowCount={notes.length}
                rowHeight={NOTE_ROW_HEIGHT}
                rowProps={{ notes, activeId, onSelect, onKeyDown: handleKeyDown }}
              />
            )}
          </div>
        </>
      )}
    </aside>
  )
}

interface NoteRowProps {
  notes: Note[]
  activeId: string | null
  onSelect: (id: string) => void
  onKeyDown: (e: React.KeyboardEvent, id: string) => void
}

function NoteRow({
  index,
  style,
  notes,
  activeId,
  onSelect,
  onKeyDown
}: RowComponentProps<NoteRowProps>) {
  const note = notes[index]
  return (
    <div style={style}>
      <NoteItem
        note={note}
        isActive={note.id === activeId}
        onSelect={onSelect}
        onKeyDown={onKeyDown}
      />
    </div>
  )
}

function NoteItem({
  note,
  isActive,
  onSelect,
  onKeyDown
}: {
  note: Note
  isActive: boolean
  onSelect: (id: string) => void
  onKeyDown: (e: React.KeyboardEvent, id: string) => void
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(note.id)}
      onKeyDown={(e) => onKeyDown(e, note.id)}
      aria-current={isActive ? 'true' : undefined}
      className={`w-full text-left px-3 py-2 rounded-sm mb-0.5 transition-colors ${
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
  )
}
