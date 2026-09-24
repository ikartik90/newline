import type { ReactNode } from 'react'
import { useSwipeActions } from '@/hooks/use-swipe-actions'

// ---------------------------------------------------------------------------
// SwipeActions — a list row that slides aside to uncover the actions behind it.
//
// The actions stand still at the row's trailing end and the row moves off
// them: a pane the width of the travel opens from the right edge and the
// actions sit against ITS right edge, so what shows is uncovered from the
// left as the row goes. Nothing behind the row is drawn while it is closed,
// which is why the row itself needs no opaque ground of its own.
//
// Motion follows the finger while a gesture runs and the stylesheet's 200ms
// once it lets go; the two must not both apply, or a release snaps and then
// eases from where it already is.
// ---------------------------------------------------------------------------

export interface SwipeActionsProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** What the row uncovers, drawn at its trailing end. */
  actions: ReactNode
  /** How wide that is, and so how far the row travels. Default 72. */
  width?: number
  className?: string
  /** The row. */
  children: ReactNode
}

const shellStyle = 'relative overflow-hidden'
const paneStyle =
  'absolute inset-y-0 right-0 overflow-hidden transition-[width] duration-200 ease-out'
const actionsStyle = 'absolute inset-y-0 right-0 flex'
const rowStyle = 'relative transition-transform duration-200 ease-out'

export function SwipeActions({
  open,
  onOpenChange,
  actions,
  width = 72,
  className,
  children
}: SwipeActionsProps) {
  const { translate, dragging, handlers } = useSwipeActions({ width, open, onOpenChange })
  const motion = dragging ? 'none' : undefined
  return (
    <div
      className={className ? `${shellStyle} ${className}` : shellStyle}
      data-swipe-open={open || undefined}
    >
      <div
        className={paneStyle}
        style={{ width: translate, transition: motion }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className={actionsStyle} style={{ width }}>
          {actions}
        </div>
      </div>
      <div
        className={rowStyle}
        style={{ transform: `translateX(${-translate}px)`, transition: motion }}
        {...handlers}
      >
        {children}
      </div>
    </div>
  )
}
