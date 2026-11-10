// How wide the notes rail may be dragged. Its original width is the floor.
// The window's width plays no part: a narrower note pane wraps its text.

export const SIDEBAR_MIN_WIDTH = 256
export const SIDEBAR_MAX_WIDTH = 400

export const SIDEBAR_WIDTH_KEY = 'sidebarWidth'

export function clampSidebarWidth(width: number): number {
  return Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, width)))
}

export function parseStoredSidebarWidth(raw: string | null): number {
  const width = raw ? Number(raw) : NaN
  return Number.isFinite(width) ? width : SIDEBAR_MIN_WIDTH
}
