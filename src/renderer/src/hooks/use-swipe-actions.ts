import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type WheelEvent
} from 'react'
import { isSwipe, settleSwipe, swipeOffset } from '@/utils/swipe-actions'
import { beginControlDrag, endControlDrag } from '@/utils/control-drag'

// ---------------------------------------------------------------------------
// useSwipeActions — slide a list row aside to uncover the actions behind it.
//
// Two gestures mean the same thing and both are answered: a finger (or a held
// mouse) dragged across the row, and a two-finger scroll sideways on a
// trackpad, which the browser reports as wheel events rather than as a pointer.
// The first has a release to settle on; the second has no end at all, so it is
// settled a beat after the last event arrives.
//
// A press is not a swipe until it has travelled the slop more across than
// along. Until then it might be a tap, which must reach the row, or the start
// of a scroll, which must reach the list — so a press that turns out to be
// going up or down is let go of for good.
//
// What is left here is the bookkeeping. Where the row sits and what letting go
// means are decided in `utils/swipe-actions.ts`.
// ---------------------------------------------------------------------------

/** How long after the last sideways wheel event the row settles. */
export const WHEEL_SETTLE_MS = 150

export interface SwipeActionsOptions {
  /** How far the row travels when open — the width of what it uncovers. */
  width: number
  open: boolean
  /** Called when a gesture ends, with what it meant. */
  onOpenChange: (open: boolean) => void
  /** The clock a flick is timed against, in milliseconds. */
  now?: () => number
}

export interface SwipeActionsGesture {
  /**
   * How far aside the row is, in pixels: under the finger while a gesture is
   * running, else wherever `open` puts it.
   */
  translate: number
  /** A gesture is running, so the row follows it rather than animating. */
  dragging: boolean
  handlers: {
    onPointerDown: (event: PointerEvent<HTMLElement>) => void
    onPointerMove: (event: PointerEvent<HTMLElement>) => void
    onPointerUp: (event: PointerEvent<HTMLElement>) => void
    onPointerCancel: () => void
    onWheel: (event: WheelEvent<HTMLElement>) => void
    /** Swallows the click a swipe ends with, so the row is not also chosen. */
    onClickCapture: (event: MouseEvent<HTMLElement>) => void
  }
}

/** A press that may become a swipe, and the swipe once it has. */
interface Press {
  pointerId: number
  startX: number
  startY: number
  /** How far open the row was when the finger went down. */
  from: number
  /** Crossed the slop across: the row is following the finger. */
  swiping: boolean
  /** Crossed the slop along: this is a scroll, and the row is not moving. */
  abandoned: boolean
  lastOffset: number
  lastTime: number
  speed: number
}

export function useSwipeActions({
  width,
  open,
  onOpenChange,
  now = () => performance.now()
}: SwipeActionsOptions): SwipeActionsGesture {
  const [offset, setOffset] = useState<number | null>(null)
  // Refs, not state: read inside the handlers that would be setting them, and
  // none of them should schedule a render of its own.
  const press = useRef<Press | null>(null)
  const wheel = useRef<{ offset: number; timer: ReturnType<typeof setTimeout> } | null>(null)
  const suppressClick = useRef(false)
  const resting = open ? width : 0

  const endPress = () => {
    if (press.current) endControlDrag(press.current.pointerId)
    press.current = null
    setOffset(null)
  }

  // A row can be taken away mid-gesture — deleted, or scrolled out of a
  // virtualised list — with no release to reach it.
  useEffect(() => {
    const livePress = press
    const liveWheel = wheel
    return () => {
      if (livePress.current) endControlDrag(livePress.current.pointerId)
      if (liveWheel.current) clearTimeout(liveWheel.current.timer)
    }
  }, [])

  return {
    translate: offset ?? resting,
    dragging: offset !== null,
    handlers: {
      onPointerDown: (event) => {
        if (event.button !== 0 || wheel.current) return
        press.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          from: resting,
          swiping: false,
          abandoned: false,
          lastOffset: resting,
          lastTime: now(),
          speed: 0
        }
      },

      onPointerMove: (event) => {
        const live = press.current
        if (!live || live.pointerId !== event.pointerId || live.abandoned) return
        const dx = event.clientX - live.startX
        const dy = event.clientY - live.startY
        if (!live.swiping) {
          if (!isSwipe(dx, dy)) {
            // Going along rather than across: the list's, from here on.
            if (Math.abs(dy) >= Math.abs(dx) && Math.abs(dy) > 0) live.abandoned = true
            return
          }
          live.swiping = true
          // The row is a line of text, and a drag along it must not select it.
          beginControlDrag(event.pointerId)
          // Follow the finger off the row, so a fast swipe does not stop at
          // the edge of the element it started on.
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }
        const next = swipeOffset(live.from, dx, width)
        const time = now()
        const elapsed = time - live.lastTime
        // Two events in the same millisecond say nothing about speed.
        if (elapsed > 0) {
          live.speed = (next - live.lastOffset) / elapsed
          live.lastTime = time
        }
        live.lastOffset = next
        setOffset(next)
      },

      onPointerUp: (event) => {
        const live = press.current
        if (!live || live.pointerId !== event.pointerId) return
        if (live.swiping) {
          const released = { offset: live.lastOffset, max: width, speed: live.speed }
          endPress()
          suppressClick.current = true
          onOpenChange(settleSwipe(released))
          return
        }
        endPress()
        // A tap on an open row puts it back rather than choosing it.
        if (open && !live.abandoned) {
          suppressClick.current = true
          onOpenChange(false)
        }
      },

      onPointerCancel: endPress,

      onWheel: (event) => {
        if (press.current) return
        const live = wheel.current
        if (!live && Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
        const current = live?.offset ?? resting
        const next = swipeOffset(current, -event.deltaX, width)
        if (!live && next === current) return
        if (live) clearTimeout(live.timer)
        // A scroll has no release; the row settles once the events stop.
        wheel.current = {
          offset: next,
          timer: setTimeout(() => {
            const settled = wheel.current?.offset ?? current
            wheel.current = null
            setOffset(null)
            onOpenChange(settleSwipe({ offset: settled, max: width, speed: 0 }))
          }, WHEEL_SETTLE_MS)
        }
        setOffset(next)
      },

      onClickCapture: (event) => {
        if (!suppressClick.current) return
        suppressClick.current = false
        event.preventDefault()
        event.stopPropagation()
      }
    }
  }
}
