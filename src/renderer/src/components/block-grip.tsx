import type { DragEvent } from 'react'
import ReorderIcon from '@/assets/icons/reorder.svg'

// ---------------------------------------------------------------------------
// The grip a block is moved by, and the line that shows where it will land.
// The grip stands in the margin beside the block the pointer rests on, and is
// dragged to where the block should go. Only a pointer can drag it, so it is
// nothing to a screen reader or the Tab key.
// ---------------------------------------------------------------------------

/** The first line of the block the grip stands beside, measured from the article. */
export interface GripLine {
  left: number
  top: number
  height: number
}

/** Where a dragged block will land: the middle of the line, measured from the article. */
export interface DropLine {
  left: number
  top: number
  width: number
}

interface BlockGripProps {
  line: GripLine
  /** The grip is pressed, which takes the keys from whatever had them. */
  onPress: () => void
  onDragStart: (event: DragEvent<HTMLDivElement>) => void
  /** The press is over: a click, or a drag that has ended, let go on something or not. */
  onRelease: () => void
}

/** The grip's box each way, an icon button's: a 20px glyph on a 4px inset. */
export const BLOCK_GRIP_SIZE = 28
/** How far it stands clear of its block, and of the wall where the note fills its pane (`--size-note-inset`). */
export const BLOCK_GRIP_GAP = 4
/** How far left of its block a pointer still rests on it: the grip, and a little past. */
export const BLOCK_GRIP_REACH = BLOCK_GRIP_SIZE + BLOCK_GRIP_GAP + 8
/** The line's own height (`h-0.5`). */
const LINE = 2

const gripStyle =
  'absolute z-[1] flex items-center justify-center w-fit p-1 rounded-xl select-none cursor-grab active:cursor-grabbing ' +
  'bg-transparent text-ink-button-tertiary-default hover:bg-bg-button-tertiary-hover active:bg-bg-button-tertiary-pressed ' +
  'transition-[background-color] duration-150 [&_svg]:size-5 [&_svg]:shrink-0'

// Under the pointer all through a drag, so never what the drag is over.
const lineStyle = 'absolute z-[1] h-0.5 rounded-full bg-border-drop-line pointer-events-none'

export function BlockGrip({ line, onPress, onDragStart, onRelease }: BlockGripProps) {
  return (
    <div
      data-block-grip=""
      aria-hidden
      draggable
      className={gripStyle}
      style={{
        left: line.left - BLOCK_GRIP_SIZE - BLOCK_GRIP_GAP,
        top: line.top + (line.height - BLOCK_GRIP_SIZE) / 2
      }}
      onMouseDown={onPress}
      onClick={onRelease}
      onDragStart={onDragStart}
      onDragEnd={onRelease}
    >
      <ReorderIcon />
    </div>
  )
}

export function DropLine({ line }: { line: DropLine }) {
  return (
    <div
      data-drop-line=""
      aria-hidden
      className={lineStyle}
      style={{ left: line.left, top: line.top - LINE / 2, width: line.width }}
    />
  )
}
