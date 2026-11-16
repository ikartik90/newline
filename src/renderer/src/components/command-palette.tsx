import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CommandMenuPanel } from '@/components/command-menu'
import { commandMenuActions } from '@/components/command-menu-actions'

// ---------------------------------------------------------------------------
// The glass command palette's page: the command menu in a clear window of its
// own, standing straight on the note window's glass (main/command-palette.ts),
// with no sheet of its own. Main shows it with
// what the note window holds; it draws the menu for that, in that window's
// theme, and says how tall it stands, which is when main shows the window.
// Whatever is picked is only named back to main, which closes the window and
// has the note window do it.
//
// It stands on the glass as the sidebar does (`data-on-glass` on a level-1
// sheet), so a highlighted row is the glass a shade deeper.
// ---------------------------------------------------------------------------

// No taller than main allows (`maxHeight`): past that the list scrolls under
// the field, which stays.
const groundStyle = 'flex flex-col overflow-hidden bg-level-1 text-ink-body'

export function CommandPalette() {
  // Each showing is its own mount, so the field and the search start empty.
  const [showing, setShowing] = useState<{
    state: CommandMenuState
    maxHeight: number
    key: number
  } | null>(null)
  const groundRef = useRef<HTMLDivElement>(null)
  const palette = window.api.palette

  useEffect(
    () =>
      palette?.onShow((state, maxHeight) =>
        setShowing((current) => ({ state, maxHeight, key: (current?.key ?? 0) + 1 }))
      ),
    [palette]
  )
  // The window resized under it: the same showing, its field and search kept.
  useEffect(
    () =>
      palette?.onFit((maxHeight) =>
        setShowing((current) => (current ? { ...current, maxHeight } : current))
      ),
    [palette]
  )

  useLayoutEffect(() => {
    if (showing) {
      document.documentElement.classList.toggle('dark', showing.state.theme === 'dark')
    }
  }, [showing])

  // Main fits the window to the menu, and shows it on the first answer.
  useLayoutEffect(() => {
    const ground = groundRef.current
    if (!ground || !palette) return
    const report = () => palette.setHeight(Math.ceil(ground.getBoundingClientRect().height))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(ground)
    return () => observer.disconnect()
  }, [showing, palette])

  const actions = showing ? commandMenuActions(showing.state, (id) => palette?.run(id)) : []

  // The note window's keys don't reach here: ⌘K closes, as it would have
  // there, and an action's own key does what it does.
  useEffect(() => {
    if (!showing || !palette) return
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (event.key === 'Escape' || (mod && event.key.toLowerCase() === 'k')) {
        event.preventDefault()
        palette.close()
        return
      }
      if (!mod) return
      const action = actions.find((a) => a.shortcut?.toLowerCase() === event.key.toLowerCase())
      if (action) {
        event.preventDefault()
        action.run()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  if (!showing || !palette) return null
  return (
    <div
      ref={groundRef}
      data-on-glass=""
      className={groundStyle}
      style={{ maxHeight: showing.maxHeight }}
    >
      <CommandMenuPanel
        key={showing.key}
        actions={actions}
        onOpenNote={(note) => palette.openNote(note)}
        onClose={() => palette.close()}
        autoFocus
      />
    </div>
  )
}
