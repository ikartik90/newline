import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import ThemeToggle from '@/components/ThemeToggle'
import SyncIndicator, { type SaveState } from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { ArticleEditor, type EditorSnapshot } from '@/components/article-editor'
import { NotePropertiesPanel } from '@/components/note-properties-panel'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'
import { useInputModality } from '@/hooks/use-input-modality'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import { startSyncService, stopSyncService, pushNoteNow } from '@/lib/sync-service'
import MetadataIcon from '@/assets/icons/metadata.svg'

const iconButton =
  'inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-sm text-fg-body hover:bg-field-hover transition-colors'

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
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const searchInputRef = useRef<HTMLInputElement>(null)
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus rings and hover gating follow how the app is being driven.
  useKeyboardFocus()
  useInputModality()

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

  // The editor seeds itself from these once per note; later saves must not
  // re-seed it, so they are keyed on the id alone.
  const activeNoteId = activeNote?.id ?? null
  const initialDocument = useMemo(
    () => (activeNote ? parseDocument(activeNote.body) : null),
    [activeNoteId]
  )

  /** Write a change to SQLite, then push it to Firestore, reporting each step. */
  const persist = useCallback(
    async (id: string, fields: { title?: string; body?: string; tags?: string[] }) => {
      setSaveState('saving')
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

      const updatedNote = await updateNote(id, fields)
      setSaveState('syncing')

      const noteForPush = updatedNote ?? {
        ...(activeNote as Note),
        ...fields,
        updatedAt: Date.now()
      }
      const synced = await pushNoteNow(noteForPush)

      if (synced) setSaveState('saved')
      else if (!navigator.onLine) setSaveState('offline')
      else setSaveState('error')

      fadeTimerRef.current = setTimeout(() => setSaveState('idle'), 3000)
    },
    [activeNote, updateNote]
  )

  const handleEditorChange = useCallback(
    ({ title, document }: EditorSnapshot) => {
      if (!activeNoteId) return
      void persist(activeNoteId, { title, body: serializeDocument(document) })
    },
    [activeNoteId, persist]
  )

  const handleTagsChange = useCallback(
    (tags: string[]) => {
      if (!activeNoteId) return
      void persist(activeNoteId, { tags })
    },
    [activeNoteId, persist]
  )

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-canvas">
        <div className="text-fg-body text-style-body-sm">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen />
  }

  return (
    <div className="h-screen flex bg-canvas text-fg">
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
            <span className="text-style-caption text-fg-body/50 truncate max-w-[160px]">
              {user.email}
            </span>
            <button
              type="button"
              onClick={logout}
              className="text-style-caption text-fg-body hover:text-fg transition-colors"
            >
              Sign out
            </button>
            {activeNote && (
              <button
                type="button"
                className={iconButton}
                aria-label="Note properties"
                aria-pressed={propertiesOpen}
                title="Note properties"
                onClick={() => setPropertiesOpen((open) => !open)}
              >
                <MetadataIcon className="w-5 h-5" aria-hidden />
              </button>
            )}
            <ThemeToggle theme={theme} onChange={setTheme} />
          </div>
        </div>

        {activeNote && initialDocument ? (
          <main className="flex-1 overflow-y-auto px-5 pt-8 pb-20">
            <article>
              <ArticleEditor
                key={activeNote.id}
                noteId={activeNote.id}
                initialTitle={activeNote.title}
                initialDocument={initialDocument}
                onChange={handleEditorChange}
              />
            </article>
          </main>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-style-subheading text-fg-body">Newline</h2>
              <p className="mt-2 text-style-body-sm text-fg-body/50">
                Select a note or create a new one
              </p>
              <p className="mt-1 text-style-caption text-fg-body/50">
                {window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'}N to create,{' '}
                {window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'}F to search
              </p>
              <button
                type="button"
                onClick={createNote}
                className="mt-4 h-10 px-3 text-style-body-sm rounded-md bg-branded text-fg-branded hover:opacity-90 transition-opacity"
              >
                New note
              </button>
            </div>
          </div>
        )}
      </div>

      {activeNote && propertiesOpen && (
        <NotePropertiesPanel
          key={activeNote.id}
          note={activeNote}
          onTagsChange={handleTagsChange}
          onDismiss={() => setPropertiesOpen(false)}
        />
      )}
    </div>
  )
}

export default App
