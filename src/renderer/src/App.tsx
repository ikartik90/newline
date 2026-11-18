import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Sidebar from '@/components/Sidebar'
import { AccountMenu } from '@/components/account-menu'
import { SettingsDialog } from '@/components/settings-dialog'
import SyncIndicator, { type SaveState } from '@/components/SyncIndicator'
import AuthScreen from '@/components/auth/AuthScreen'
import { ArticleEditor, type EditorSnapshot } from '@/components/article-editor'
import { NotePropertiesPanel } from '@/components/note-properties-panel'
import { CommandMenu } from '@/components/command-menu'
import { commandMenuActions, type CommandId } from '@/components/command-menu-actions'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { SidebarResizeHandle } from '@/components/sidebar-resize-handle'
import { AssistantSidebar } from '@/components/assistant-sidebar'
import { useNotes } from '@/hooks/useNotes'
import { useTheme } from '@/hooks/useTheme'
import { useAuth } from '@/hooks/useAuth'
import { useKeyboard } from '@/hooks/useKeyboard'
import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'
import { useInputModality } from '@/hooks/use-input-modality'
import { useFullScreen } from '@/hooks/use-full-screen'
import { useSidebarResize } from '@/hooks/use-sidebar-resize'
import { ASSISTANT_RAIL } from '@/utils/sidebar-width'
import { useSidebarGlass } from '@/hooks/use-sidebar-glass'
import { useSidebarPeek } from '@/hooks/use-sidebar-peek'
import { useWindowGlassHeld } from '@/hooks/use-window-glass'
import { useScrolled } from '@/hooks/use-scrolled'
import { parseDocument, serializeDocument } from '@shared/domain/document'
import { noteDisplayTitle } from '@/utils/note-display'
import { insertReply } from '@/utils/insert-reply'
import { useEditorStore } from '@/store/editor'
import SettingsIcon from '@/assets/icons/settings.svg'
import LeftSidebarIcon from '@/assets/icons/left-sidebar.svg'
import NoteSparkleIcon from '@/assets/icons/note-sparkle.svg'
import TrashIcon from '@/assets/icons/trash.svg'

// Cornered as an icon button and the sidebar's rows are, and inked as the rows are.
const iconButton =
  'inline-flex items-center justify-center shrink-0 w-(--size-toolbar-button) h-(--size-toolbar-button) rounded-xl text-ink-body hover:bg-bg-field-hover transition-colors'

// One bar is fixed across the top of the window, over the rail and the note
// pane alike, and holds the two rails' toggles: the notes sidebar's at the
// left and Gemma's at the right. They stay put whether the rails are open or
// not: the left one beside the window's own controls on macOS, which the OS
// draws over that corner (main/index.ts centres them in these 48px), or at the
// edge elsewhere. The bar is the window's drag handle; what scrolls does so in
// the pane below it.
// Its toggle is inked in the sidebar's grey, as the sidebar's own glyphs are.
// While the sidebar is open the toggle stands on it, so it takes the sidebar's
// level, as the settings gear does; collapsed, it stands on the canvas, and
// peeked at it stands on the sidebar's solid sheet, off the glass.
const topBar =
  'absolute top-0 inset-x-0 z-10 h-12 flex items-center transition-[filter] duration-200 ease-in-out [--ink-body:var(--ink-sidebar)]'
const topBarOverSidebar = `${topBar} bg-level-1`
// The traffic lights start 16px in (main/index.ts) and are three 14px buttons
// 9px apart, so the last ends at 76px; the toggle keeps the same 9px after it.
// Where there are no lights (full screen, other platforms) it takes the first
// one's place: its glyph centred at 23px, on the sidebar's glyphs.
const toggleSlotPastWindowControls = 'flex items-center h-full pl-[85px]'
const toggleSlotAtEdge = 'flex items-center h-full pl-[9px]'
// Gemma's toggle mirrors the sidebar toggle's full-screen place at the right edge.
// While the rail is open the toggle stands on it, and takes its level, on the
// glass, as the sidebar's toggle does over the sidebar.
const assistantSlot = 'ml-auto flex items-center h-full pr-[9px]'
const assistantSlotOverRail = 'ml-auto flex items-center h-full pr-[9px] bg-level-1'
const noDrag = { WebkitAppRegion: 'no-drag' } as React.CSSProperties
// The page never sees the pointer on the drag handle, so over a peek the bar is
// the page's as far as the sidebar reaches: going along it past the sidebar's
// edge is then seen as leaving, and lets the peek go. It lies under the
// toggle, which it would otherwise cover.
const barOverPeek =
  'absolute -z-10 inset-y-0 left-0 w-(--size-sidebar) [-webkit-app-region:no-drag]'

