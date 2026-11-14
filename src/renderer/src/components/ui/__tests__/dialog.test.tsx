import { useRef, useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Dialog } from '../dialog'
import { useDismiss } from '@/hooks/use-dismiss'
import { onWindowGlass } from '@/test-support'

/** A floating surface of the ordinary kind, standing behind the dialog. */
function Rail({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ ref, onDismiss })
  return <div ref={ref}>rail</div>
}

const dialog = () => screen.getByRole('dialog')

/** A press, as a pointer makes one: down, up, click — at `at`, the origin unless given. */
function press(target: Element, at = { clientX: 0, clientY: 0 }) {
  fireEvent.pointerDown(target, at)
  fireEvent.mouseDown(target, at)
  fireEvent.pointerUp(target, at)
  fireEvent.mouseUp(target, at)
  fireEvent.click(target, at)
}

/**
 * A press on the dim: the `::backdrop` is the dialog's own, so the press lands on
 * the `<dialog>` itself, beside the panel it draws.
 */
function pressBackdrop() {
  const panel = dialog()
  panel.getBoundingClientRect = () => new DOMRect(100, 100, 200, 200)
  press(panel, { clientX: 20, clientY: 20 })
}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    render(
      <Dialog open={false} onClose={vi.fn()}>
        content
      </Dialog>
    )
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('renders a modal dialog with its children while open', () => {
    render(
      <Dialog open onClose={vi.fn()} aria-label="Insert image">
        hello world
      </Dialog>
    )
    expect(screen.getByRole('dialog', { name: 'Insert image' })).toBeDefined()
    expect(screen.getByText('hello world')).toBeDefined()
    // What `useDismiss` reads to leave a menu behind the dialog alone.
    expect(dialog().hasAttribute('data-modal-dialog')).toBe(true)
  })

  it('stands on the solid sheet, over the page veiled and blurred', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        content
      </Dialog>
    )
    const classes = dialog().className.split(/\s+/)
    expect(classes).toContain('bg-surface-sheet')
    expect(classes).not.toContain('frosted-sheet')
    // The dim is the dialog's own `::backdrop`.
    expect(dialog().getAttribute('data-dialog-backdrop')).toBe('')
    expect(classes).toContain('backdrop:backdrop-frost')
    expect(classes).toContain('backdrop:bg-surface-canvas/50')
  })

  // The glass palette's stand-in where AppKit has no glass: the panel is the
  // blur, over the page as it is, cornered as the palette is. A squircle of
  // rounded-3xl traces AppKit's continuous 16pt corner, the palette's.
  it('is a frosted sheet over the page dimmed by 15%, as the glass palette is', () => {
    render(
      <Dialog open onClose={vi.fn()} material="frosted">
        content
      </Dialog>
    )
    const classes = dialog().className.split(/\s+/)
    expect(classes).toContain('frosted-sheet')
    expect(classes).toContain('rounded-3xl')
    expect(classes).not.toContain('rounded-lg')
    expect(classes).not.toContain('bg-surface-sheet')
    expect(classes).not.toContain('rounded-md')
    expect(dialog().getAttribute('data-dialog-backdrop')).toBe('clear')
    expect(classes).toContain('backdrop:bg-black/15')
    expect(dialog().className).not.toMatch(/backdrop-frost/)
  })

  it('closes on a press beside a frosted sheet, its page left clear', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose} material="frosted">
        content
      </Dialog>
    )
    pressBackdrop()
    expect(onClose).toHaveBeenCalled()
  })

  describe('on the window glass', () => {
    // Where AppKit glasses the window, the panel stands straight on that glass,
    // as the glass palette does: no sheet, no rim, no dim, the page faded away.
    it('stands straight on the glass while it is open, and gives it back as it goes', () => {
      const { setGlass, restore } = onWindowGlass()
      const { rerender } = render(
        <Dialog open onClose={vi.fn()} material="glass">
          content
        </Dialog>
      )
      const classes = dialog().className.split(/\s+/)
      expect(setGlass).toHaveBeenLastCalledWith(true)
      expect(dialog().hasAttribute('data-on-glass')).toBe(true)
      expect(classes).toContain('surface-level-1')
      expect(classes).toContain('bg-transparent')
      expect(classes).toContain('backdrop:bg-transparent')
      expect(classes).not.toContain('bg-surface-sheet')
      expect(classes).not.toContain('border')
      expect(dialog().getAttribute('data-dialog-backdrop')).toBe('clear')

      rerender(
        <Dialog open={false} onClose={vi.fn()} material="glass">
          content
        </Dialog>
      )
      expect(setGlass).toHaveBeenLastCalledWith(false)
      restore()
    })

    it('closes on a press beside it, on the glass', () => {
      const { restore } = onWindowGlass()
      const onClose = vi.fn()
      render(
        <Dialog open onClose={onClose} material="glass">
          content
        </Dialog>
      )
      pressBackdrop()
      expect(onClose).toHaveBeenCalled()
      restore()
    })

    // Elsewhere there is no glass to stand on, and it is the solid sheet.
    it('is the solid sheet where the window has no glass', () => {
      render(
        <Dialog open onClose={vi.fn()} material="glass">
          content
        </Dialog>
      )
      const classes = dialog().className.split(/\s+/)
      expect(classes).toContain('bg-surface-sheet')
      expect(dialog().hasAttribute('data-on-glass')).toBe(false)
      expect(dialog().getAttribute('data-dialog-backdrop')).toBe('')
    })
  })

  it('calls onClose on Escape', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>inner content</p>
      </Dialog>
    )
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close on other keys', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        content
      </Dialog>
    )
    fireEvent.keyDown(dialog(), { key: 'a' })
    expect(onClose).not.toHaveBeenCalled()
  })

  // The command palette opens over whatever is already on screen, and the rail
  // it covers listens for Escape at the document like every floating surface
  // here. One press must close only the dialog.
  it('keeps a menu behind it open when Escape closes the dialog', () => {
    const rail = vi.fn()
    const onClose = vi.fn()
    render(
      <>
        <Rail onDismiss={rail} />
        <Dialog open onClose={onClose}>
          content
        </Dialog>
      </>
    )
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
    expect(rail).not.toHaveBeenCalled()
  })

  // Two presses close two things: with the dialog gone, the rail is what the
  // next Escape finds.
  it('hands Escape back to that menu once it has closed', () => {
    const rail = vi.fn()
    const { rerender } = render(
      <>
        <Rail onDismiss={rail} />
        <Dialog open onClose={vi.fn()}>
          content
        </Dialog>
      </>
    )
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    rerender(
      <>
        <Rail onDismiss={rail} />
        <Dialog open={false} onClose={vi.fn()}>
          content
        </Dialog>
      </>
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(rail).toHaveBeenCalledTimes(1)
  })

  it('calls onClose when the backdrop is pressed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>inner content</p>
      </Dialog>
    )
    pressBackdrop()
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close when inner content is pressed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>inner</p>
      </Dialog>
    )
    press(screen.getByText('inner'))
    expect(onClose).not.toHaveBeenCalled()
  })

  // A drag that starts in the panel and is let go over the dim is a selection
  // running long, not a way out.
  it('does not close on a press begun in the panel and let go beside it', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>inner</p>
      </Dialog>
    )
    const panel = dialog()
    panel.getBoundingClientRect = () => new DOMRect(100, 100, 200, 200)
    fireEvent.pointerDown(screen.getByText('inner'), { clientX: 150, clientY: 150 })
    fireEvent.click(panel, { clientX: 20, clientY: 20 })
    expect(onClose).not.toHaveBeenCalled()
  })

  // The platform's own: the top layer, the inert page behind, the `::backdrop`.
  it('is a native dialog, shown modal and portalled to the body', () => {
    render(
      <main>
        <Dialog open onClose={vi.fn()} aria-label="Settings">
          content
        </Dialog>
      </main>
    )
    const panel = dialog()
    expect(panel.tagName).toBe('DIALOG')
    expect((panel as HTMLDialogElement).open).toBe(true)
    expect(panel.closest('main')).toBeNull()
  })

  // The browser's Escape arrives as `cancel`; the dialog stays the caller's to close.
  it('turns the browser’s cancel into onClose, leaving the dialog open', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        content
      </Dialog>
    )
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog(), cancel)
    expect(onClose).toHaveBeenCalledOnce()
    expect(cancel.defaultPrevented).toBe(true)
    expect((dialog() as HTMLDialogElement).open).toBe(true)
  })

  // An Escape the browser will not let be cancelled closes the dialog itself.
  it('reports a close it did not ask for', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        content
      </Dialog>
    )
    act(() => (dialog() as HTMLDialogElement).close())
    expect(onClose).toHaveBeenCalledOnce()
  })

  describe('holds the page behind it still', () => {
    const html = document.documentElement
    const body = document.body
    const openDialog = () =>
      render(
        <Dialog open onClose={vi.fn()}>
          content
        </Dialog>
      )
    /** A classic scrollbar, 15px wide, showing beside the page. */
    const insetScrollbar = () => {
      vi.spyOn(html, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
      vi.spyOn(body, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
      vi.spyOn(body, 'clientHeight', 'get').mockReturnValue(window.innerHeight)
    }
    afterEach(() => vi.restoreAllMocks())

    it('hides the overflow, keeping a showing scrollbar’s gutter, and restores it on close', () => {
      insetScrollbar()
      const { rerender } = openDialog()
      expect(body.style.overflowY).toBe('hidden')
      expect(body.style.overflowX).toBe('hidden')
      expect(html.style.scrollbarGutter).toBe('stable')
      rerender(
        <Dialog open={false} onClose={vi.fn()}>
          content
        </Dialog>
      )
      expect(body.style.overflowY).toBe('')
      expect(html.style.scrollbarGutter).toBe('')
    })

    it('pins the body beside the scrollbar where the engine keeps no gutter for it', () => {
      insetScrollbar()
      // The body narrows as its overflow turns from scroll to hidden: no stable gutter.
      vi.spyOn(body, 'offsetWidth', 'get').mockImplementation(() =>
        body.style.overflowY === 'scroll' ? window.innerWidth - 15 : window.innerWidth
      )
      const { unmount } = openDialog()
      expect(html.style.scrollbarGutter).toBe('stable')
      expect(html.style.overflowY).toBe('hidden')
      expect(body.style.position).toBe('relative')
      expect(body.style.width).toBe('calc(100vw - 15px)')
      expect(body.style.height).toBe('100dvh')
      expect(body.style.overflowY).toBe('hidden')
      unmount()
      expect(html.style.cssText).toBe('')
      expect(body.style.cssText).toBe('')
    })

    it('only hides the overflow beside an overlay scrollbar, which takes no room', () => {
      vi.spyOn(html, 'clientWidth', 'get').mockReturnValue(window.innerWidth)
      const { unmount } = openDialog()
      expect(body.style.overflowY).toBe('hidden')
      expect(html.style.scrollbarGutter).toBe('')
      unmount()
      expect(body.style.overflowY).toBe('')
    })

    it('leaves a page that already does not scroll alone, as the frosted shell is', () => {
      insetScrollbar()
      body.style.overflowY = 'hidden'
      openDialog()
      expect(html.style.cssText).toBe('')
      expect(body.style.cssText).toBe('overflow-y: hidden;')
      body.style.overflowY = ''
    })
  })

  it('focuses the first tabbable control on open, or the element it is handed', () => {
    function Harness({ toList }: { toList: boolean }) {
      const list = useRef<HTMLDivElement>(null)
      return (
        <Dialog open onClose={vi.fn()} initialFocus={toList ? list : undefined}>
          <p>text</p>
          <button tabIndex={-1}>Skipped</button>
          <button>First</button>
          <div ref={list} tabIndex={-1}>
            rows
          </div>
        </Dialog>
      )
    }
    const { unmount } = render(<Harness toList={false} />)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'First' }))
    unmount()
    render(<Harness toList />)
    expect(document.activeElement).toBe(screen.getByText('rows'))
  })

  it('focuses the panel itself when it holds nothing tabbable', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <p>text</p>
      </Dialog>
    )
    expect(document.activeElement).toBe(dialog())
  })

  it('hands the focus back to what had it, and unmounts its content, once closed', () => {
    function Harness() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          <Dialog open={open} onClose={() => setOpen(false)}>
            <button>Inside</button>
          </Dialog>
        </>
      )
    }
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open' })
    opener.focus()
    fireEvent.click(opener)
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Inside' }))
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('Inside')).toBeNull()
    expect(document.activeElement).toBe(opener)
  })

  it('closes from a Dialog.Close', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <Dialog.Close>Done</Dialog.Close>
      </Dialog>
    )
    fireEvent.click(screen.getByRole('button', { name: 'Done' }))
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('stamps its placement and size for the stylesheet', () => {
    render(
      <Dialog open onClose={vi.fn()} align="top-center" justify="end" size="xs">
        content
      </Dialog>
    )
    expect(dialog().dataset.align).toBe('top-center')
    expect(dialog().dataset.justify).toBe('end')
    expect(dialog().dataset.size).toBe('xs')
  })

  // As the glass palette stands (main/command-palette.ts): centred at the
  // menu's full height, 424px, and never nearer than 24px under the top bar,
  // 40px above the bottom or 24px from either side.
  it('places a palette as the glass palette stands', () => {
    render(
      <Dialog open onClose={vi.fn()} align="palette" size="palette">
        content
      </Dialog>
    )
    const classes = dialog().className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining([
        'mt-[max(72px,calc((100dvh-424px)/2))]',
        'max-h-[calc(100dvh-max(72px,calc((100dvh-424px)/2))-40px)]',
        'w-[min(var(--size-dialog-sm),calc(100vw-48px))]'
      ])
    )
  })

  it('centres a dialog at size sm by default', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        content
      </Dialog>
    )
    expect(dialog().dataset.align).toBe('center')
    expect(dialog().dataset.justify).toBe('center')
    expect(dialog().dataset.size).toBe('sm')
  })

  it('merges a custom className', () => {
    render(
      <Dialog open onClose={vi.fn()} className="custom-class">
        content
      </Dialog>
    )
    expect(dialog().className).toContain('custom-class')
  })

  it('composes a header with a title that names the dialog, and a footer', () => {
    render(
      <Dialog open onClose={vi.fn()}>
        <Dialog.Header>
          <Dialog.Title>Insert image</Dialog.Title>
        </Dialog.Header>
        <p>body</p>
        <Dialog.Footer>
          <Dialog.FooterGroup>
            <button>Cancel</button>
          </Dialog.FooterGroup>
        </Dialog.Footer>
      </Dialog>
    )
    expect(screen.getByRole('dialog', { name: 'Insert image' })).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Insert image' }).closest('header')).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Cancel' }).closest('footer')).not.toBeNull()
  })

  it('is described by its Dialog.Description', () => {
    render(
      <Dialog open onClose={vi.fn()} aria-label="Delete">
        <Dialog.Description>It cannot be undone.</Dialog.Description>
      </Dialog>
    )
    expect(dialog().getAttribute('aria-describedby')).toBe(
      screen.getByText('It cannot be undone.').id
    )
  })
})
