import { useState, useCallback, useEffect } from 'react'
import Sidebar from '@/components/Sidebar'
import NoteEditor from '@/components/Editor'
import ThemeToggle from '@/components/ThemeToggle'
import SyncIndicator from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useDebouncedCallback } from '@/hooks/useDebounce'
import { extractTags, deriveTitle } from '@/lib/markdown'
import { startSyncService, stopSyncService } from '@/lib/sync-service'

function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const {
    notes,
    activeNote,
    activeId,
    setActiveId,
    searchQuery,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
    refresh
  } = useNotes()

  const { theme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (user) {
      startSyncService(user.uid)
      return () => stopSyncService()
    }
  }, [user])

  useEffect(() => {
    if (user) {
      const interval = setInterval(refresh, 60_000)
      return () => clearInterval(interval)
    }
  }, [user, refresh])

  const debouncedSave = useDebouncedCallback(
    (id: string, fields: { body?: string; title?: string; tags?: string[] }) => {
      updateNote(id, fields)
    },
    500
  )

  const handleNoteUpdate = useCallback(
    (fields: { body: string; title?: string }) => {
      if (!activeNote) return

      const tags = extractTags(fields.body)
      const title = fields.title !== undefined ? fields.title : activeNote.title
      const displayTitle = deriveTitle(title, fields.body)

      debouncedSave(activeNote.id, {
        body: fields.body,
        title: displayTitle,
        tags
      })
    },
    [activeNote, debouncedSave]
  )

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-950">
        <div className="text-neutral-400 dark:text-neutral-600 text-sm">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen />
  }

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
          className="h-12 flex items-center justify-between px-4 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SyncIndicator />
          </div>
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            <span className="text-xs text-neutral-400 dark:text-neutral-600 truncate max-w-[120px]">
              {user.email}
            </span>
            <button
              onClick={logout}
              className="text-xs text-neutral-400 hover:text-neutral-600 dark:text-neutral-600 dark:hover:text-neutral-400"
            >
              Sign out
            </button>
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
