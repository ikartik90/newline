// How wide a rail may be dragged. Its original width is the floor.
// The window's width plays no part: a narrower note pane wraps its text.

export interface RailBounds {
  min: number
  max: number
  /** Where the width it is let go at is remembered. */
  key: string
  /** The shell's property the rail reads its width from. */
  property: `--${string}`
  /** The handle's accessible name. */
  label: string
  /** The window's edge the rail stands at; an `end` rail widens as its handle goes left. */
  side: 'start' | 'end'
}

export const SIDEBAR_MIN_WIDTH = 256
export const SIDEBAR_MAX_WIDTH = 400

export const SIDEBAR_WIDTH_KEY = 'sidebarWidth'

/** The notes sidebar, at the window's start. */
export const NOTES_RAIL: RailBounds = {
  min: SIDEBAR_MIN_WIDTH,
  max: SIDEBAR_MAX_WIDTH,
  key: SIDEBAR_WIDTH_KEY,
  property: '--size-sidebar',
  label: 'Resize sidebar',
  side: 'start'
}

/** The Gemma rail, at the window's end. */
export const ASSISTANT_RAIL: RailBounds = {
  min: 320,
  max: 480,
  key: 'assistantWidth',
  property: '--size-assistant',
  label: 'Resize Gemma',
  side: 'end'
}

export function clampRailWidth(width: number, rail: RailBounds): number {
  return Math.round(Math.min(rail.max, Math.max(rail.min, width)))
}

export function parseStoredRailWidth(raw: string | null, rail: RailBounds): number {
  const width = raw ? Number(raw) : NaN
  return Number.isFinite(width) ? width : rail.min
}
