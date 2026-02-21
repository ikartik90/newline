import { useCallback, useRef, useEffect } from 'react'
import { List } from 'react-window'

interface SidebarProps {
  notes: Note[]
  activeId: string | null
  searchQuery: string
  onSearch: (query: string) => void
  onSelect: (id: string) => void
  onCreate: () => void
  onDelete: (id: string) => void
  collapsed: boolean
  onToggle: () => void
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

const NOTE_ROW_HEIGHT = 56

export default function Sidebar({
  notes,
  activeId,
  searchQuery,
  onSearch,
  onSelect,
  onCreate,
  onDelete,
  collapsed,
  onToggle,
  searchInputRef
}: SidebarProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const listHeight = useRef(400)

  useEffect(() => {
    if (listRef.current) {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          listHeight.current = entry.contentRect.height
        }
      })
      observer.observe(listRef.current)
      return () => observer.disconnect()
    }
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
    <div
      className={`border-r border-neutral-200 dark:border-neutral-800 flex flex-col bg-neutral-100/50 dark:bg-neutral-900/50 transition-all duration-200 ease-in-out overflow-hidden ${
        collapsed ? 'w-12' : 'w-64'
      }`}
    >
      <div
        className="h-12 flex items-center justify-between px-3 shrink-0"
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <button
          onClick={onToggle}
          className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'}
            />
          </svg>
        </button>
        {!collapsed && (
          <button
            onClick={onCreate}
            className="p-1.5 rounded-lg hover:bg-neutral-200 dark:hover:bg-neutral-800 text-neutral-500"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
            title="New note"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          </button>
        )}
      </div>

      {!collapsed && (
        <>
          <div className="px-2 pb-2">
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearch(e.target.value)}
              placeholder="Search notes…"
              className="w-full px-3 py-1.5 text-sm rounded-lg bg-neutral-200/60 dark:bg-neutral-800/60 border-none outline-none placeholder:text-neutral-400 dark:placeholder:text-neutral-600 focus:ring-1 focus:ring-neutral-300 dark:focus:ring-neutral-700"
            />
          </div>

          <div ref={listRef} className="flex-1 overflow-hidden px-1">
            {notes.length === 0 ? (
              <p className="px-3 py-6 text-sm text-neutral-400 dark:text-neutral-600 text-center">
                {searchQuery ? 'No results' : 'No notes yet'}
              </p>
            ) : notes.length < 100 ? (
              notes.map((note) => (
                <NoteItem
                  key={note.id}
                  note={note}
                  isActive={note.id === activeId}
                  onSelect={onSelect}
                  onKeyDown={handleKeyDown}
                />
              ))
            ) : (
              <List
                height={listHeight.current}
                itemCount={notes.length}
                itemSize={NOTE_ROW_HEIGHT}
                width="100%"
              >
                {({ index, style }) => (
                  <div style={style}>
                    <NoteItem
                      note={notes[index]}
                      isActive={notes[index].id === activeId}
                      onSelect={onSelect}
                      onKeyDown={handleKeyDown}
                    />
                  </div>
                )}
              </List>
            )}
          </div>
        </>
      )}
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
      onClick={() => onSelect(note.id)}
      onKeyDown={(e) => onKeyDown(e, note.id)}
      className={`w-full text-left px-3 py-2 rounded-lg mb-0.5 transition-colors ${
        isActive
          ? 'bg-neutral-200 dark:bg-neutral-800'
          : 'hover:bg-neutral-200/50 dark:hover:bg-neutral-800/50'
      }`}
    >
      <div className="text-sm font-medium truncate text-neutral-800 dark:text-neutral-200">
        {note.title || 'Untitled'}
      </div>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="text-xs text-neutral-400 dark:text-neutral-600">
          {formatRelativeTime(note.updatedAt)}
        </span>
        {note.tags.length > 0 && (
          <div className="flex gap-1 overflow-hidden">
            {note.tags.slice(0, 3).map((tag) => (
              <span
                key={tag}
                className="text-[10px] px-1.5 py-0.5 rounded-full bg-neutral-200 dark:bg-neutral-700 text-neutral-500 dark:text-neutral-400 truncate max-w-[60px]"
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
