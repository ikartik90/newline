import { useCallback, useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

// ---------------------------------------------------------------------------
// useSidebarPeek — a collapsed sidebar brought up while the pointer rests on
// its toggle, floating over the note pane, and kept up while the pointer is
// over it. A click on the toggle pins it open instead, which ends the peek.
// ---------------------------------------------------------------------------

interface SidebarPeekOptions {
  collapsed: boolean
  /** The sidebar's open width, in CSS pixels from the window's left edge. */
  width: number
}

// What a peeked sidebar opens floats outside it: a menu up from the account,
// or the dialog behind Search or the gear. The pointer on one is still with it.
const FLOATING_FROM_IT = '[role="menu"], [role="dialog"]'

export function useSidebarPeek({ collapsed, width }: SidebarPeekOptions) {
  const [peeking, setPeeking] = useState(false)
  // Pinned open or collapsed by a click, the pointer still on the toggle asks
  // for nothing: a peek needs a fresh reach.
  const [wasCollapsed, setWasCollapsed] = useState(collapsed)
  if (wasCollapsed !== collapsed) {
    setWasCollapsed(collapsed)
    setPeeking(false)
  }
  // A peek is only ever at a collapsed sidebar: the click that brings an
  // inactive window forward also has the pointer enter the toggle again,
  // reaching its handler from before the pin.
  const shown = peeking && collapsed

  useEffect(() => {
    if (!shown) return
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || event.clientX <= width) return
      if ((event.target as Element | null)?.closest?.(FLOATING_FROM_IT)) return
      setPeeking(false)
    }
    // The page also reads the pointer reaching the top bar, the window's drag
    // handle, as leaving it, though it is still in the window. Over a peek the
    // bar is the page's as wide as the sidebar (App's `barOverPeek`), so it
    // reaches the handle at the sidebar's edge. Only a pointer truly out of
    // the window, or past the sidebar, lets it go.
    const leavePage = (event: MouseEvent) => {
      if (event.relatedTarget) return
      const { clientX: x, clientY: y } = event
      const inWindow = x >= 0 && y >= 0 && x < window.innerWidth && y < window.innerHeight
      if (!inWindow || x >= width) setPeeking(false)
    }
    const root = document.documentElement
    document.addEventListener('pointermove', move)
    root.addEventListener('mouseleave', leavePage)
    return () => {
      document.removeEventListener('pointermove', move)
      root.removeEventListener('mouseleave', leavePage)
    }
  }, [shown, width])

  // A finger has no resting place to peek from; a tap on the toggle pins.
  const onToggleEnter = useCallback(
    (event: ReactPointerEvent) => {
      if (collapsed && event.pointerType !== 'touch') setPeeking(true)
    },
    [collapsed]
  )

  return { peeking: shown, onToggleEnter }
}
