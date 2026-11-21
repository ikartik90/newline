import { describe, expect, it } from 'vitest'
import { railFadeHeight } from '../rail-fade'

describe('railFadeHeight', () => {
  it('stands at least 60% of the rail tall before much is said', () => {
    expect(railFadeHeight({ top: 0, bottom: 800 }, 700)).toBe(480)
    expect(railFadeHeight({ top: 0, bottom: 800 }, 900)).toBe(480)
  })

  it('runs from the rail’s foot up to the top of a longer conversation', () => {
    expect(railFadeHeight({ top: 0, bottom: 800 }, 200)).toBe(600)
  })

  it('fills the rail once the conversation reaches past its top', () => {
    expect(railFadeHeight({ top: 48, bottom: 800 }, -1200)).toBe(752)
  })

  it('fills the rail while the conversation overflows, wherever it is scrolled', () => {
    expect(railFadeHeight({ top: 0, bottom: 800 }, 88, true)).toBe(800)
  })
})
