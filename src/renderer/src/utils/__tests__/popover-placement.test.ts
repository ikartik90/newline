import { describe, expect, it } from 'vitest'
import { choosePlacement, type PlacementInput } from '../popover-placement'

const viewport = { width: 1000, height: 800 }
const box = (left: number, top: number, width: number, height: number) => ({
  left,
  top,
  right: left + width,
  bottom: top + height
})

/** A 200×100 popover preferring to hang below its anchor's left edge. */
function input(overrides: Partial<PlacementInput>): PlacementInput {
  return {
    anchor: box(100, 300, 50, 20),
    size: { width: 200, height: 100 },
    viewport,
    side: 'bottom',
    align: 'start',
    edge: 4,
    gap: 4,
    ...overrides
  }
}

describe('choosePlacement', () => {
  it('takes the side and end it asks for where they have room', () => {
    expect(choosePlacement(input({}))).toEqual({ side: 'bottom', align: 'start' })
    expect(
      choosePlacement(input({ side: 'top', align: 'end', anchor: box(500, 300, 50, 20) }))
    ).toEqual({
      side: 'top',
      align: 'end'
    })
  })

  it('flips to the other side when its own has no room', () => {
    expect(choosePlacement(input({ anchor: box(100, 700, 50, 20) })).side).toBe('top')
    expect(choosePlacement(input({ side: 'top', anchor: box(100, 50, 50, 20) })).side).toBe(
      'bottom'
    )
  })

  it('returns to its own side as soon as that has room again', () => {
    // However it stood before: the choice is made from where the anchor is now.
    expect(choosePlacement(input({ anchor: box(100, 300, 50, 20) })).side).toBe('bottom')
  })

  it('counts the gap and the window’s edge as part of the room', () => {
    // 4px gap + 100px + 4px edge: 108px below the anchor is just enough, 107px is not.
    expect(choosePlacement(input({ anchor: box(100, 800 - 108 - 20, 50, 20) })).side).toBe('bottom')
    expect(choosePlacement(input({ anchor: box(100, 800 - 107 - 20, 50, 20) })).side).toBe('top')
  })

  it('takes the roomier side when neither has room', () => {
    const tall = { width: 200, height: 500 }
    expect(choosePlacement(input({ size: tall, anchor: box(100, 300, 50, 20) })).side).toBe(
      'bottom'
    )
    expect(choosePlacement(input({ size: tall, anchor: box(100, 480, 50, 20) })).side).toBe('top')
  })

  it('hangs from the anchor’s other end when its own end has no room', () => {
    expect(choosePlacement(input({ anchor: box(900, 300, 50, 20) })).align).toBe('end')
    expect(choosePlacement(input({ align: 'end', anchor: box(20, 300, 50, 20) })).align).toBe(
      'start'
    )
  })

  it('centres on the anchor, shifted to fit, when neither end has room', () => {
    const wide = { width: 700, height: 100 }
    expect(choosePlacement(input({ size: wide, anchor: box(400, 300, 50, 20) })).align).toBe(
      'center'
    )
  })

  it('keeps a centred popover centred, the shift keeping it in the window', () => {
    expect(choosePlacement(input({ align: 'center', anchor: box(10, 300, 20, 20) })).align).toBe(
      'center'
    )
  })
})
