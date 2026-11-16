// Where an anchored popover stands: on which side of its anchor, and at which
// end. CSS anchor positioning then places it there and keeps it on the anchor
// through scroll (`[data-popover]` in main.css). The choice is ours, not the
// browser's `position-try-fallbacks`: those are tried only as a popover is
// shown, and a fallback that still fits is kept, so a popover flipped for want
// of room would never come back once there was room again.

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export type PlacementSide = 'top' | 'bottom'
export type PlacementAlign = 'start' | 'center' | 'end'

export interface PlacementInput {
  anchor: Box
  /** The popover's own size, untransformed. */
  size: { width: number; height: number }
  viewport: { width: number; height: number }
  /** The side and end it asks for. */
  side: PlacementSide
  align: PlacementAlign
  /** How far the popover stays in from the window's edges. */
  edge: number
  /** The space between the popover and its anchor. */
  gap: number
}

export interface Placement {
  side: PlacementSide
  /** `center` is also the last resort: centred on the anchor, shifted to fit. */
  align: PlacementAlign
}

export function choosePlacement({
  anchor,
  size,
  viewport,
  side,
  align,
  edge,
  gap
}: PlacementInput): Placement {
  const room = {
    top: anchor.top - gap - edge,
    bottom: viewport.height - edge - anchor.bottom - gap
  }
  const other: PlacementSide = side === 'bottom' ? 'top' : 'bottom'
  const chosenSide =
    room[side] >= size.height
      ? side
      : room[other] >= size.height || room[other] > room[side]
        ? other
        : side

  const fits = {
    start: anchor.left + size.width <= viewport.width - edge,
    end: anchor.right - size.width >= edge
  }
  const chosenAlign =
    align === 'center'
      ? 'center'
      : fits[align]
        ? align
        : fits[align === 'start' ? 'end' : 'start']
          ? align === 'start'
            ? 'end'
            : 'start'
          : 'center'

  return { side: chosenSide, align: chosenAlign }
}
