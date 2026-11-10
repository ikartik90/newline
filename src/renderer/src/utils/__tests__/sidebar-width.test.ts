import { describe, expect, it } from 'vitest'
import {
  SIDEBAR_MAX_WIDTH,
  SIDEBAR_MIN_WIDTH,
  clampSidebarWidth,
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
