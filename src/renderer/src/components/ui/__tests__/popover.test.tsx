import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import css from '@/assets/main.css?raw'
import { Popover, POPOVER_TOOLBAR } from '../popover'

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

  // Cornered round the buttons it holds, concentric with them: no edge of its own, the shadow parts it.
  it('corners the shell round its buttons, with no border', () => {
    render(
      <Popover rect={rect} role="toolbar" ariaLabel="Test menu" onDismiss={vi.fn()}>
        <button>Item</button>
      </Popover>
    )
    const classes = screen.getByRole('toolbar', { name: 'Test menu' }).className.split(/\s+/)
    expect(classes.filter((c) => /^rounded-/.test(c))).toEqual(['rounded-toolbar'])
    expect(classes.filter((c) => /^border/.test(c))).toEqual([])
  })

  // Its options keep their own corner, an icon button's, rather than going square.
  it('stands a floating toolbar 2px clear of its options all round, its options 1px apart and unedged', () => {
    const classes = POPOVER_TOOLBAR.split(/\s+/)
    expect(classes).toContain('[&_button[aria-pressed=true]]:after:border-0')
    // One inset, one gap and one height: a second of any would win or lose by stylesheet order.
    expect(classes.filter((c) => /^(p|px|py)-/.test(c))).toEqual(['p-0.5'])
    expect(classes.filter((c) => c.includes('gap-'))).toEqual(['[&_[role=toolbar]]:gap-px'])
    expect(classes.filter((c) => /^h-/.test(c))).toEqual(['h-(--size-toolbar)'])
    expect(classes.some((c) => c.includes('rounded-none'))).toBe(false)
  })

  it('is as tall as a button and the 2px over and under it', () => {
    expect(css).toContain('--size-toolbar: calc(var(--size-toolbar-button) + 2 * 2px);')
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

  it('stands in the top layer as a manual popover, anchored to the synthesized rect', () => {
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover')
    render(
      <article style={{ position: 'relative' }}>
        <Popover rect={rect} side="bottom" align="start" ariaLabel="Test menu" onDismiss={vi.fn()}>
          <button>Item</button>
        </Popover>
      </article>
    )
    const container = screen.getByText('Item').parentElement as HTMLElement
    // `manual`: dismissal is `useDismiss`'s, never the browser's light dismiss.
    expect(container.getAttribute('popover')).toBe('manual')
    expect(container.hasAttribute('data-test-popover-open')).toBe(true)
    // Portalled out of the article, so its buttons are never the editor's content.
    expect(container.closest('article')).toBeNull()
    // The side and alignment the stylesheet places it by (`[data-popover]` in main.css).
    expect(container.dataset.side).toBe('bottom')
    expect(container.dataset.align).toBe('start')
    const anchor = document.querySelector('[data-popover-anchor]')
    expect(show).toHaveBeenCalledWith({ source: anchor })
    show.mockRestore()
  })

  it('anchors to the element a selector finds, and follows it when it moves', () => {
    const show = vi.spyOn(HTMLElement.prototype, 'showPopover')
    const hide = vi.spyOn(HTMLElement.prototype, 'hidePopover')
    // A fresh element each render, as the slash menu re-renders on every keystroke.
    const menu = () => (
      <Popover anchor="[data-slash-anchor]" ariaLabel="Insert" onDismiss={vi.fn()}>
        <button>Item</button>
      </Popover>
    )
    const { rerender } = render(
      <>
        <p data-slash-anchor="">one</p>
        <p>two</p>
        {menu()}
      </>
    )
    expect(show).toHaveBeenLastCalledWith({ source: screen.getByText('one') })
    expect(hide).not.toHaveBeenCalled()

    rerender(
      <>
        <p>one</p>
        <p data-slash-anchor="">two</p>
        {menu()}
      </>
    )
    expect(show).toHaveBeenLastCalledWith({ source: screen.getByText('two') })
    expect(show).toHaveBeenCalledTimes(2)
    show.mockRestore()
    hide.mockRestore()
  })

  describe('choosing where it stands', () => {
    // The side and end are the hook's to choose, from where the anchor is now; CSS
    // anchor positioning places it there (`data-placed-side`, `data-placed-align`).
    const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r(undefined)))
    const anchorAt = (el: Element, left: number, top: number) =>
      vi.spyOn(el, 'getBoundingClientRect').mockReturnValue(new DOMRect(left, top, 50, 20))
    function sized(el: HTMLElement, width: number, height: number) {
      Object.defineProperty(el, 'offsetWidth', { configurable: true, value: width })
      Object.defineProperty(el, 'offsetHeight', { configurable: true, value: height })
    }

    // jsdom's window is 1024×768. The popover is sized and the anchor placed
    // before it shows, as the browser would have laid them out.
    function renderAnchored(top: number, content = <button>Item</button>) {
      const sizedOnMount = vi
        .spyOn(HTMLElement.prototype, 'offsetHeight', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.hasAttribute('data-popover') ? 100 : 0
        })
      const widthOnMount = vi
        .spyOn(HTMLElement.prototype, 'offsetWidth', 'get')
        .mockImplementation(function (this: HTMLElement) {
          return this.hasAttribute('data-popover') ? 200 : 0
        })
      const rect = vi
        .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
        .mockImplementation(function (this: HTMLElement) {
          return this.hasAttribute('data-slash-anchor')
            ? new DOMRect(100, top, 50, 20)
            : new DOMRect(0, 0, 0, 0)
        })
      render(
        <>
          <p data-slash-anchor="">line</p>
          <Popover
            anchor="[data-slash-anchor]"
            side="bottom"
            align="start"
            ariaLabel="Insert"
            onDismiss={vi.fn()}
          >
            {content}
          </Popover>
        </>
      )
      sizedOnMount.mockRestore()
      widthOnMount.mockRestore()
      rect.mockRestore()
      const anchor = screen.getByText('line')
      const container = screen.getByRole('generic', { name: 'Insert' })
      sized(container, 200, 100)
      anchorAt(anchor, 100, top)
      return { anchor, container }
    }
    const placed = (el: HTMLElement) => [el.dataset.placedSide, el.dataset.placedAlign]

    it('stands where it asks to as it shows, where there is room', () => {
      const { container } = renderAnchored(300)
      expect(placed(container)).toEqual(['bottom', 'start'])
      // What it asked for stays on record beside what it got.
      expect(container.dataset.side).toBe('bottom')
    })

    it('shows on the other side when its own has no room', () => {
      const { container } = renderAnchored(700)
      expect(placed(container)).toEqual(['top', 'start'])
    })

    it('comes back to its own side, in the frame its anchor scrolls to room again', async () => {
      const { anchor, container } = renderAnchored(700)
      anchorAt(anchor, 100, 300)
      fireEvent.scroll(window)
      await nextFrame()
      expect(placed(container)).toEqual(['bottom', 'start'])
    })

    it('flips as the window is resized under it', async () => {
      const { container } = renderAnchored(300)
      const height = window.innerHeight
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 })
      window.dispatchEvent(new Event('resize'))
      await nextFrame()
      Object.defineProperty(window, 'innerHeight', { configurable: true, value: height })
      expect(placed(container)).toEqual(['top', 'start'])
    })

    it('measures once a frame, however many scroll events the frame brings', async () => {
      const { anchor } = renderAnchored(300)
      const rect = anchorAt(anchor, 100, 300)
      fireEvent.scroll(window)
      fireEvent.scroll(window)
      fireEvent.scroll(window)
      await nextFrame()
      expect(rect).toHaveBeenCalledTimes(1)
    })

    it('shows itself again where it moves, so the browser lays it out from the scroll as it is now', async () => {
      const { anchor, container } = renderAnchored(700)
      const show = vi.spyOn(container, 'showPopover')
      const hide = vi.spyOn(container, 'hidePopover')
      anchorAt(anchor, 100, 300)
      fireEvent.scroll(window)
      await nextFrame()
      expect(hide).toHaveBeenCalledTimes(1)
      expect(show).toHaveBeenCalledWith({ source: anchor })
      // Where it stays put, it is left as it is.
      fireEvent.scroll(window)
      await nextFrame()
      expect(show).toHaveBeenCalledTimes(1)
    })

    it('keeps the focus inside it as it shows itself again', async () => {
      const { anchor, container } = renderAnchored(700, <input aria-label="Search" />)
      const search = screen.getByLabelText('Search')
      search.focus()
      // A browser hands the focus back to the page when a popover holding it hides.
      vi.spyOn(container, 'hidePopover').mockImplementation(() => search.blur())
      anchorAt(anchor, 100, 300)
      fireEvent.scroll(window)
      await nextFrame()
      expect(placed(container)).toEqual(['bottom', 'start'])
      expect(document.activeElement).toBe(search)
    })

    it('stops measuring once it closes', async () => {
      const { anchor } = renderAnchored(300)
      const rect = anchorAt(anchor, 100, 300)
      cleanup()
      fireEvent.scroll(window)
      await nextFrame()
      expect(rect).not.toHaveBeenCalled()
    })
  })

  it('never takes the focus from what it floats over', () => {
    render(
      <>
        <textarea aria-label="Editor" autoFocus />
        <Popover ariaLabel="Test menu" onDismiss={vi.fn()}>
          <button>Item</button>
        </Popover>
      </>
    )
    expect(document.activeElement).toBe(screen.getByLabelText('Editor'))
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
