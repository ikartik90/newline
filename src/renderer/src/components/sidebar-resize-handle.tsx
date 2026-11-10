import type { HTMLAttributes } from 'react'

// The divider between the rail and the note pane is the pane's hairline; this
// stands on it with no width of its own, so it rides the rail's collapse with
// nothing to animate. Its grip straddles the hairline: 1px over the rail, so
// it barely touches the list's scrollbar, and 4px over the pane's padding. It
// starts below the top bar, which is the window's drag strip, and is above
// the pane, which comes after it and would otherwise cover that half.
const slot = 'relative w-0 shrink-0 z-10'
const grip = 'group absolute top-12 bottom-0 -left-px w-[5px] cursor-col-resize outline-none'

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
      <div {...handleProps} className={grip}>
        <div aria-hidden className={resizing ? lineHeld : lineIdle} />
      </div>
    </div>
  )
}
