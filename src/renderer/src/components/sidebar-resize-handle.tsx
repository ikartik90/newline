import type { HTMLAttributes } from 'react'

// The divider between the rail and the card is the card's own edge; this
// stands on that edge with no width of its own, so it rides the rail's
// collapse with nothing to animate. Its grip straddles the edge: 2px over the
// rail, short of the list's scrollbar, and 4px over the card's padding. It is
// above the card, which comes after it and would otherwise cover that half.
const slot = 'relative w-0 shrink-0 z-10'
const grip =
  'group absolute top-0 bottom-(--size-shell-inset) -left-0.5 w-1.5 cursor-col-resize outline-none'

// What lights is a 2px line centred on the edge, held to the edge's straight
// run so it does not cut across the card's rounded corners.
const line =
  'absolute left-px w-0.5 top-(--size-note-panel-radius) bottom-(--size-note-panel-radius) rounded-full transition-colors duration-150'
const lineIdle = `${line} bg-transparent group-hover:bg-fg-highlight group-focus-visible:bg-fg-highlight`
const lineHeld = `${line} bg-fg-highlight`

export function SidebarResizeHandle({
  resizing,
  handleProps
}: {
  resizing: boolean
  handleProps: HTMLAttributes<HTMLDivElement>
}) {
  return (
    <div className={slot}>
      <div {...handleProps} className={grip}>
        <div aria-hidden className={resizing ? lineHeld : lineIdle} />
      </div>
    </div>
  )
}
