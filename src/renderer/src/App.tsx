import { useState, useCallback } from 'react'
import Sidebar from '@/components/Sidebar'
import NoteEditor from '@/components/Editor'
import ThemeToggle from '@/components/ThemeToggle'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { extractTags, deriveTitle } from '@/lib/markdown'

function App() {
  const {
    notes,
    activeNote,
    activeId,
    setActiveId,
    searchQuery,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote
  } = useNotes()

  const { theme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  const handleNoteUpdate = useCallback(
    (fields: { body: string; title?: string }) => {
      if (!activeNote) return

      const tags = extractTags(fields.body)
      const title = fields.title !== undefined ? fields.title : activeNote.title
      const displayTitle = deriveTitle(title, fields.body)

      updateNote(activeNote.id, {
        body: fields.body,
        title: displayTitle,
        tags
      })
    },
    [activeNote, updateNote]
  )

  return (
    <div className="h-screen flex bg-white dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      <Sidebar
        notes={notes}
        activeId={activeId}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
        onSelect={setActiveId}
        onCreate={createNote}
        onDelete={deleteNote}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="h-12 flex items-center justify-end px-4 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </div>

        {activeNote ? (
          <NoteEditor note={activeNote} onUpdate={handleNoteUpdate} />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-neutral-300 dark:text-neutral-700">
                Newline
              </h2>
              <p className="mt-2 text-sm text-neutral-400 dark:text-neutral-600">
                Select a note or create a new one
              </p>
              <button
                onClick={createNote}
                className="mt-4 px-4 py-2 text-sm rounded-lg bg-neutral-900 dark:bg-neutral-100 text-white dark:text-neutral-900 hover:opacity-90 transition-opacity"
              >
                New note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default App