// While the glass palette or a dialog stands on it, main lays glass under the
// whole window and everything the page holds fades, so only that stands over
// the glass.
const shellStyle =
  'relative h-screen flex text-ink-body opacity-100 transition-opacity duration-150'
const shellFadedStyle =
  'relative h-screen flex text-ink-body opacity-0 transition-opacity duration-150'
const solidShellStyle = 'relative h-screen flex bg-bg-sheet text-ink-body'
// Under the palette, a press anywhere in the window only closes it; it
// outlasts the palette to the end of the press.
const paletteBackdropStyle = 'fixed inset-0 z-50'
// The note pane runs to the window's edges with no margin of its own; its
// spacing is inside it. Its first 48px are under the bar. The line between
// it and the rail is the rail's own edge.
const notePane = 'flex-1 flex min-w-0 pt-12 bg-bg-canvas'

// Once the note has scrolled under the bar, a hairline rules the bar off from
// it. It stands on the note column's top, which is the bar's foot.
const noteEdge =
  'absolute top-0 inset-x-0 border-t border-border-divider pointer-events-none transition-opacity duration-150'
const noteEdgeHidden = `${noteEdge} opacity-0`
const noteEdgeShown = `${noteEdge} opacity-100`

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
  const [assistantOpen, setAssistantOpen] = useState(false)
  const shellRef = useRef<HTMLDivElement>(null)
  const sidebarResize = useSidebarResize(shellRef)
  const railResize = useSidebarResize(shellRef, ASSISTANT_RAIL)
  const [sidebarElement, setSidebarElement] = useState<HTMLElement | null>(null)
  useSidebarGlass(sidebarElement, sidebarCollapsed ? 0 : sidebarResize.width)
  const sidebarPeek = useSidebarPeek({
    collapsed: sidebarCollapsed,
    width: sidebarResize.width
  })
  const noteScroll = useScrolled()
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

  // Where main has made the glass palette, the menu is its window over this
  // one, and ⌘K there closes it; otherwise it is the dialog in the page.
  const palette = window.api.palette?.native ? window.api.palette : null
  const menuState: CommandMenuState = {
    sidebarCollapsed,
    noteOpen: activeNote !== null,
    assistantOpen,
    theme: effectiveTheme === 'dark' ? 'dark' : 'light'
  }
  const openCommandMenu = () => (palette ? palette.open(menuState) : setCommandMenuOpen(true))

  // Search IS the command menu, so ⌘F opens it as ⌘K does.
  useKeyboard({
    onNewNote: createNote,
    onSearch: openCommandMenu,
    onToggleSidebar: () => setSidebarCollapsed((c) => !c),
    onCommandMenu: () => (palette ? palette.open(menuState) : setCommandMenuOpen((open) => !open))
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

  // A reply goes in through the editor's own store, so it is one undo step
  // and saves as any edit does.
  const handleInsertReply = useCallback(
    (markdown: string) => {
      const editor = useEditorStore.getState()
      if (!activeNoteId || editor.noteId !== activeNoteId) return
      const document = insertReply(editor.document, markdown)
      editor.setDocument(document)
      editor.pushHistory({ title: editor.title, document })
    },
    [activeNoteId]
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

  const runCommand = (id: CommandId) => {
    if (id === 'new-note') void createNote()
    else if (id === 'sidebar') setSidebarCollapsed((c) => !c)
    else if (id === 'assistant') setAssistantOpen((open) => !open)
    else if (id === 'properties' && activeNote) setPropertiesOpen((open) => !open)
    else if (id === 'delete' && activeNote) askDelete(activeNote.id)
    else if (id === 'theme') setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')
  }
  const commands = commandMenuActions(menuState, runCommand)

  // What is picked in the glass palette arrives from main, and is done with
  // the window as it stands then.
  const runCommandRef = useRef(runCommand)
  useEffect(() => {
    runCommandRef.current = runCommand
  })
  useEffect(() => {
    if (!palette) return
    const offCommand = palette.onCommand((id) => runCommandRef.current(id as CommandId))
    const offNote = palette.onOpenNote(openNote)
    return () => {
      offCommand()
      offNote()
    }
  }, [palette, openNote])
  // The window dims under the palette while it shows, as under a dialog.
  const [paletteShown, setPaletteShown] = useState(false)
  useEffect(() => palette?.onVisible(setPaletteShown), [palette])
  const onWindowGlass = useWindowGlassHeld()
  // A press on the dim only closes the palette. The dim stays, clear, to the
  // end of the press, or the click would land on whatever is under it once
  // main has hidden the palette.
  const [dimPressed, setDimPressed] = useState(false)
  const pressDim = () => {
    setDimPressed(true)
    palette?.close()
    const release = () => {
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      // After the click this press makes, which lands on the dim.
      setTimeout(() => setDimPressed(false))
    }
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
  }

  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-bg-canvas">
        <div className="text-ink-body text-style-body-sm">Loading…</div>
      </div>
    )
  }

  if (!user) {
    return <AuthScreen />
  }

  const modifier = window.api.platform === 'darwin' ? '⌘' : 'Ctrl+'
  // Where the window is the OS's own blur (macOS, Windows 11's acrylic) the
  // shell behind everything is that and the page is clear there; elsewhere
  // the shell paints its own surface.
  const frosted = window.api.frosted

  return (
    <div
      ref={shellRef}
      style={{ ...sidebarResize.shellStyle, ...railResize.shellStyle }}
      className={
        !frosted ? solidShellStyle : paletteShown || onWindowGlass ? shellFadedStyle : shellStyle
      }
    >
      <header
        data-on-glass={sidebarCollapsed ? undefined : ''}
        className={sidebarCollapsed && !sidebarPeek.peeking ? topBar : topBarOverSidebar}
        style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
      >
        {sidebarPeek.peeking && <div data-sidebar-span className={barOverPeek} />}
        <div className={windowControlsGutter ? toggleSlotPastWindowControls : toggleSlotAtEdge}>
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            onPointerEnter={sidebarPeek.onToggleEnter}
            className={iconButton}
            style={noDrag}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <LeftSidebarIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div
          data-on-glass={assistantOpen ? '' : undefined}
          className={assistantOpen ? assistantSlotOverRail : assistantSlot}
        >
          <button
            type="button"
            onClick={() => setAssistantOpen(!assistantOpen)}
            className={iconButton}
            style={noDrag}
            title={assistantOpen ? 'Hide Gemma' : 'Ask Gemma'}
            aria-label={assistantOpen ? 'Hide Gemma' : 'Ask Gemma'}
            aria-pressed={assistantOpen}
          >
            <NoteSparkleIcon className="w-5 h-5" aria-hidden />
          </button>
        </div>
      </header>

      <Sidebar
        ref={setSidebarElement}
        notes={notes}
        activeId={activeId}
        onSelect={setActiveId}
        onDelete={askDelete}
        onNewNote={createNote}
        onSearch={openCommandMenu}
        collapsed={sidebarCollapsed}
        peeking={sidebarPeek.peeking}
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

      <div className={notePane}>
        <div className="relative flex-1 flex flex-col min-w-0">
          {activeNote && initialDocument ? (
            <main
              ref={noteScroll.ref}
              onScroll={noteScroll.onScroll}
              className="flex-1 overflow-y-auto px-5 pt-4 pb-20"
            >
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
                <h2 className="text-style-subheading text-ink-body">Newline</h2>
                <p className="mt-2 text-style-body-sm text-ink-body/50">
                  Select a note or create a new one
                </p>
                <p className="mt-1 text-style-caption text-ink-body/50">
                  {modifier}N to create, {modifier}K to search
                </p>
                {/* The standalone CTA, in the pill the site's own wears: the
                    40px secondary chip on a 12px inset, floored at 80px. */}
                <button
                  type="button"
                  onClick={createNote}
                  className="mt-4 inline-flex items-center justify-center min-w-20 h-10 px-3 rounded-full text-style-body-lg bg-bg-button-secondary-default text-ink-body hover:bg-bg-button-secondary-hover transition-colors"
                >
                  New note
                </button>
              </div>
            </div>
          )}
          <div
            aria-hidden
            data-note-edge=""
            className={noteScroll.scrolled ? noteEdgeShown : noteEdgeHidden}
          />
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

      {assistantOpen && (
        <>
          <SidebarResizeHandle
            side="end"
            resizing={railResize.resizing}
            handleProps={railResize.handleProps}
          />
          <AssistantSidebar noteId={activeNote?.id ?? null} onInsert={handleInsertReply} />
        </>
      )}

      <SettingsDialog
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        theme={theme}
        onThemeChange={setTheme}
      />

      {(paletteShown || dimPressed) && (
        <div data-palette-backdrop="" className={paletteBackdropStyle} onPointerDown={pressDim} />
      )}

      {!palette && (
        <CommandMenu
          open={commandMenuOpen}
          onClose={() => setCommandMenuOpen(false)}
          actions={commands}
          onOpenNote={openNote}
        />
      )}

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
