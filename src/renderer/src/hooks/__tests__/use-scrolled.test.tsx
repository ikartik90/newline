import { useCallback } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useScrolled } from '../use-scrolled'

function Scroller({ startAt = 0 }: { startAt?: number }) {
  const { scrolled, ref, onScroll } = useScrolled()
  // Stands for a box the browser restored partway down before React saw it.
  const startScrolled = useCallback(
    (el: HTMLDivElement | null) => {
      if (el) el.scrollTop = startAt
      ref(el)
    },
    [ref, startAt]
  )
  return (
    <>
      <div data-testid="box" ref={startScrolled} onScroll={onScroll} />
      <p>{scrolled ? 'scrolled' : 'at top'}</p>
    </>
  )
}

function scrollTo(el: HTMLElement, top: number) {
  el.scrollTop = top
  fireEvent.scroll(el)
}

describe('useScrolled', () => {
  it('is at the top until the box scrolls, and again once it is back', () => {
    render(<Scroller />)
    const box = screen.getByTestId('box')
    expect(screen.getByText('at top')).toBeTruthy()
    scrollTo(box, 40)
    expect(screen.getByText('scrolled')).toBeTruthy()
    scrollTo(box, 0)
    expect(screen.getByText('at top')).toBeTruthy()
  })

  it('reads a box that is already scrolled when it mounts', () => {
    render(<Scroller startAt={120} />)
    expect(screen.getByText('scrolled')).toBeTruthy()
  })

  it('forgets the scroll when the box goes away', () => {
    function Toggle({ show }: { show: boolean }) {
      const { scrolled, ref, onScroll } = useScrolled()
      return (
        <>
          {show && <div data-testid="box" ref={ref} onScroll={onScroll} />}
          <p>{scrolled ? 'scrolled' : 'at top'}</p>
        </>
      )
    }
    const { rerender } = render(<Toggle show />)
    scrollTo(screen.getByTestId('box'), 40)
    expect(screen.getByText('scrolled')).toBeTruthy()
    rerender(<Toggle show={false} />)
    expect(screen.getByText('at top')).toBeTruthy()
  })
})
