import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ActionTooltipHost } from '../action'
import { Button } from '../button'
import { Tooltip } from '../tooltip'

// The tooltip has no life of its own — a HOST (Button.Tooltip / Link.Tooltip)
// owns the open state and the anchor. These tests use the Button host.

/** The box itself — the portalled surface the label sits in. */
const box = (label: string) => screen.getByText(label).parentElement as HTMLElement

// Spread rather than wrapped in a fragment: the tooltip reads its children
// one by one, as a host writes them.
function host(...children: React.ReactNode[]) {
  return (
    <Button aria-label="Delete">
      <svg />
      <Button.Tooltip>{children}</Button.Tooltip>
    </Button>
  )
}

describe('Tooltip', () => {
  // The box is drawn at the VISITOR'S CURSOR, routinely outside whatever it
  // labels, so an ancestor's clip would paint it nowhere. It escapes to the
  // body, once, in the library.
  it('renders on the body, out of reach of any ancestor’s clip', () => {
    const { container } = render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    expect(container.contains(box('Delete'))).toBe(false)
    expect(document.body.contains(box('Delete'))).toBe(true)
  })

  it('renders the label and is decorative (aria-hidden)', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    expect(box('Delete').getAttribute('aria-hidden')).toBe('true')
  })

  it('inserts a divider between the label and trailing content', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>, <svg data-icon />))
    // [label, divider, icon]
    expect(box('Delete').children.length).toBe(3)
    expect(box('Delete').children[1].getAttribute('aria-hidden')).toBe('true')
  })

  it('omits the divider when there is only a label', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    expect(box('Delete').children.length).toBe(1)
  })

  it('reflects the host’s hover via data-open', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const button = screen.getByRole('button', { name: 'Delete' })
    expect(box('Delete').hasAttribute('data-open')).toBe(false)

    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 4, clientY: 4 })
    expect(box('Delete').hasAttribute('data-open')).toBe(true)

    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    expect(box('Delete').hasAttribute('data-open')).toBe(false)
  })

  // Its label and icons stand in the control ink, ink 2; the brand tone keeps its own.
  it('inks its label as a control at rest, the brand tone its own', () => {
    const { unmount } = render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const plain = box('Delete').className.split(/\s+/)
    expect(plain).toContain('text-glyph-control')
    expect(plain).not.toContain('text-glyph-body')
    unmount()

    render(
      <Button aria-label="Try">
        <svg />
        <Button.Tooltip tone="brand">
          <Tooltip.Text>Try it</Tooltip.Text>
        </Button.Tooltip>
      </Button>
    )
    const brand = box('Try it').className.split(/\s+/)
    expect(brand).toContain('text-glyph-field-active')
    expect(brand).not.toContain('text-glyph-control')
  })

  it('takes the brand tone and a className on the box', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    render(
      <Button aria-label="Try">
        <svg />
        <Button.Tooltip tone="brand" className="custom">
          <Tooltip.Text>Try it</Tooltip.Text>
        </Button.Tooltip>
      </Button>
    )
    const brand = box('Try it')
    expect(brand.dataset.tone).toBe('brand')
    expect(brand.className).toContain('custom')
    expect(box('Delete').dataset.tone).toBeUndefined()
  })

  it('stands in the top layer as a hint popover the trigger names with interestfor', () => {
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover')
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const button = screen.getByRole('button', { name: 'Delete' })
    const tip = box('Delete')
    expect(tip.getAttribute('popover')).toBe('hint')
    expect(tip.id).not.toBe('')
    expect(button.getAttribute('interestfor')).toBe(tip.id)
    expect(tip.hasAttribute('data-test-popover-open')).toBe(false)

    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 4, clientY: 4 })
    expect(tip.hasAttribute('data-test-popover-open')).toBe(true)
    expect(show).toHaveBeenCalledWith({ source: button })

    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    expect(tip.hasAttribute('data-test-popover-open')).toBe(false)
    show.mockRestore()
  })

  // Anchored to a point kept at the pointer, so the stylesheet's flips and
  // slides (`[data-tooltip]` in main.css) keep it on screen as it trails.
  it('hangs from a point that follows the cursor', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const button = screen.getByRole('button', { name: 'Delete' })
    const cursor = document.querySelector<HTMLElement>('[data-tooltip-cursor]')
    expect(cursor).not.toBeNull()

    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 40, clientY: 50 })
    expect(cursor?.style.left).toBe('40px')
    expect(cursor?.style.top).toBe('50px')
    const name = cursor?.style.getPropertyValue('anchor-name')
    expect(name).toMatch(/^--/)
    expect(box('Delete').style.getPropertyValue('position-anchor')).toBe(name)

    fireEvent.pointerMove(button, { pointerType: 'mouse', clientX: 60, clientY: 70 })
    expect(cursor?.style.left).toBe('60px')
    expect(cursor?.style.top).toBe('70px')
  })

  it('held open with no pointer, hangs from the trigger itself', () => {
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover')
    render(
      <ActionTooltipHost open onClose={vi.fn()} trigger={<span>cursor</span>}>
        <Tooltip>
          <Tooltip.Text>Held</Tooltip.Text>
        </Tooltip>
      </ActionTooltipHost>
    )
    expect(box('Held').hasAttribute('data-test-popover-open')).toBe(true)
    expect(box('Held').style.getPropertyValue('position-anchor')).toBe('')
    expect(show).toHaveBeenCalledWith({ source: screen.getByText('cursor') })
    show.mockRestore()
  })

  // Showing a hint hides every other hint; a specimen page holds several open.
  it('held, stands as a manual popover beside others', () => {
    render(
      <ActionTooltipHost open held onClose={vi.fn()} trigger={<span>cursor</span>}>
        <Tooltip>
          <Tooltip.Text>Held</Tooltip.Text>
        </Tooltip>
      </ActionTooltipHost>
    )
    expect(box('Held').getAttribute('popover')).toBe('manual')
  })

  // The browser would open it on keyboard focus, where there is no cursor to
  // trail; the host's hover is the only thing that opens it.
  it('refuses the browser’s own interest, so focus alone never opens it', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const interest = new Event('interest', { cancelable: true })
    box('Delete').dispatchEvent(interest)
    expect(interest.defaultPrevented).toBe(true)

    screen.getByRole('button', { name: 'Delete' }).focus()
    expect(box('Delete').hasAttribute('data-open')).toBe(false)
  })

  it('closes when the browser dismisses it, and on a press of the trigger', () => {
    render(host(<Tooltip.Text>Delete</Tooltip.Text>))
    const button = screen.getByRole('button', { name: 'Delete' })

    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 4, clientY: 4 })
    // Escape, or a press outside: the hint popover's light dismiss.
    act(() => {
      box('Delete').dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' }))
    })
    expect(box('Delete').hasAttribute('data-open')).toBe(false)

    fireEvent.pointerLeave(button, { pointerType: 'mouse' })
    fireEvent.pointerEnter(button, { pointerType: 'mouse', clientX: 4, clientY: 4 })
    expect(box('Delete').hasAttribute('data-open')).toBe(true)
    fireEvent.pointerDown(button, { pointerType: 'mouse' })
    expect(box('Delete').hasAttribute('data-open')).toBe(false)
  })
})
