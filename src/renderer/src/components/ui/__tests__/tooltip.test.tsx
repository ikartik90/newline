import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
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
})
