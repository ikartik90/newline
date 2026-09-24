import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSwipeActions, WHEEL_SETTLE_MS } from '../use-swipe-actions'
import { CONTROL_DRAG_ATTR } from '@/utils/control-drag'

const WIDTH = 72

/** The clock the flick is timed against, stated by the test. */
let clock = 0
const elapse = (ms: number) => {
  clock += ms
}

function Row({
  open: initialOpen = false,
  onOpenChange = () => {},
  onClick = () => {}
}: {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  onClick?: () => void
}) {
  const [open, setOpen] = useState(initialOpen)
  const { translate, dragging, handlers } = useSwipeActions({
    width: WIDTH,
    open,
    onOpenChange: (next) => {
      setOpen(next)
      onOpenChange(next)
    },
    now: () => clock
  })
  return (
    <div
      data-testid="row"
      data-translate={translate}
      data-dragging={dragging ? 'yes' : 'no'}
      onClick={onClick}
      {...handlers}
    >
      Note
    </div>
  )
}

const row = () => screen.getByTestId('row')
const translate = () => Number(row().getAttribute('data-translate'))
const dragging = () => row().getAttribute('data-dragging')

const press = (x: number, y = 10) =>
  fireEvent.pointerDown(row(), { clientX: x, clientY: y, pointerId: 1, button: 0 })
const move = (x: number, y = 10) =>
  fireEvent.pointerMove(row(), { clientX: x, clientY: y, pointerId: 1 })
const release = (x: number, y = 10) =>
  fireEvent.pointerUp(row(), { clientX: x, clientY: y, pointerId: 1 })

