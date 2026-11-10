import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { AccountMenu } from '@/components/account-menu'
import { SettingsDialog } from '@/components/settings-dialog'
import SyncIndicator, { type SaveState } from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { ArticleEditor, type EditorSnapshot } from '@/components/article-editor'
import { NotePropertiesPanel } from '@/components/note-properties-panel'
import { CommandMenu, type CommandMenuAction } from '@/components/command-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'
import { useInputModality } from '@/hooks/use-input-modality'
import { useFullScreen } from '@/hooks/use-full-screen'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import { noteDisplayTitle } from '@/utils/note-display'
import SettingsIcon from '@/assets/icons/settings.svg'
import LeftSidebarIcon from '@/assets/icons/left-sidebar.svg'
import AddIcon from '@/assets/icons/add.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import MetadataIcon from '@/assets/icons/metadata.svg'
import DarkIcon from '@/assets/icons/dark.svg'
import LightIcon from '@/assets/icons/light.svg'

// Cornered and inked as the sidebar's rows are.
const iconButton =
  'inline-flex items-center justify-center shrink-0 w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-lg squircle text-fg hover:bg-field-hover transition-colors'

// One bar is fixed across the top of the window, over the rail and the note
// pane alike, and holds only the sidebar toggle. It stays put whether the rail
// is open or not: beside the window's own controls on macOS, which the OS
// draws over that corner (main/index.ts centres them in these 48px), or at the
// edge elsewhere. The bar is the window's drag handle; what scrolls does so in
// the pane below it.
const topBar =
  'absolute top-0 inset-x-0 z-10 h-12 flex items-center transition-[filter] duration-200 ease-in-out'
// The traffic lights start 16px in (main/index.ts) and are three 14px buttons
// 9px apart, so the last ends at 76px; the toggle keeps the same 9px after it.
// Where there are no lights (full screen, other platforms) it takes the first
// one's place: its glyph centred at 23px, on the sidebar's glyphs.
const toggleSlotPastWindowControls = 'flex items-center h-full pl-[85px]'
const toggleSlotAtEdge = 'flex items-center h-full pl-[9px]'
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// The note pane runs to the window's edges with no margin of its own; its
// spacing is inside it. Its first 48px are under the bar. Beside the rail a
// hairline is the only line between the two; alone it needs none.
const notePane = 'flex-1 flex min-w-0 pt-12 bg-canvas'
const notePaneBesideRail = `${notePane} border-l-[0.5px] border-divider`

function App() {
  const { user, loading: authLoading, logout } = useAuth()
  const {
    notes,
    activeNote,
    activeId,
    setActiveId,
    openNote,
    createNote,
    updateNote,
    deleteNote,
    refresh
  } = useNotes()

  const { theme, effectiveTheme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const sidebarResize = useSidebarResize(shellRef)
  // Only macOS hides its title bar into the content, and only out of full
  // screen; elsewhere the window's controls are in a frame of their own.
  const fullScreen = useFullScreen()
  const windowControlsGutter = window.api.platform === 'darwin' && !fullScreen
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  // The note a delete has been asked for and not yet answered.
  const [pendingDelete, setPendingDelete] = useState<Note | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const fadeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Focus rings and hover gating follow how the app is being driven.
  useKeyboardFocus()
  useInputModality()

  // Search IS the command menu, so ⌘F opens it as ⌘K does.
  useKeyboard({
    onNewNote: createNote,
    onSearch: () => setCommandMenuOpen(true),
    onToggleSidebar: () => setSidebarCollapsed((c) => !c),
    onCommandMenu: () => setCommandMenuOpen((open) => !open)
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

  // A deletion is a tombstone that reaches every device, with no bin to take
  // it back from — so every way of asking for one (the row's swipe, its
  // Backspace, the command menu) comes here and is confirmed first.
  const askDelete = useCallback(
    (id: string) => {
      const note = notes.find((n) => n.id === id)
      if (note) setPendingDelete(note)
    },
    [notes]
  )

  const commands: CommandMenuAction[] = [
    {
      id: 'new-note',
      label: 'New note',
      icon: AddIcon,
      shortcut: 'N',
      run: () => void createNote()
    },
    {
      id: 'sidebar',
      label: sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar',
      icon: LeftSidebarIcon,
      shortcut: '\\',
      run: () => setSidebarCollapsed((c) => !c)
    },
    ...(activeNote
      ? [
          {
            id: 'properties',
            label: 'Note properties',
            icon: MetadataIcon,
            run: () => setPropertiesOpen((open) => !open)
          },
          {
            id: 'delete',
            label: 'Delete note',
            icon: TrashIcon,
            run: () => askDelete(activeNote.id)
          }
        ]
      : []),
    // Last, so the bottom of the menu is never Delete note.
    {
      id: 'theme',
      label: effectiveTheme === 'dark' ? 'Light theme' : 'Dark theme',
      icon: effectiveTheme === 'dark' ? LightIcon : DarkIcon,
      group: 'Settings',
      run: () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
    }
  ]

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

  const modifier = window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'
  // On macOS the shell behind everything is the window's own frosted glass
  // and the page is clear there; elsewhere the shell paints its own surface.
  const frosted = window.api.platform === 'darwin'

  return (
    <div
      ref={shellRef}
      style={sidebarResize.shellStyle}
      className={
        frosted ? 'relative h-screen flex text-fg' : 'relative h-screen flex bg-surface text-fg'
      }
    >
      <header
        data-on-glass=""
        className={topBar}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        <div className={windowControlsGutter ? toggleSlotPastWindowControls : toggleSlotAtEdge}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className={iconButton}
            style={noDrag}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <LeftSidebarIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </header>

      <Sidebar
        notes={notes}
        activeId={activeId}
        onSelect={setActiveId}
        onDelete={askDelete}
        onNewNote={createNote}
        onSearch={() => setCommandMenuOpen(true)}
        collapsed={sidebarCollapsed}
        resizing={sidebarResize.resizing}
        footer={
          <>
            <AccountMenu user={user} onSignOut={logout} />
            <SyncIndicator saveState={saveState} />
            <button
              type="button"
              className={iconButton}
              aria-label="Settings"
              title="Settings"
              onClick={() => setSettingsOpen(true)}
            >
              <SettingsIcon className="w-5 h-5" aria-hidden />
            </button>
          </>
        }
      />

      {!sidebarCollapsed && (
        <SidebarResizeHandle
          resizing={sidebarResize.resizing}
          handleProps={sidebarResize.handleProps}
        />
      )}

      <div className={sidebarCollapsed ? notePane : notePaneBesideRail}>
        <div className="flex-1 flex flex-col min-w-0">
          {activeNote && initialDocument ? (
            <main className="flex-1 overflow-y-auto px-5 pt-4 pb-20">
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
                  {modifier}N to create, {modifier}K to search
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

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />

      <CommandMenu
        open={commandMenuOpen}
        onClose={() => setCommandMenuOpen(false)}
        actions={commands}
        onOpenNote={openNote}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete Note"
        message={`You are about to delete “${pendingDelete ? noteDisplayTitle(pendingDelete) : 'this note'}”. This cannot be undone.`}
        confirmLabel="Delete"
        confirmIcon={TrashIcon}
        onConfirm={() => {
          if (pendingDelete) void deleteNote(pendingDelete.id)
        }}
        onClose={() => setPendingDelete(null)}
      />
    </div>
  )
}

export default App
