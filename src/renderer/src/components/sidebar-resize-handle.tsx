import type { CSSProperties, HTMLAttributes } from 'react'

// The divider between the rail and the note pane is the pane's hairline; this
// stands on it with no width of its own, so it rides the rail's collapse with
// nothing to animate. Its grip straddles the hairline: 1px over the rail, so
// it barely touches the list's scrollbar, and 4px over the pane's padding. It
// runs the window's full height, through the top bar as the hairline does, and
// is above both the bar and the pane, which would otherwise cover it.
const slot = 'relative w-0 shrink-0 z-20'
const grip = 'group absolute inset-y-0 -left-px w-[5px] cursor-col-resize outline-none'
// The top bar is the window's drag strip, which takes the pointer from
// whatever lies over it; the grip is cut out of it.
const noDrag = { WebkitAppRegion: 'no-drag' } as CSSProperties

// What lights is a 2px line centred on the hairline.
const line = 'absolute inset-y-0 left-0 w-0.5 rounded-full transition-colors duration-150'
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
      <div {...handleProps} className={grip} style={noDrag}>
        <div aria-hidden className={resizing ? lineHeld : lineIdle} />
      </div>
    </div>
  )
}
