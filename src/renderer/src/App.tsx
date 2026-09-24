import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { SearchField } from '@/components/search-field'
import ThemeToggle from '@/components/ThemeToggle'
import SyncIndicator, { type SaveState } from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { ArticleEditor, type EditorSnapshot } from '@/components/article-editor'
import { NotePropertiesPanel } from '@/components/note-properties-panel'
import { CommandMenu, type CommandMenuAction } from '@/components/command-menu'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'
import { useInputModality } from '@/hooks/use-input-modality'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import { noteDisplayTitle } from '@/utils/note-display'
import SettingsIcon from '@/assets/icons/settings.svg'
import LeftSidebarIcon from '@/assets/icons/left-sidebar.svg'
import AddIcon from '@/assets/icons/add.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import DarkIcon from '@/assets/icons/dark.svg'
import LightIcon from '@/assets/icons/light.svg'

const iconButton =
  'inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-sm text-fg-body not-aria-pressed:hover:bg-field-hover aria-pressed:bg-field-active aria-pressed:text-field-fg-active transition-colors'

// The top bar stands on the glass across the whole window, above the rail and
// the card alike, and ends on the card's right edge so what it holds can line
// up with the card. Nothing in it goes when the rail collapses.
const topBar = 'relative h-12 flex items-center pr-(--size-shell-inset) shrink-0'
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties

// The bar's left end is the rail's. While the rail is open its toggle and the
// new-note button sit at its far end, ending on the rows' own right edge;
// collapsed, they come to the bar's start — past the window's own controls,
// which macOS draws over that corner, or on the rail's 8px inset elsewhere.
// The widths are explicit so the move runs on the rail's own clock: the two
// 28px chips, their 4px gap and the 8px inset, after the 80px gutter or not.
const railControls =
  'flex items-center justify-end gap-1 pr-2 shrink-0 transition-[width] duration-200 ease-in-out'
const railControlsOpen = `${railControls} w-64`
const railControlsPastWindowControls = `${railControls} w-[148px]`
const railControlsAtEdge = `${railControls} w-[76px]`

// The search is centred over the note panel, whichever width the rail has:
// halfway between the panel's left edge — the rail's, or the shell inset once
// the rail has gone — and its right, the window's less that inset. It moves
// on the rail's clock too.
const searchSlot =
  'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-200 ease-in-out'
const searchSlotLeft = (railWidth: string) =>
  `calc((${railWidth} + 100% - var(--size-shell-inset)) / 2)`

// The pill the standalone CTA wears everywhere else — a filled secondary chip,
// fully rounded (the site's own `About me`).
const newNoteButton =
  'inline-flex items-center justify-center w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-full bg-button-secondary text-fg-body hover:bg-button-secondary-hover transition-colors'

// The note panel floats on the shell as a card under the top bar, inset from
// the window so the glass shows around it, with a corner derived from the
// window's own (main.css, `--size-note-panel-radius`); a hairline and a soft
// drop mark its edge on either theme's glass. Its top is the top bar's foot,
// the line the rail's rows start on too. The properties rail docks inside it.
//
// Beside the open sidebar the card keeps no left margin of its own: the rail's
// 8px inset is the gap, so a row sits as far from the card's edge as it does
// from the window's. Collapsed, there is no rail to provide it, and the card
// steps in by the same 8px itself. The margin moves on the rail's own clock.
const notePanelShell =
  'flex-1 flex min-w-0 mb-(--size-shell-inset) mr-(--size-shell-inset) rounded-(--size-note-panel-radius) bg-canvas overflow-hidden shadow-[0_0_0_0.5px_var(--border-divider),0_2px_8px_color-mix(in_srgb,var(--color-neutral-900)_10%,transparent)] transition-[margin] duration-200 ease-in-out'
const notePanelBesideRail = `${notePanelShell} ml-0`
const notePanelAlone = `${notePanelShell} ml-(--size-shell-inset)`

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

  const { effectiveTheme, setTheme } = useTheme()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  // Only macOS hides its title bar into the content; elsewhere the controls
  // are in a bar of their own, above everything here.
  const windowControlsGutter = window.api.platform === 'darwin'
  const [propertiesOpen, setPropertiesOpen] = useState(false)
  const [commandMenuOpen, setCommandMenuOpen] = useState(false)
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
    {
      id: 'theme',
      label: effectiveTheme === 'dark' ? 'Light theme' : 'Dark theme',
      icon: effectiveTheme === 'dark' ? LightIcon : DarkIcon,
      run: () => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
    },
    ...(activeNote
      ? [
          {
            id: 'properties',
            label: 'Note properties',
            icon: SettingsIcon,
            run: () => setPropertiesOpen((open) => !open)
          },
          {
            id: 'delete',
            label: 'Delete note',
            icon: TrashIcon,
            run: () => askDelete(activeNote.id)
          }
        ]
      : [])
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
      className={
        frosted ? 'h-screen flex flex-col text-fg' : 'h-screen flex flex-col bg-surface text-fg'
      }
    >
      <header className={topBar} style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
        <div
          className={
            !sidebarCollapsed
              ? railControlsOpen
              : windowControlsGutter
                ? railControlsPastWindowControls
                : railControlsAtEdge
          }
          style={noDrag}
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
          <button
            type="button"
            onClick={createNote}
            className={newNoteButton}
            title="New note"
            aria-label="New note"
          >
            <AddIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div
          className={searchSlot}
          style={{
            ...noDrag,
            left: searchSlotLeft(sidebarCollapsed ? 'var(--size-shell-inset)' : '256px')
          }}
        >
          <SearchField onOpen={() => setCommandMenuOpen(true)} className="w-60" />
        </div>
        <div className="ml-auto flex items-center gap-2" style={noDrag}>
          <SyncIndicator saveState={saveState} />
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

      <div className="flex-1 flex min-h-0">
        <Sidebar
          notes={notes}
          activeId={activeId}
          onSelect={setActiveId}
          onDelete={askDelete}
          collapsed={sidebarCollapsed}
        />

        <div className={sidebarCollapsed ? notePanelAlone : notePanelBesideRail}>
          <div className="flex-1 flex flex-col min-w-0">
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
      </div>

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
