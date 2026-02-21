import { useState, useCallback, useEffect, useRef } from 'react'
import Sidebar from '@/components/Sidebar'
import NoteEditor from '@/components/Editor'
import ThemeToggle from '@/components/ThemeToggle'
import SyncIndicator, { type SaveState } from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboard } from '@/hooks/useKeyboard'
import { extractTags, deriveTitle } from '@/lib/markdown'
import { startSyncService, stopSyncService, pushNoteNow } from '@/lib/sync-service'

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
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useKeyboard({
    onNewNote: createNote,
    onSearch: () => {
      if (sidebarCollapsed) setSidebarCollapsed(false)
      setTimeout(() => searchInputRef.current?.focus(), 100)
    },
    onToggleSidebar: () => setSidebarCollapsed((c) => !c)
  })

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

  const handleNoteUpdate = useCallback(
    (fields: { body: string; title?: string }) => {
      if (!activeNote) return

      const tags = extractTags(fields.body)
      const title = fields.title !== undefined ? fields.title : activeNote.title
      const displayTitle = deriveTitle(title, fields.body)
      const payload = { body: fields.body, title: displayTitle, tags }

      setSaveState('saving')
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

      debounceTimerRef.current = setTimeout(async () => {
        const updatedNote = await updateNote(activeNote.id, payload)

        setSaveState('syncing')

        const noteForPush = updatedNote ?? {
          ...activeNote,
          ...payload,
          updatedAt: Date.now()
        }
        const synced = await pushNoteNow(noteForPush)

        if (synced) {
          setSaveState('saved')
        } else if (!navigator.onLine) {
          setSaveState('offline')
        } else {
          setSaveState('error')
        }

        fadeTimerRef.current = setTimeout(() => setSaveState('idle'), 3000)
      }, 300)
    },
    [activeNote, updateNote]
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
        searchInputRef={searchInputRef}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <div
          className="h-12 flex items-center justify-between px-4 shrink-0"
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
            <SyncIndicator saveState={saveState} />
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
              <p className="mt-1 text-xs text-neutral-300 dark:text-neutral-700">
                {window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'}N to create,{' '}
                {window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'}F to search
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
