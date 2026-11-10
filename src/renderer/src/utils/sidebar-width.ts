// How wide the notes rail may be dragged. Its original width is the floor.

export const SIDEBAR_MIN_WIDTH = 256
export const SIDEBAR_MAX_WIDTH = 400
/** What the window keeps beside the rail before it may widen: the article's
 *  full 640px column (`--size-article-content`) and the note pane's 20px
 *  padding either side, so dragging the rail never squeezes the text. */
const NOTE_PANE_MIN_WIDTH = 680

export const SIDEBAR_WIDTH_KEY = 'sidebarWidth'

export function maxSidebarWidth(viewportWidth: number): number {
  return Math.max(
    SIDEBAR_MIN_WIDTH,
    Math.min(SIDEBAR_MAX_WIDTH, viewportWidth - NOTE_PANE_MIN_WIDTH)
  )
}

export function clampSidebarWidth(width: number, viewportWidth: number): number {
  return Math.round(Math.min(maxSidebarWidth(viewportWidth), Math.max(SIDEBAR_MIN_WIDTH, width)))
}

export function parseStoredSidebarWidth(raw: string | null): number {
  const width = raw ? Number(raw) : NaN
  return Number.isFinite(width) ? width : SIDEBAR_MIN_WIDTH
}