describe('useSwipeActions', () => {
  beforeEach(() => {
    clock = 0
  })
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    document.documentElement.removeAttribute(CONTROL_DRAG_ATTR)
  })

  it('sits closed until something moves it', () => {
    render(<Row />)
    expect(translate()).toBe(0)
    expect(dragging()).toBe('no')
  })

  it('sits open by the width of the actions', () => {
    render(<Row open />)
    expect(translate()).toBe(WIDTH)
  })

  it('follows a finger to the left once it has crossed the slop', () => {
    render(<Row />)
    press(200)
    move(196)
    expect(dragging()).toBe('no')
    move(150)
    expect(dragging()).toBe('yes')
    expect(translate()).toBe(50)
    expect(document.documentElement.hasAttribute(CONTROL_DRAG_ATTR)).toBe(true)
  })

  it('leaves a finger that went up or down to the list', () => {
    render(<Row />)
    press(200, 10)
    move(198, 40)
    expect(dragging()).toBe('no')
    // Committed to the scroll: turning sideways later does not make it a swipe.
    move(120, 60)
    expect(dragging()).toBe('no')
    expect(translate()).toBe(0)
  })

  it('opens when let go past halfway, and hands the row back to the layout', () => {
    const onOpenChange = vi.fn()
    render(<Row onOpenChange={onOpenChange} />)
    press(200)
    move(160)
    release(160)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(dragging()).toBe('no')
    expect(translate()).toBe(WIDTH)
    expect(document.documentElement.hasAttribute(CONTROL_DRAG_ATTR)).toBe(false)
  })

  it('closes when let go short of halfway', () => {
    const onOpenChange = vi.fn()
    render(<Row onOpenChange={onOpenChange} />)
    press(200)
    move(180)
    release(180)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(translate()).toBe(0)
  })

  it('opens on a flick that barely travelled', () => {
    const onOpenChange = vi.fn()
    render(<Row onOpenChange={onOpenChange} />)
    press(200)
    elapse(10)
    move(185)
    elapse(1)
    release(185)
    expect(onOpenChange).toHaveBeenCalledWith(true)
  })

  it('closes an open row that is swiped back', () => {
    const onOpenChange = vi.fn()
    render(<Row open onOpenChange={onOpenChange} />)
    press(100)
    move(150)
    expect(translate()).toBe(WIDTH - 50)
    release(150)
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })

  it('swallows the click that ends a swipe, and no other', () => {
    const onClick = vi.fn()
    render(<Row onClick={onClick} />)
    press(200)
    move(160)
    release(160)
    fireEvent.click(row())
    expect(onClick).not.toHaveBeenCalled()
    fireEvent.click(row())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('closes an open row on a plain tap rather than passing the tap on', () => {
    const onOpenChange = vi.fn()
    const onClick = vi.fn()
    render(<Row open onOpenChange={onOpenChange} onClick={onClick} />)
    press(100)
    release(100)
    fireEvent.click(row())
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(onClick).not.toHaveBeenCalled()
  })

  it('lets a plain tap on a closed row through', () => {
    const onClick = vi.fn()
    render(<Row onClick={onClick} />)
    press(100)
    release(100)
    fireEvent.click(row())
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('puts the row back where it was when the gesture is cancelled', () => {
    const onOpenChange = vi.fn()
    render(<Row onOpenChange={onOpenChange} />)
    press(200)
    move(140)
    fireEvent.pointerCancel(row(), { pointerId: 1 })
    expect(translate()).toBe(0)
    expect(dragging()).toBe('no')
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.documentElement.hasAttribute(CONTROL_DRAG_ATTR)).toBe(false)
  })

  it('follows a second finger not at all', () => {
    render(<Row />)
    press(200)
    fireEvent.pointerMove(row(), { clientX: 100, clientY: 10, pointerId: 2 })
    expect(dragging()).toBe('no')
  })

  describe('on a trackpad', () => {
    it('follows a sideways scroll and settles once it stops', () => {
      vi.useFakeTimers()
      const onOpenChange = vi.fn()
      render(<Row onOpenChange={onOpenChange} />)
      fireEvent.wheel(row(), { deltaX: 30, deltaY: 2 })
      expect(translate()).toBe(30)
      expect(dragging()).toBe('yes')
      fireEvent.wheel(row(), { deltaX: 60, deltaY: 0 })
      expect(translate()).toBe(WIDTH)
      act(() => {
        vi.advanceTimersByTime(WHEEL_SETTLE_MS)
      })
      expect(onOpenChange).toHaveBeenCalledWith(true)
      expect(dragging()).toBe('no')
      expect(translate()).toBe(WIDTH)
    })

    it('closes again when the scroll stopped short', () => {
      vi.useFakeTimers()
      const onOpenChange = vi.fn()
      render(<Row onOpenChange={onOpenChange} />)
      fireEvent.wheel(row(), { deltaX: 20, deltaY: 0 })
      act(() => {
        vi.advanceTimersByTime(WHEEL_SETTLE_MS)
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
      expect(translate()).toBe(0)
    })

    it('leaves an up-or-down scroll to the list', () => {
      vi.useFakeTimers()
      const onOpenChange = vi.fn()
      render(<Row onOpenChange={onOpenChange} />)
      fireEvent.wheel(row(), { deltaX: 3, deltaY: 40 })
      expect(dragging()).toBe('no')
      act(() => {
        vi.advanceTimersByTime(WHEEL_SETTLE_MS)
      })
      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('ignores a scroll that would only push a closed row further closed', () => {
      vi.useFakeTimers()
      const onOpenChange = vi.fn()
      render(<Row onOpenChange={onOpenChange} />)
      fireEvent.wheel(row(), { deltaX: -40, deltaY: 0 })
      expect(dragging()).toBe('no')
      act(() => {
        vi.advanceTimersByTime(WHEEL_SETTLE_MS)
      })
      expect(onOpenChange).not.toHaveBeenCalled()
    })

    it('closes an open row scrolled back', () => {
      vi.useFakeTimers()
      const onOpenChange = vi.fn()
      render(<Row open onOpenChange={onOpenChange} />)
      fireEvent.wheel(row(), { deltaX: -50, deltaY: 0 })
      expect(translate()).toBe(WIDTH - 50)
      act(() => {
        vi.advanceTimersByTime(WHEEL_SETTLE_MS)
      })
      expect(onOpenChange).toHaveBeenCalledWith(false)
    })
  })
})
