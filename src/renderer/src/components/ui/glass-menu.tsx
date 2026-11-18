import { cloneElement, useEffect, useId, useRef, useState, type ReactElement } from 'react'
import { setRef, type TriggerProps } from './menu'

// ---------------------------------------------------------------------------
// GlassMenu — a menu on AppKit's glass (macOS 27 and later), where
// `window.api.glassMenu.native` says there is that glass. A menu in the page
// cannot be glass: the window's glass lies under the page, and the rows under
// the menu would show through. So main shows it in a window of its own, stood
// on the trigger (main/glass-menu.ts), and its rows run there
// (`GlassMenuPage`); a pick comes back here by its id. The trigger is a menu
// button as `Menu`'s is: its aria, Enter and Space onto the first row, the
// arrows onto the first or last.
// ---------------------------------------------------------------------------

export interface GlassMenuProps {
  trigger: ReactElement<TriggerProps>
  /**
   * Which side of the trigger it opens on, flipping when there is no room, or
   * `over` it, its first row where the trigger was. Default `bottom`.
   */
  side?: GlassMenuRequest['side']
  align?: 'start' | 'end'
  /** Who the menu is about, over its rows. */
  identity?: GlassMenuRequest['identity']
  items: GlassMenuRequest['items']
  onSelect: (id: string) => void
}

// One glass menu shows at a time: what it says is for whoever opened it.
let owner: string | null = null

// A press on the trigger closes the menu by taking the keys from it, and main
// may say so just before the click lands: that click doesn't open it again.
const REOPEN_AFTER_MS = 300

export function GlassMenu({
  trigger,
  side = 'bottom',
  align = 'start',
  identity,
  items,
  onSelect
}: GlassMenuProps) {
  const id = useId()
  const api = window.api.glassMenu
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLElement | null>(null)
  const closedAt = useRef(-Infinity)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  })

  // The menu closes before a pick is named, so both are heard for as long as
  // this is mounted.
  useEffect(() => {
    if (!api) return
    const offClosed = api.onClosed(() => {
      if (owner !== id) return
      closedAt.current = performance.now()
      setOpen(false)
    })
    const offPicked = api.onPicked((picked) => {
      if (owner !== id) return
      owner = null
      onSelectRef.current(picked)
    })
    return () => {
      offClosed()
      offPicked()
      if (owner === id) owner = null
    }
  }, [api, id])

  // A press in the note window closes it, as one outside an in-page menu does:
  // the window doesn't hear the keys leave a panel that never became main.
  // The press lands where it was meant, the trigger's included, which then
  // doesn't open it again.
  useEffect(() => {
    if (!open || !api) return
    const onPointerDown = () => api.close()
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [open, api])

  const openOnto = (focus: GlassMenuRequest['focus']) => {
    const rect = triggerRef.current?.getBoundingClientRect()
    if (!api || !rect) return
    owner = id
    setOpen(true)
    api.open({
      anchor: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      side,
      align,
      focus,
      theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
      identity,
      items
    })
  }

  const { ref: ownRef, onClick, onKeyDown } = trigger.props
  return cloneElement(trigger, {
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      setRef(ownRef, node)
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'data-popup-open': open ? '' : undefined,
    onClick: (e) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      if (open) return api?.close()
      if (performance.now() - closedAt.current < REOPEN_AFTER_MS) return
      // Enter and Space click with no pointer behind them: those land on a row.
      openOnto(e.detail === 0 ? 'first' : 'menu')
    },
    onKeyDown: (e) => {
      onKeyDown?.(e)
      if (e.defaultPrevented || open || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
      e.preventDefault()
      openOnto(e.key === 'ArrowDown' ? 'first' : 'last')
    }
  } satisfies TriggerProps)
}
