import { render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { MediaNode } from '@shared/domain/media-node'
import { MediaObject, mediaObjectRailStyle } from '../media-object'

const classes = { root: 'root', frame: 'frame', image: 'image' }

const image = (over: Partial<MediaNode> = {}): MediaNode =>
  ({ type: 'media', kind: 'image', src: 'a.png', ...over }) as MediaNode

function setup(props: Partial<Parameters<typeof MediaObject>[0]> = {}) {
  const handlers = { onReplace: vi.fn(), onRemove: vi.fn() }
  render(<MediaObject item={image()} classes={classes} label="Image" {...handlers} {...props} />)
  return handlers
}

const toolbar = () => screen.getByRole('toolbar')

describe('MediaObject toolbar', () => {
  // The rail is a toolbar shell, cornered as a text button is.
  it('corners its rail at 12px', () => {
    const classes = mediaObjectRailStyle.split(/\s+/)
    expect(classes).toContain('rounded-lg')
    expect(classes).not.toContain('rounded-md')
  })

  // A note keeps no layout for a picture, so there is nothing else to offer.
  it('offers replace and remove, and nothing else', () => {
    setup()
    expect(
      within(toolbar())
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Replace image', 'Remove image'])
  })

  it('routes each control to its handler', () => {
    const handlers = setup()
    const rail = within(toolbar())
    rail.getByRole('button', { name: 'Replace image' }).click()
    rail.getByRole('button', { name: 'Remove image' }).click()
    expect(handlers.onReplace).toHaveBeenCalledOnce()
    expect(handlers.onRemove).toHaveBeenCalledOnce()
  })

  it('lets the surface name what removal means', () => {
    setup({ removeLabel: 'Delete image' })
    expect(within(toolbar()).getByRole('button', { name: 'Delete image' })).toBeDefined()
  })

  it('names the object it belongs to', () => {
    setup({ label: 'Image 3' })
    expect(toolbar().getAttribute('aria-label')).toBe('Image 3 actions')
  })
})

describe('MediaObject media', () => {
  it('falls back to the caption for alt text', () => {
    setup({ item: image({ caption: 'A wiring diagram' }) })
    expect(document.querySelector('img')!.getAttribute('alt')).toBe('A wiring diagram')
  })

  // Held, not played: a note is for writing in.
  it('shows a clip as a clip, with its still, and does not start it', () => {
    setup({ item: { type: 'media', kind: 'video', src: 'demo.mp4', poster: 'still.jpg' } })
    const clip = document.querySelector('video')!
    expect(clip.getAttribute('poster')).toBe('still.jpg')
    expect(clip.hasAttribute('autoplay')).toBe(false)
  })

  it('draws no broken picture when there is no source', () => {
    setup({ item: image({ src: '' }) })
    expect(document.querySelector('img')).toBeNull()
  })

  // What the rail's reveal and the note's own styling find the frame by.
  it('marks the frame as a media cell', () => {
    setup()
    expect(document.querySelector('[data-media-cell]')?.className).toBe('frame')
  })
})
