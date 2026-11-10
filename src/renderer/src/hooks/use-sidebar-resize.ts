import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type RefObject
} from 'react'
import { beginControlDrag, endControlDrag } from '@/utils/control-drag'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  SIDEBAR_WIDTH_KEY,
  clampSidebarWidth,
  parseStoredSidebarWidth
} from '@/utils/sidebar-width'

// ---------------------------------------------------------------------------
// useSidebarResize — the divider between the rail and the note panel, as a
// handle that drags the rail wider or narrower.
//
// The width reaches the page as `--size-sidebar` on the shell, which the rail,
// the top bar's rail controls and the search's centring all read. A drag
// writes that property straight onto the element on every move and commits
// to React state only on release: a render per move would re-render the
// editor under the pointer. React leaves the property alone in between,
// because the value it last rendered has not changed.
// ---------------------------------------------------------------------------

/** Set on `<html>` while the rail is being dragged, for the page-wide cursor. */
export const SIDEBAR_RESIZING_ATTR = 'data-sidebar-resizing'

const KEY_STEP = 16

interface Gesture {
  pointerId: number
  startX: number
  startWidth: number
  width: number
}

export function useSidebarResize(shellRef: RefObject<HTMLElement | null>) {
  const [stored, setStored] = useState(() =>
    parseStoredSidebarWidth(localStorage.getItem(SIDEBAR_WIDTH_KEY))
  )
  const [resizing, setResizing] = useState(false)
  const gesture = useRef<Gesture | null>(null)

  const width = clampSidebarWidth(stored)

  const paint = (next: number) => {
    shellRef.current?.style.setProperty('--size-sidebar', `${next}px`)
  }

  const commit = useCallback((next: number) => {
    setStored(next)
    localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next))
  }, [])

  const release = (pointerId: number) => {
    endControlDrag(pointerId)
    document.documentElement.removeAttribute(SIDEBAR_RESIZING_ATTR)
    gesture.current = null
    setResizing(false)
  }

  // A rail collapsed mid-drag unmounts the handle before any release arrives.
  useEffect(() => {
    const live = gesture
    return () => {
      if (!live.current) return
      endControlDrag(live.current.pointerId)
      document.documentElement.removeAttribute(SIDEBAR_RESIZING_ATTR)
    }
  }, [])

  const shellStyle = { '--size-sidebar': `${width}px` } as CSSProperties

  const handleProps = {
    role: 'separator',
    'aria-label': 'Resize sidebar',
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': SIDEBAR_MIN_WIDTH,
    'aria-valuemax': SIDEBAR_MAX_WIDTH,
    'aria-valuenow': width,
    tabIndex: 0,

    onPointerDown: (event: PointerEvent<HTMLElement>) => {
      if (event.button !== 0) return
      event.preventDefault()
      beginControlDrag(event.pointerId)
      document.documentElement.setAttribute(SIDEBAR_RESIZING_ATTR, '')
      gesture.current = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startWidth: width,
        width
      }
      setResizing(true)
      event.currentTarget.setPointerCapture?.(event.pointerId)
    },

    onPointerMove: (event: PointerEvent<HTMLElement>) => {
      const live = gesture.current
      if (!live || live.pointerId !== event.pointerId) return
      live.width = clampSidebarWidth(live.startWidth + event.clientX - live.startX)
      paint(live.width)
      event.currentTarget.setAttribute('aria-valuenow', String(live.width))
    },

    onPointerUp: (event: PointerEvent<HTMLElement>) => {
      const live = gesture.current
      if (!live || live.pointerId !== event.pointerId) return
      release(live.pointerId)
      commit(live.width)
    },

    onPointerCancel: (event: PointerEvent<HTMLElement>) => {
      const live = gesture.current
      if (!live || live.pointerId !== event.pointerId) return
      paint(live.startWidth)
      event.currentTarget.setAttribute('aria-valuenow', String(live.startWidth))
      release(live.pointerId)
    },

    onDoubleClick: () => commit(SIDEBAR_MIN_WIDTH),

    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const next =
        event.key === 'ArrowRight'
          ? width + KEY_STEP
          : event.key === 'ArrowLeft'
            ? width - KEY_STEP
            : event.key === 'Home'
              ? SIDEBAR_MIN_WIDTH
              : event.key === 'End'
                ? SIDEBAR_MAX_WIDTH
                : null
      if (next === null) return
      event.preventDefault()
      commit(clampSidebarWidth(next))
    }
  }

  return { width, resizing, shellStyle, handleProps }
}
