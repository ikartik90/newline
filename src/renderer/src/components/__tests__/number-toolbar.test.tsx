import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberToolbar } from '../number-toolbar'
import { POPOVER_TOOLBAR } from '@/components/ui/popover'

// The Popover shell a toolbar floats in.
const shellOf = (el: HTMLElement) => el.closest<HTMLElement>('.bg-bg-sheet')!

function handlers() {
  return {
    rect: { left: 0, top: 0, width: 24, height: 24 },
    onContinue: vi.fn(),
    onReset: vi.fn(),
    onDismiss: vi.fn()
  }
}

describe('NumberToolbar', () => {
  it('floats on the shared 28px toolbar rail', () => {
    render(<NumberToolbar continueActive={false} {...handlers()} />)
    const shell = shellOf(screen.getByRole('toolbar'))
    for (const c of POPOVER_TOOLBAR.split(' ')) expect(shell.classList).toContain(c)
  })

  it('offers to count on from the list before and to start the count again, and nothing else', () => {
    render(<NumberToolbar continueActive={false} {...handlers()} />)
    expect(screen.getByRole('toolbar', { name: 'List numbering options' })).toBeDefined()
    expect(
      screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Continue numbering from previous list', 'Reset numbering at this item'])
    expect(screen.queryByRole('separator')).toBeNull()
  })

  it('shows continue-numbering as pressed only while it is on for the run', () => {
    const { rerender } = render(<NumberToolbar continueActive={false} {...handlers()} />)
    const button = () => screen.getByLabelText('Continue numbering from previous list')
    expect(button().getAttribute('aria-pressed')).toBe('false')
    rerender(<NumberToolbar continueActive {...handlers()} />)
    expect(button().getAttribute('aria-pressed')).toBe('true')
    // Reset is a plain action, never a toggle.
    expect(screen.getByLabelText('Reset numbering at this item').hasAttribute('aria-pressed')).toBe(
      false
    )
  })

  it('wires continue and reset', () => {
    const h = handlers()
    render(<NumberToolbar continueActive={false} {...h} />)
    fireEvent.click(screen.getByLabelText('Continue numbering from previous list'))
    expect(h.onContinue).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Reset numbering at this item'))
    expect(h.onReset).toHaveBeenCalled()
  })

  it('dismisses on Escape and on reflow (the rect was click-captured)', () => {
    const h = handlers()
    render(<NumberToolbar continueActive={false} {...h} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.resize(window)
    expect(h.onDismiss).toHaveBeenCalledTimes(2)
  })

  // The number opened the options and, pressed again, puts them away: were the press
  // one outside, it would close them just for the click that follows to open them again.
  it('dismisses on a press outside it, and leaves a press on a list’s number to the number', () => {
    const h = handlers()
    const { container } = render(
      <>
        <button data-numbering-marker="">1.</button>
        <button>Elsewhere</button>
        <NumberToolbar continueActive={false} {...h} />
      </>
    )
    const [number, elsewhere] = container.querySelectorAll('button')
    fireEvent.pointerDown(number)
    expect(h.onDismiss).not.toHaveBeenCalled()
    fireEvent.pointerDown(elsewhere)
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
  })
})
