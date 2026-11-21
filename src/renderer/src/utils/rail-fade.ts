/** The least of the rail the fade covers, however little is said. */
const MIN_SHARE = 0.6

/**
 * How tall the Gemma rail's fade stands: from the rail's foot up to the top of
 * its conversation, never under 60% of the rail, and the whole rail while the
 * conversation overflows its list, however it is scrolled.
 */
export function railFadeHeight(
  rail: { top: number; bottom: number },
  contentTop: number,
  overflowing = false
): number {
  const full = rail.bottom - rail.top
  if (overflowing) return full
  return Math.min(Math.max(rail.bottom - contentTop, full * MIN_SHARE), full)
}
