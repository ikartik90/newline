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
  NOTES_RAIL,
  clampRailWidth,
  parseStoredRailWidth,
  type RailBounds
} from '@/utils/sidebar-width'

// ---------------------------------------------------------------------------
// useSidebarResize — the divider between a rail and the note panel, as a
// handle that drags the rail wider or narrower: the notes sidebar by default,
// or the Gemma rail (`ASSISTANT_RAIL`), which stands at the window's end and
// so widens as its handle goes left.
//
// The width reaches the page as the rail's property on the shell
// (`--size-sidebar`, which the top bar's rail controls and the search's
// centring read too, or `--size-assistant`). A drag
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

export function useSidebarResize(
  shellRef: RefObject<HTMLElement | null>,
  rail: RailBounds = NOTES_RAIL
) {
  const [stored, setStored] = useState(() =>
    parseStoredRailWidth(localStorage.getItem(rail.key), rail)
  )
  const [resizing, setResizing] = useState(false)
  const gesture = useRef<Gesture | null>(null)

  const width = clampRailWidth(stored, rail)
  const clamp = (next: number) => clampRailWidth(next, rail)
  // Which way the pointer and the arrow keys widen it.
  const outward = rail.side === 'end' ? -1 : 1

  const paint = (next: number) => {
    shellRef.current?.style.setProperty(rail.property, `${next}px`)
  }

  const commit = useCallback(
    (next: number) => {
      setStored(next)
      localStorage.setItem(rail.key, String(next))
    },
    [rail.key]
  )

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

  const shellStyle = { [rail.property]: `${width}px` } as CSSProperties

  const handleProps = {
    role: 'separator',
    'aria-label': rail.label,
    'aria-orientation': 'vertical' as const,
    'aria-valuemin': rail.min,
    'aria-valuemax': rail.max,
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
      live.width = clamp(live.startWidth + outward * (event.clientX - live.startX))
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

    onDoubleClick: () => commit(rail.min),

    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      const next =
        event.key === 'ArrowRight'
          ? width + outward * KEY_STEP
          : event.key === 'ArrowLeft'
            ? width - outward * KEY_STEP
            : event.key === 'Home'
              ? rail.min
              : event.key === 'End'
                ? rail.max
                : null
      if (next === null) return
      event.preventDefault()
      commit(clamp(next))
    }
  }

  return { width, resizing, shellStyle, handleProps }
}
