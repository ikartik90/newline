import { createRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { actionStyles } from '../action'
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
        expect(button.className).not.toContain('bg-surface-button-primary-default')
        unmount()
      }
    })
  })

  describe('shape', () => {
    // As tall as an icon button: a 20px glyph on a 4px inset.
    it('makes every text button the one 28px body-sm chip', () => {
      render(<Button>Save</Button>)
      const button = screen.getByRole('button', { name: 'Save' })
      expect(button.className.split(' ')).toContain('h-7')
      expect(button.className).toContain('text-style-body-sm')
      expect(button.className).not.toMatch(/\bh-(8|10)\b/)
      expect(button.dataset.size).toBeUndefined()
    })

    it('corners an icon button as the shell does: 16px, eased into a squircle', () => {
      render(
        <Button aria-label="Close">
          <svg />
        </Button>
      )
      const button = screen.getByRole('button', { name: 'Close' })
      const classes = button.className.split(/\s+/)
      expect(classes).toContain('rounded-xl')
      expect(classes).not.toContain('rounded-lg')
    })

    it('corners a text button at 12px', () => {
      render(<Button>Save</Button>)
      const classes = screen.getByRole('button', { name: 'Save' }).className.split(/\s+/)
      expect(classes).toContain('rounded-lg')
      expect(classes).not.toContain('rounded-md')
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

// An icon button's glyph at rest takes the icon ink, one step softer on a sheet;
// pressed, it keeps the brand chip's ink, and the chip floating on a picture
// keeps its own.
describe('an icon button’s glyph at rest', () => {
  it('takes the icon ink only while not pressed, and never on a picture', () => {
    const rest = 'not-aria-pressed:[&_svg]:text-glyph-icon'
    expect(actionStyles({ variant: 'icon', emphasis: 'tertiary' }).split(/\s+/)).toContain(rest)
    expect(actionStyles({ variant: 'icon', emphasis: 'glass' })).not.toContain('text-glyph-icon')
    expect(actionStyles({ variant: 'text', emphasis: 'tertiary' })).not.toContain('text-glyph-icon')
  })
})

// A secondary or tertiary text button at rest takes the control ink, ink 2,
// its icon with it; a primary keeps its flipped ink and the chip on a picture its own.
describe('a text button at rest', () => {
  it('takes the control ink, label and icon both', () => {
    const secondary = actionStyles({ variant: 'text', emphasis: 'secondary' }).split(/\s+/)
    expect(secondary).toContain('text-glyph-control')
    expect(secondary).not.toContain('text-glyph-body')
    expect(actionStyles({ variant: 'text', emphasis: 'primary' })).not.toContain('glyph-control')
    expect(actionStyles({ variant: 'text', emphasis: 'glass' })).not.toContain('glyph-control')
  })

  it('takes the control ink as a tertiary too', () => {
    const tertiary = actionStyles({ variant: 'text', emphasis: 'tertiary' }).split(/\s+/)
    expect(tertiary).toContain('text-glyph-control')
    expect(tertiary).not.toContain('text-glyph-body')
  })
})
