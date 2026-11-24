import { fireEvent, render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ReorderIcon from '@/assets/icons/reorder.svg'
import { BlockGrip, DropLine } from '../block-grip'
import { Button } from '../ui/button'

// The grip a block is moved by: it stands in the margin beside the block the
// pointer rests on, and is dragged to where the block should go, which a line
// shows.

function handlers() {
  return { onPress: vi.fn(), onDragStart: vi.fn(), onRelease: vi.fn() }
}

const gripOf = (container: HTMLElement) =>
  container.querySelector<HTMLElement>('[data-block-grip]')!

describe('BlockGrip', () => {
  it('stands left of its block, centred on the block’s first line', () => {
    const { container } = render(
      <BlockGrip line={{ left: 100, top: 50, height: 32 }} {...handlers()} />
    )
    const grip = gripOf(container)
    // 28px square and 4px clear of the block; centred on a 32px line.
    expect(grip.style.left).toBe('68px')
    expect(grip.style.top).toBe('52px')
    expect(grip.className.split(/\s+/)).toContain('absolute')
  })

  // Its box is the icon button's own, whatever that comes to be: the glyph, its inset, its
  // corner, and a width that hugs them (the article sets its children a column's width).
  it('is as large as an icon button', () => {
    const { container } = render(
      <>
        <BlockGrip line={{ left: 0, top: 0, height: 28 }} {...handlers()} />
        <Button aria-label="Any">
          <ReorderIcon />
        </Button>
      </>
    )
    const box = (element: HTMLElement): string[] =>
      element.className
        .split(/\s+/)
        .filter((name) => /^(w-|h-|size-|p-|rounded-|\[&_svg\]:size-)/.test(name))
        .sort()
    const grip = gripOf(container)
    expect(box(grip)).toEqual(box(container.querySelector('button')!))
    expect(box(grip)).toEqual(['[&_svg]:size-5', 'p-1', 'rounded-xl', 'w-fit'])
  })

  it('is a handle to grab, in a tertiary button’s ink and hover', () => {
    const { container } = render(
      <BlockGrip line={{ left: 0, top: 0, height: 24 }} {...handlers()} />
    )
    const grip = gripOf(container)
    expect(grip.getAttribute('draggable')).toBe('true')
    expect(grip.querySelector('svg')).not.toBeNull()
    expect(grip.className.split(/\s+/)).toEqual(
      expect.arrayContaining([
        'cursor-grab',
        'text-ink-button-tertiary-default',
        'hover:bg-bg-button-tertiary-hover',
        'active:bg-bg-button-tertiary-pressed'
      ])
    )
  })

  // Only a pointer can drag it, so it is nothing to a screen reader or the Tab key.
  it('is the pointer’s alone', () => {
    const { container } = render(
      <BlockGrip line={{ left: 0, top: 0, height: 24 }} {...handlers()} />
    )
    const grip = gripOf(container)
    expect(grip.getAttribute('aria-hidden')).toBe('true')
    expect(grip.hasAttribute('tabindex')).toBe(false)
  })

  it('says when it is pressed, when its drag starts, and when the press is over, dragged or not', () => {
    const h = handlers()
    const { container } = render(<BlockGrip line={{ left: 0, top: 0, height: 24 }} {...h} />)
    const grip = gripOf(container)
    fireEvent.mouseDown(grip)
    expect(h.onPress).toHaveBeenCalledTimes(1)
    fireEvent.click(grip)
    expect(h.onRelease).toHaveBeenCalledTimes(1)
    fireEvent.dragStart(grip)
    expect(h.onDragStart).toHaveBeenCalledTimes(1)
    fireEvent.dragEnd(grip)
    expect(h.onRelease).toHaveBeenCalledTimes(2)
  })
})

describe('DropLine', () => {
  it('is a 2px line in the drop ink, centred on where the block will land', () => {
    const { container } = render(<DropLine line={{ left: 100, top: 36, width: 640 }} />)
    const line = container.querySelector<HTMLElement>('[data-drop-line]')!
    expect(line.style.left).toBe('100px')
    expect(line.style.top).toBe('35px')
    expect(line.style.width).toBe('640px')
    expect(line.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'h-0.5', 'bg-border-drop-line'])
    )
  })

  // The pointer is dragging over it: it must never be what the drag lands on.
  it('is nothing to the pointer or a screen reader', () => {
    const { container } = render(<DropLine line={{ left: 0, top: 0, width: 10 }} />)
    const line = container.querySelector<HTMLElement>('[data-drop-line]')!
    expect(line.getAttribute('aria-hidden')).toBe('true')
    expect(line.className.split(/\s+/)).toContain('pointer-events-none')
  })
})
