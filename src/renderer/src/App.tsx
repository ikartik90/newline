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
import SettingsIcon from '@/assets/icons/settings.svg'
import LeftSidebarIcon from '@/assets/icons/left-sidebar.svg'

const iconButton =
  'inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-sm text-fg-body not-aria-pressed:hover:bg-field-hover aria-pressed:bg-field-active aria-pressed:text-field-fg-active transition-colors'

// The top bar starts where the sidebar ends. Collapsed on macOS there is no
// sidebar left to clear the window's own controls, which are drawn over the
// content, so the bar steps past them itself.
const topBar =
  'h-12 flex items-center justify-between pr-4 shrink-0 transition-[padding] duration-200 ease-in-out'

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

  const { effectiveTheme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Only macOS hides its title bar into the content; elsewhere the controls
  // are in a bar of their own, above everything here.
  const windowControlsGutter = sidebarCollapsed && window.api.platform === 'darwin'
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

  // Sync runs in main. Signed in, the renderer asks for a cycle once (and
  // again whenever the machine comes back online) and reloads the list when
  // a pull changed something. `refresh` follows the search query, so it is
  // read through a ref rather than re-running the subscription on every
  // keystroke.
  const refreshRef = useRef(refresh)
  useEffect(() => {
    refreshRef.current = refresh
  }, [refresh])

  const userId = user?.id ?? null
  useEffect(() => {
    if (!userId) return
    const reload = () => void refreshRef.current()
    const unsubscribe = window.api.sync.onChanged(reload)
    const run = () => {
      // The cycle may be one main started before this screen was listening.
      void window.api.sync.now().then(({ pulled }) => {
        if (pulled > 0) reload()
      })
    }
    run()
    window.addEventListener('online', run)
    return () => {
      unsubscribe()
      window.removeEventListener('online', run)
    }
  }, [userId])

  // The editor seeds itself from these once per note; later saves must not
  // re-seed it, so they are keyed on the id alone.
  const activeNoteId = activeNote?.id ?? null
  const initialDocument = useMemo(
    () => (activeNote ? parseDocument(activeNote.body) : null),
    [activeNoteId]
  )

  /** Write a change to SQLite, then have main push it to the Worker, reporting each step. */
  const persist = useCallback(
    async (id: string, fields: { title?: string; body?: string; tags?: string[] }) => {
      setSaveState('saving')
      if (fadeTimerRef.current) clearTimeout(fadeTimerRef.current)

      await updateNote(id, fields)
      setSaveState('syncing')

      const synced = await window.api.sync.pushNote(id)

      if (synced) setSaveState('saved')
      else if (!navigator.onLine) setSaveState('offline')
      else setSaveState('error')

      fadeTimerRef.current = setTimeout(() => setSaveState('idle'), 3000)
    },
    [updateNote]
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
        searchInputRef={searchInputRef}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <header
          className={`${topBar} ${windowControlsGutter ? 'pl-20' : 'pl-4'}`}
          style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
          <div
            className="flex items-center gap-2"
            style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
          >
            {/* One glyph for the rail, worn at both ends of its toggle, as the
                properties rail's own dock button does. What the button is
                showing is the chip, not a change of picture. */}
            <button
              type="button"
              onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
              className={iconButton}
              aria-pressed={!sidebarCollapsed}
              title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <LeftSidebarIcon className="w-5 h-5" aria-hidden />
            </button>
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
            {/* The theme toggle, then the note's settings (the gear) last. */}
            <ThemeToggle theme={effectiveTheme} onChange={setTheme} />
            {activeNote && (
              <button
                type="button"
                className={iconButton}
                aria-label="Note properties"
                aria-pressed={propertiesOpen}
                title="Note properties"
                onClick={() => setPropertiesOpen((open) => !open)}
              >
                <SettingsIcon className="w-5 h-5" aria-hidden />
              </button>
            )}
          </div>
        </header>

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
              {/* The standalone CTA, in the pill the site's own wears: the
                  40px secondary chip on a 12px inset, floored at 80px. */}
              <button
                type="button"
                onClick={createNote}
                className="mt-4 inline-flex items-center justify-center min-w-20 h-10 px-3 rounded-full text-style-body-lg bg-button-secondary text-fg-body hover:bg-button-secondary-hover transition-colors"
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
