import { describe, expect, it } from 'vitest'
import {
  ASSISTANT_RAIL,
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampRailWidth,
  clampSidebarWidth,
  parseStoredRailWidth,
  parseStoredSidebarWidth
} from '../sidebar-width'

describe('sidebar width', () => {
  it('starts at the rail’s original width, which is also its floor', () => {
    expect(SIDEBAR_MIN_WIDTH).toBe(256)
    expect(parseStoredSidebarWidth(null)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('reads back a stored width, and ignores one that is not a number', () => {
    expect(parseStoredSidebarWidth('320')).toBe(320)
    expect(parseStoredSidebarWidth('wide')).toBe(SIDEBAR_MIN_WIDTH)
    expect(parseStoredSidebarWidth('')).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('holds a width between the floor and a 400px cap, in whole pixels', () => {
    expect(SIDEBAR_MAX_WIDTH).toBe(400)
    expect(clampSidebarWidth(100)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(9999)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(300.6)).toBe(301)
  })
})

// The Gemma rail is held the same way from the window's other edge: from its
// original 320px to a 480px cap, remembered apart from the notes sidebar.
describe('Gemma rail width', () => {
  it('starts at the rail’s original width, which is also its floor', () => {
    expect(ASSISTANT_RAIL.min).toBe(320)
    expect(parseStoredRailWidth(null, ASSISTANT_RAIL)).toBe(320)
    expect(parseStoredRailWidth('wide', ASSISTANT_RAIL)).toBe(320)
    expect(parseStoredRailWidth('400', ASSISTANT_RAIL)).toBe(400)
  })

  it('holds a width between the floor and a 480px cap, kept under a key of its own', () => {
    expect(ASSISTANT_RAIL.max).toBe(480)
    expect(clampRailWidth(100, ASSISTANT_RAIL)).toBe(320)
    expect(clampRailWidth(9999, ASSISTANT_RAIL)).toBe(480)
    expect(ASSISTANT_RAIL.key).not.toBe('sidebarWidth')
    expect(ASSISTANT_RAIL.side).toBe('end')
  })
})
