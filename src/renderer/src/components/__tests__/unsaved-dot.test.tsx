import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { UnsavedDot } from '../unsaved-dot'

describe('UnsavedDot', () => {
  it('is a decorative mark the consumer can find by attribute', () => {
    const { container } = render(<UnsavedDot />)
    const dot = container.querySelector('[data-unsaved]') as HTMLElement
    expect(dot.tagName).toBe('SPAN')
    expect(dot.getAttribute('aria-hidden')).toBe('true')
    expect(dot.textContent).toBe('')
  })

  it('takes the consumer’s placement through className', () => {
    const { container } = render(<UnsavedDot className="-bottom-1" />)
    const dot = container.querySelector('[data-unsaved]') as HTMLElement
    expect(dot.className).toContain('-bottom-1')
    // Never a target — it hangs over the control it annotates.
    expect(dot.className).toContain('pointer-events-none')
  })
})
