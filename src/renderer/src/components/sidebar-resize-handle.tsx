import type { CSSProperties, HTMLAttributes } from 'react'

// The divider between the rail and the note pane is the rail's last pixel
// (the Gemma rail's first, at the window's end); this stands just past it
// with no width of its own, so it rides the rail's collapse with nothing to
// animate. Its grip straddles the hairline: on it, so it barely touches the
// rail's scrollbar, and 4px over the pane's padding. It
// runs the window's full height, through the top bar as the hairline does, and
// is above both the bar and the pane, which would otherwise cover it.
const slot = 'relative w-0 shrink-0 z-20'
const gripAtStart = 'group absolute inset-y-0 -left-px w-[5px] cursor-col-resize outline-none'
const gripAtEnd = 'group absolute inset-y-0 -left-1 w-[5px] cursor-col-resize outline-none'
// The top bar is the window's drag strip, which takes the pointer from
// whatever lies over it; the grip is cut out of it.
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

// What lights is a 2px line over the hairline and the pane's pixel beside it.
const idle =
  'bg-transparent group-hover:bg-border-resize-handle-hover group-focus-visible:bg-border-resize-handle-hover'
const held = 'bg-border-resize-handle-hover'
const lineAtStart = 'absolute inset-y-0 left-0 w-0.5 rounded-full transition-colors duration-150'
const lineAtEnd = 'absolute inset-y-0 right-0 w-0.5 rounded-full transition-colors duration-150'

export function SidebarResizeHandle({
  resizing,
  handleProps,
  side = 'start'
}: {
  resizing: boolean
  handleProps: HTMLAttributes<HTMLDivElement>
  /** The window's edge the rail stands at: its hairline is on the slot's left or right. */
  side?: 'start' | 'end'
}) {
  const line = side === 'end' ? lineAtEnd : lineAtStart
  return (
    <div className={slot}>
      <div {...handleProps} className={side === 'end' ? gripAtEnd : gripAtStart} style={noDrag}>
        <div aria-hidden className={`${line} ${resizing ? held : idle}`} />
      </div>
    </div>
  )
}
