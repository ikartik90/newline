import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
  maxSidebarWidth,
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

  it('caps the rail on a wide window, and leaves the note panel room on a narrow one', () => {
    expect(maxSidebarWidth(1600)).toBe(SIDEBAR_MAX_WIDTH)
    expect(maxSidebarWidth(800)).toBeLessThan(SIDEBAR_MAX_WIDTH)
    // Never below the floor, however narrow the window.
    expect(maxSidebarWidth(300)).toBe(SIDEBAR_MIN_WIDTH)
  })

  it('holds a width between the floor and the cap, in whole pixels', () => {
    expect(clampSidebarWidth(100, 1600)).toBe(SIDEBAR_MIN_WIDTH)
    expect(clampSidebarWidth(9999, 1600)).toBe(SIDEBAR_MAX_WIDTH)
    expect(clampSidebarWidth(300.6, 1600)).toBe(301)
    expect(clampSidebarWidth(SIDEBAR_MAX_WIDTH, 800)).toBe(maxSidebarWidth(800))
  })
})
