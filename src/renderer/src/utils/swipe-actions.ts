// ---------------------------------------------------------------------------
// Swiping a list row aside to uncover its actions — the arithmetic.
//
// Where the row sits under a finger, whether a press has become a swipe at all,
// and what letting go means. The pointer bookkeeping that feeds these is in
// `hooks/use-swipe-actions.ts`.
//
// A row opens to the LEFT only: the actions wait at its trailing end, and a
// pull the other way has nothing to uncover.
// ---------------------------------------------------------------------------

/** How far a finger travels before a press is read as a swipe rather than a tap. */
export const SWIPE_SLOP = 8

/** A flick, in pixels per millisecond, in the offset's own direction. */
export const FLICK_SPEED = 0.8

/**
 * Where the row sits for a finger that has travelled `dx` (rightwards
 * positive) from where it went down, having started `from` pixels open.
 */
export function swipeOffset(from: number, dx: number, max: number): number {
  return Math.min(max, Math.max(0, from - dx))
}

/** Has this press moved across far enough, and more across than along, to be a swipe? */
export function isSwipe(dx: number, dy: number): boolean {
  return Math.abs(dx) >= SWIPE_SLOP && Math.abs(dx) > Math.abs(dy)
}

export interface SwipeRelease {
  /** How far open the row is. */
  offset: number
  /** How far it can open — the width of what it uncovers. */
  max: number
  /** How fast the offset was growing on release, in pixels per millisecond. */
  speed: number
}

/** Whether letting go here leaves the row open rather than putting it back. */
export function settleSwipe({ offset, max, speed }: SwipeRelease): boolean {
  if (speed <= -FLICK_SPEED) return false
  if (speed >= FLICK_SPEED) return offset > 0
  return offset >= max / 2
}
