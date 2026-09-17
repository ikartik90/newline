import { useRef } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Dialog } from '../dialog'
import { useDismiss } from '@/hooks/use-dismiss'

/** A floating surface of the ordinary kind, standing behind the dialog. */
function Rail({ onDismiss }: { onDismiss: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useDismiss({ ref, onDismiss })
  return <div ref={ref}>rail</div>
}

const dialog = () => screen.getByRole('dialog')

/** A press outside the panel, as a pointer makes one: down, up, click. */
function pressOutside(target: Element) {
  fireEvent.pointerDown(target)
  fireEvent.mouseDown(target)
  fireEvent.pointerUp(target)
  fireEvent.mouseUp(target)
  fireEvent.click(target)
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
    const backdrop = document.querySelector('[data-dialog-backdrop]') as HTMLElement
    expect(backdrop).not.toBeNull()
    pressOutside(backdrop)
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('does not close when inner content is pressed', () => {
    const onClose = vi.fn()
    render(
      <Dialog open onClose={onClose}>
        <p>inner</p>
      </Dialog>
    )
    pressOutside(screen.getByText('inner'))
    expect(onClose).not.toHaveBeenCalled()
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
})
