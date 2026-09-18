import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { BulletToolbar, type BulletStyle } from '../bullet-toolbar'

function handlers() {
  return {
    rect: { left: 0, top: 0, width: 24, height: 24 },
    onSelect: vi.fn(),
    onContinue: vi.fn(),
    onReset: vi.fn(),
    onDismiss: vi.fn()
  }
}

describe('BulletToolbar', () => {
  it('renders the continue / reset actions and the three bullet styles', () => {
    render(<BulletToolbar style="dot" {...handlers()} />)
    expect(screen.getByRole('toolbar', { name: 'List bullet options' })).toBeDefined()
    for (const label of [
      'Continue bullets from previous list',
      'Reset bullets to the default style',
      'Bulleted list',
      'Checked list',
      'Crossed list'
    ]) {
      expect(screen.getByLabelText(label)).toBeDefined()
    }
  })

  it.each<[BulletStyle, string]>([
    ['dot', 'Bulleted list'],
    ['check', 'Checked list'],
    ['cross', 'Crossed list']
  ])("presses only the current style's button (%s)", (style, label) => {
    render(<BulletToolbar style={style} {...handlers()} />)
    const pressed = screen
      .getAllByRole('button', { pressed: true })
      .map((b) => b.getAttribute('aria-label'))
    expect(pressed).toEqual([label])
  })

  it('reports the picked style and the continue / reset actions', () => {
    const h = handlers()
    render(<BulletToolbar style="dot" {...h} />)
    fireEvent.click(screen.getByLabelText('Checked list'))
    expect(h.onSelect).toHaveBeenCalledWith('check')
    fireEvent.click(screen.getByLabelText('Crossed list'))
    expect(h.onSelect).toHaveBeenCalledWith('cross')
    fireEvent.click(screen.getByLabelText('Continue bullets from previous list'))
    expect(h.onContinue).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Reset bullets to the default style'))
    expect(h.onReset).toHaveBeenCalled()
  })

  it('dismisses on Escape, on an outside press and on reflow (the rect was click-captured)', () => {
    const h = handlers()
    render(<BulletToolbar style="dot" {...h} />)
    fireEvent.pointerDown(screen.getByLabelText('Checked list'))
    expect(h.onDismiss).not.toHaveBeenCalled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.pointerDown(document.body)
    expect(h.onDismiss).toHaveBeenCalledTimes(2)
    fireEvent.scroll(window)
    expect(h.onDismiss).toHaveBeenCalledTimes(3)
  })
})
