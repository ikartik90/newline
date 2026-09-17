import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MediaNode } from '@shared/domain/nodes'
import { MediaLightbox } from '../media-lightbox'

const picture = (src: string, over: Partial<MediaNode> = {}): MediaNode =>
  ({ type: 'media', kind: 'image', src, ...over }) as MediaNode

function setup(items: MediaNode[], index: number | null = 0) {
  const onIndexChange = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <MediaLightbox items={items} index={index} onIndexChange={onIndexChange} onClose={onClose} />
  )
  return { ...view, onIndexChange, onClose }
}

const dialog = () => screen.getByRole('dialog')

describe('MediaLightbox', () => {
  it('paints nothing while dismissed', () => {
    setup([picture('/a.png')], null)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('enlarges the open object, named by its description', () => {
    setup([picture('/a.png', { alt: 'A diagram' })])
    expect(screen.getByRole('dialog', { name: 'A diagram' })).toBeDefined()
    expect(document.querySelector('img')?.getAttribute('src')).toBe('/a.png')
  })

  it('names a wordless object by its position', () => {
    setup([picture('/a.png'), picture('/b.png')], 1)
    expect(screen.getByRole('dialog', { name: 'Image 2' })).toBeDefined()
  })

  it('shows the caption under the picture', () => {
    setup([picture('/a.png', { caption: 'Wiring' })])
    expect(document.querySelector('figcaption')?.textContent).toBe('Wiring')
  })

  it('steps through the list on the arrow keys, wrapping at the ends', () => {
    const { onIndexChange } = setup([picture('/a.png'), picture('/b.png'), picture('/c.png')], 2)
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(dialog(), { key: 'ArrowLeft' })
    expect(onIndexChange).toHaveBeenLastCalledWith(1)
  })

  // A gallery of ONE wraps onto itself — the standalone block's whole answer
  // to the arrow keys, with nothing to special-case.
  it('wraps a list of one onto itself', () => {
    const { onIndexChange } = setup([picture('/a.png')])
    fireEvent.keyDown(dialog(), { key: 'ArrowRight' })
    expect(onIndexChange).toHaveBeenCalledWith(0)
  })

  it('closes on Escape', () => {
    const { onClose } = setup([picture('/a.png')])
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledOnce()
  })

  it('gives a clip the house transport rather than the browser strip', () => {
    setup([{ type: 'media', kind: 'video', src: '/demo.mp4' }])
    expect(document.querySelector('video')?.hasAttribute('controls')).toBe(false)
    expect(screen.getByRole('button', { name: /video$/ })).toBeDefined()
    expect(document.querySelector('[data-media-surface]')).not.toBeNull()
  })

  // Inset and corner arrive as PIXELS here: the frame is sized by the picture,
  // so a percentage inset and a `cqw` corner would have nothing to resolve
  // against.
  it('draws the inset and the corner as pixels of the reference width', () => {
    setup([picture('/a.png', { padding: 16, borderRadius: 8 })])
    const img = document.querySelector('img')!
    expect(img.style.margin).toBe('16px')
    expect(img.style.borderRadius).toBe('8px')
  })
})
