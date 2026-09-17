import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Popover } from '../popover'

const rect = { left: 10, top: 20, width: 30, height: 40 }

describe('Popover', () => {
  it('renders children in a labelled container anchored to a rect in the article', () => {
    render(
      <article style={{ position: 'relative' }}>
        <Popover
          rect={rect}
          anchorName="--test-anchor"
          role="toolbar"
          ariaLabel="Test menu"
          onDismiss={vi.fn()}
        >
          <button>Item</button>
        </Popover>
      </article>
    )
    expect(screen.getByRole('toolbar', { name: 'Test menu' })).toBeDefined()
    expect(screen.getByText('Item')).toBeDefined()

    // The anchor is laid out IN the article at the article-relative rect, so
    // it scrolls with the content the popover points at.
    const anchor = document.querySelector<HTMLElement>('[data-popover-anchor]')
    expect(anchor).not.toBeNull()
    expect(anchor?.closest('article')).not.toBeNull()
    expect(anchor?.style.position).toBe('absolute')
    expect(anchor?.style.left).toBe('10px')
    expect(anchor?.style.top).toBe('20px')
    expect(anchor?.style.width).toBe('30px')
    expect(anchor?.style.height).toBe('40px')
    // The caller-supplied name still threads through, for a stylesheet that
    // wants to position something else against the same target.
    expect(anchor?.style.getPropertyValue('anchor-name')).toBe('--test-anchor')
  })

  it('omits the synthesized anchor when element-anchored (no rect)', () => {
    render(
      <>
        <div data-slash-anchor />
        <Popover
          anchor="[data-slash-anchor]"
          side="bottom"
          align="start"
          role="listbox"
          ariaLabel="Insert"
          onDismiss={vi.fn()}
        >
          <button>Item</button>
        </Popover>
      </>
    )
    expect(screen.getByRole('listbox', { name: 'Insert' })).toBeDefined()
    expect(document.querySelector('[data-popover-anchor]')).toBeNull()
  })

  it('dismisses on Escape and on outside pointer-down but not inside', () => {
    const onDismiss = vi.fn()
    render(
      <Popover ariaLabel="Test menu" onDismiss={onDismiss}>
        <button>Item</button>
      </Popover>
    )
    fireEvent.pointerDown(screen.getByText('Item'))
    expect(onDismiss).not.toHaveBeenCalled()
    fireEvent.pointerDown(document.body)
    expect(onDismiss).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledTimes(2)
  })

  it('exempts the trigger named by ignoreSelector from the outside press', () => {
    const onDismiss = vi.fn()
    render(
      <>
        <button data-trigger>Open</button>
        <Popover ariaLabel="Test menu" ignoreSelector="[data-trigger]" onDismiss={onDismiss}>
          <button>Item</button>
        </Popover>
      </>
    )
    fireEvent.pointerDown(screen.getByText('Open'))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('dismisses on scroll only when dismissOnReflow is set', () => {
    const onDismiss = vi.fn()
    const { rerender } = render(
      <Popover ariaLabel="Test menu" onDismiss={onDismiss}>
        <button>Item</button>
      </Popover>
    )
    fireEvent.scroll(window)
    expect(onDismiss).not.toHaveBeenCalled()

    rerender(
      <Popover ariaLabel="Test menu" dismissOnReflow onDismiss={onDismiss}>
        <button>Item</button>
      </Popover>
    )
    fireEvent.scroll(window)
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('hands the container out and takes a className and inline style', () => {
    const containerRef = vi.fn()
    render(
      <Popover
        ariaLabel="Test menu"
        className="custom"
        style={{ top: 12 }}
        containerRef={containerRef}
        onDismiss={vi.fn()}
      >
        <button>Item</button>
      </Popover>
    )
    const container = screen.getByText('Item').parentElement as HTMLElement
    expect(container.className).toContain('custom')
    // No domain identity of its own: the role is the caller's to give.
    expect(container.hasAttribute('role')).toBe(false)
    expect(container.style.top).toBe('12px')
    expect(containerRef).toHaveBeenCalledWith(container)
    // A floating surface contains its own scroll — see `useScrollHandoff`.
    expect(container.hasAttribute('data-scroll-boundary')).toBe(true)
  })
})
