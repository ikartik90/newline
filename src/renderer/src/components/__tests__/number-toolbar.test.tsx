import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberToolbar } from '../number-toolbar'

function handlers() {
  return {
    rect: { left: 0, top: 0, width: 24, height: 24 },
    onContinue: vi.fn(),
    onReset: vi.fn(),
    onSwapStyle: vi.fn(),
    onDismiss: vi.fn()
  }
}

describe('NumberToolbar', () => {
  it('offers the lettered swap on a numbered run, and the numbered swap on a lettered one', () => {
    const { rerender } = render(
      <NumberToolbar marker="decimal" continueActive={false} {...handlers()} />
    )
    expect(screen.getByRole('toolbar', { name: 'List numbering options' })).toBeDefined()
    expect(screen.getByLabelText('Switch to lettered list')).toBeDefined()
    expect(screen.queryByLabelText('Switch to numbered list')).toBeNull()

    rerender(<NumberToolbar marker="alpha" continueActive={false} {...handlers()} />)
    expect(screen.getByLabelText('Switch to numbered list')).toBeDefined()
    expect(screen.queryByLabelText('Switch to lettered list')).toBeNull()
  })

  it('shows continue-numbering as pressed only while it is on for the run', () => {
    const { rerender } = render(
      <NumberToolbar marker="decimal" continueActive={false} {...handlers()} />
    )
    const button = () => screen.getByLabelText('Continue numbering from previous list')
    expect(button().getAttribute('aria-pressed')).toBe('false')
    rerender(<NumberToolbar marker="decimal" continueActive {...handlers()} />)
    expect(button().getAttribute('aria-pressed')).toBe('true')
    // Reset is a plain action, never a toggle.
    expect(screen.getByLabelText('Reset numbering at this item').hasAttribute('aria-pressed')).toBe(
      false
    )
  })

  it('wires continue, reset and swap', () => {
    const h = handlers()
    render(<NumberToolbar marker="decimal" continueActive={false} {...h} />)
    fireEvent.click(screen.getByLabelText('Continue numbering from previous list'))
    expect(h.onContinue).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Reset numbering at this item'))
    expect(h.onReset).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Switch to lettered list'))
    expect(h.onSwapStyle).toHaveBeenCalled()
  })

  it('dismisses on Escape and on reflow (the rect was click-captured)', () => {
    const h = handlers()
    render(<NumberToolbar marker="decimal" continueActive={false} {...h} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.resize(window)
    expect(h.onDismiss).toHaveBeenCalledTimes(2)
  })
})
