import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { SwipeActions } from '@/components/swipe-actions'

const noop = () => {}

function renderActions(open: boolean, wells?: string) {
  const { container } = render(
    <SwipeActions open={open} onOpenChange={noop} actions={<span>Delete</span>} wells={wells}>
      <div>Row</div>
    </SwipeActions>
  )
  return container.querySelector('[data-swipe-wells]') as HTMLElement | null
}

const classes = (el: Element | null | undefined) => el?.className.split(/\s+/) ?? []

describe('SwipeActions', () => {
  // A rounded row leaves a well above and below its trailing corner. The
  // actions' ground fills them from inside the row's own layer, so it moves as
  // the row does and reaches no further under the row than the corner.
  it('fills the wells at the row’s rounded end, moving with the row', () => {
    const wells = renderActions(true, 'rounded-xl shadow-[0_0_0_16px_red]')
    expect(wells?.parentElement).toBe(screen.getByText('Row').parentElement)
    expect(classes(wells)).toEqual(
      expect.arrayContaining([
        'absolute',
        'inset-y-0',
        'right-0',
        'w-4',
        'overflow-hidden',
        '-z-10'
      ])
    )
    expect(classes(wells?.firstElementChild)).toEqual(
      expect.arrayContaining(['right-0', 'w-8', 'rounded-xl', 'shadow-[0_0_0_16px_red]'])
    )
    expect(classes(wells)).toContain('visible')
  })

  // At rest the wells lie exactly under the frame's own rounded clip, whose
  // softened edge would let a fringe of them through.
  it('hides the wells while the row rests, once it has slid home', () => {
    const wells = renderActions(false, 'rounded-xl')
    expect(classes(wells)).toContain('invisible')
    expect(classes(wells)).toContain('transition-[visibility]')
    expect(classes(wells)).toContain('duration-200')
  })

  it('draws no wells for a row that names none', () => {
    expect(renderActions(true)).toBeNull()
  })
})
