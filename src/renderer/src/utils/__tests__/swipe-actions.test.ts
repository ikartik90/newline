import { describe, expect, it } from 'vitest'
import { FLICK_SPEED, SWIPE_SLOP, isSwipe, settleSwipe, swipeOffset } from '../swipe-actions'

const WIDTH = 72

describe('swipeOffset', () => {
  it('opens with travel to the left', () => {
    expect(swipeOffset(0, -30, WIDTH)).toBe(30)
  })

  it('does not go past the actions it uncovers', () => {
    expect(swipeOffset(0, -300, WIDTH)).toBe(WIDTH)
  })

  it('does not go past closed', () => {
    expect(swipeOffset(0, 40, WIDTH)).toBe(0)
  })

  it('closes an open row with travel to the right', () => {
    expect(swipeOffset(WIDTH, 30, WIDTH)).toBe(WIDTH - 30)
  })
})

describe('isSwipe', () => {
  it('needs the slop to be crossed', () => {
    expect(isSwipe(-(SWIPE_SLOP - 1), 0)).toBe(false)
    expect(isSwipe(-SWIPE_SLOP, 0)).toBe(true)
  })

  it('is not a swipe when the finger moved more up or down than across', () => {
    expect(isSwipe(-20, 25)).toBe(false)
    expect(isSwipe(-25, 20)).toBe(true)
  })

  it('reads either direction as across', () => {
    expect(isSwipe(20, 5)).toBe(true)
  })
})

describe('settleSwipe', () => {
  it('opens past halfway', () => {
    expect(settleSwipe({ offset: WIDTH / 2, max: WIDTH, speed: 0 })).toBe(true)
  })

  it('closes short of halfway', () => {
    expect(settleSwipe({ offset: WIDTH / 2 - 1, max: WIDTH, speed: 0 })).toBe(false)
  })

  it('opens on a flick however short', () => {
    expect(settleSwipe({ offset: 10, max: WIDTH, speed: FLICK_SPEED })).toBe(true)
  })

  it('does not open on a flick that went nowhere', () => {
    expect(settleSwipe({ offset: 0, max: WIDTH, speed: FLICK_SPEED })).toBe(false)
  })

  it('closes on a flick back, however far open', () => {
    expect(settleSwipe({ offset: WIDTH - 1, max: WIDTH, speed: -FLICK_SPEED })).toBe(false)
  })
})
