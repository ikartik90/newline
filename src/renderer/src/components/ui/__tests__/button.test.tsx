import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '../button'
import { Tooltip } from '../tooltip'

describe('Button', () => {
  it('renders a text label', () => {
    render(<Button>Cancel</Button>)
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDefined()
  })

  it('defaults to type=button so it never submits a surrounding form', () => {
    render(<Button>Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).getAttribute('type')).toBe('button')
  })

  // WebKit's default tab order reaches form fields and anything carrying an
  // explicit tabindex — NOT a bare <button>. Each one states its own place.
  it('states its own place in the tab order', () => {
    render(<Button aria-label="Save" />)
    expect(screen.getByRole('button', { name: 'Save' }).getAttribute('tabindex')).toBe('0')
  })

  it('still yields it to a caller who takes it', () => {
    render(<Button aria-label="Skip" tabIndex={-1} />)
    expect(screen.getByRole('button', { name: 'Skip' }).getAttribute('tabindex')).toBe('-1')
  })

  it('renders the link variant', () => {
    render(<Button variant="link">browse to upload</Button>)
    const button = screen.getByRole('button', { name: 'browse to upload' })
    expect(button.dataset.variant).toBe('link')
  })

  it('renders the icon variant with an aria-label', () => {
    render(
      <Button variant="icon" aria-label="Close dialog">
        ×
      </Button>
    )
    expect(screen.getByRole('button', { name: 'Close dialog' }).dataset.variant).toBe('icon')
  })

  it('infers the text chip from a Button.Text label and the icon chip from a bare glyph', () => {
    render(
      <>
        <Button>
          <svg />
          <Button.Text>Save changes</Button.Text>
        </Button>
        <Button aria-label="Delete">
          <svg />
        </Button>
      </>
    )
    expect(screen.getByRole('button', { name: 'Save changes' }).dataset.variant).toBe('text')
    expect(screen.getByRole('button', { name: 'Delete' }).dataset.variant).toBe('icon')
  })

  it('blocks click when disabled', () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Insert Image
      </Button>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Insert Image' }))
    expect(onClick).not.toHaveBeenCalled()
  })

  it('forwards ref', () => {
    const ref = createRef<HTMLButtonElement>()
    render(<Button ref={ref}>Go</Button>)
    expect(ref.current?.tagName).toBe('BUTTON')
  })

  it('merges a className', () => {
    render(<Button className="custom">Go</Button>)
    expect(screen.getByRole('button', { name: 'Go' }).className).toContain('custom')
  })

  describe('emphasis', () => {
    it('defaults a text button to secondary (filled at rest)', () => {
      render(<Button>Save</Button>)
      expect(screen.getByRole('button', { name: 'Save' }).dataset.emphasis).toBe('secondary')
    })

    it('drops the resting fill for a tertiary text button', () => {
      render(<Button emphasis="tertiary">Save</Button>)
      expect(screen.getByRole('button', { name: 'Save' }).dataset.emphasis).toBe('tertiary')
    })

    it('classifies an icon button as tertiary by default', () => {
      render(
        <Button variant="icon" aria-label="Close">
          <svg />
        </Button>
      )
      expect(screen.getByRole('button', { name: 'Close' }).dataset.emphasis).toBe('tertiary')
    })

    it('lets an icon button be glass, the one other emphasis it has', () => {
      render(
        <Button emphasis="glass" aria-label="Play">
          <svg />
        </Button>
      )
      expect(screen.getByRole('button', { name: 'Play' }).dataset.emphasis).toBe('glass')
    })

    it('never gives an icon button a primary or secondary chip', () => {
      for (const emphasis of ['primary', 'secondary'] as const) {
        const { unmount } = render(
          <Button emphasis={emphasis} aria-label="Close">
            <svg />
          </Button>
        )
        const button = screen.getByRole('button', { name: 'Close' })
        expect(button.dataset.emphasis).toBe('tertiary')
        expect(button.className).not.toContain('bg-branded')
        unmount()
      }
    })
  })

  describe('shape', () => {
    it('makes every text button the one 32px body-sm chip', () => {
      render(<Button>Save</Button>)
      const button = screen.getByRole('button', { name: 'Save' })
      expect(button.className).toContain('h-8')
      expect(button.className).toContain('text-style-body-sm')
      expect(button.className).not.toContain('h-10')
      expect(button.dataset.size).toBeUndefined()
    })

    it('corners an icon button as the shell does: 12px, eased into a squircle', () => {
      render(
        <Button aria-label="Close">
          <svg />
        </Button>
      )
      const button = screen.getByRole('button', { name: 'Close' })
      expect(button.className).toContain('rounded-lg squircle')
      expect(button.className).not.toContain('rounded-sm')
    })
  })

  describe('Button.Tooltip', () => {
    function iconButton() {
      return (
        <Button aria-label="Delete">
          <svg />
          <Button.Tooltip>
            <Tooltip.Text>Delete</Tooltip.Text>
            <svg />
          </Button.Tooltip>
        </Button>
      )
    }

    it('renders the tooltip decoratively, hidden until hover', () => {
      render(iconButton())
      // Accessible name comes from the button, not the aria-hidden tooltip.
      expect(screen.getByRole('button', { name: 'Delete' })).toBeDefined()
      const tip = screen.getByText('Delete').parentElement as HTMLElement
      expect(tip.getAttribute('aria-hidden')).toBe('true')
      expect(tip.hasAttribute('data-open')).toBe(false)
    })

    it('reveals the tooltip while the cursor is over the button', () => {
      render(iconButton())
      const btn = screen.getByRole('button', { name: 'Delete' })
      const tip = screen.getByText('Delete').parentElement as HTMLElement

      fireEvent.pointerEnter(btn, { pointerType: 'mouse', clientX: 10, clientY: 10 })
      expect(tip.hasAttribute('data-open')).toBe(true)
      expect(btn.hasAttribute('data-tooltip-visible')).toBe(true)

      fireEvent.pointerLeave(btn, { pointerType: 'mouse' })
      expect(tip.hasAttribute('data-open')).toBe(false)
      expect(btn.hasAttribute('data-tooltip-visible')).toBe(false)
    })

    // A tap fires `pointerenter` before `pointerdown`, and the mouse events the
    // engine synthesises afterwards fire another — so a hover-triggered label
    // would open ON the tap and stay up until something else is touched.
    it('stays down for a finger, which has no cursor to label', () => {
      render(iconButton())
      const btn = screen.getByRole('button', { name: 'Delete' })
      const tip = screen.getByText('Delete').parentElement as HTMLElement

      fireEvent.pointerEnter(btn, { pointerType: 'touch', clientX: 10, clientY: 10 })
      fireEvent.mouseEnter(btn, { clientX: 10, clientY: 10 })
      fireEvent.click(btn)
      expect(tip.hasAttribute('data-open')).toBe(false)
    })

    it('still forwards the ref and a caller’s own pointer handlers', () => {
      const ref = createRef<HTMLButtonElement>()
      const onPointerEnter = vi.fn()
      render(
        <Button ref={ref} aria-label="Delete" onPointerEnter={onPointerEnter}>
          <svg />
          <Button.Tooltip>
            <Tooltip.Text>Delete</Tooltip.Text>
          </Button.Tooltip>
        </Button>
      )
      expect(ref.current?.tagName).toBe('BUTTON')
      fireEvent.pointerEnter(ref.current!, { pointerType: 'mouse' })
      expect(onPointerEnter).toHaveBeenCalledTimes(1)
    })
  })
})
