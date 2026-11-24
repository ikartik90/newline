import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { MediaAsset } from '@shared/domain/media'
import { lines, mount, standInLayout } from './support/editor'

// The dialog reaches the media library over Electron; here it says the mode it
// was opened in and hands back one picture when asked to.
vi.mock('@/components/image-insert-dialog', () => ({
  ImageInsertDialog: ({
    open,
    mode,
    initialPhase,
    onInsert
  }: {
    open: boolean
    mode: string
    initialPhase: string
    onInsert: (payload: { src: string; alt?: string; kind: 'image' | 'video' }) => void
  }) =>
    open ? (
      <button
        type="button"
        data-mode={mode}
        data-phase={initialPhase}
        onClick={() =>
          onInsert({ src: 'https://example.com/picked.png', alt: 'Picked', kind: 'image' })
        }
      >
        Insert the picked picture
      </button>
    ) : null
}))

beforeAll(standInLayout)
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  standInLayout()
})

const PICTURE = lines('![A hill](https://example.com/a.png "At dawn")', '', 'After')
const CLIP = lines('![](https://example.com/b.mp4)')

const rail = (container: HTMLElement): HTMLElement =>
  within(container.querySelector('figure')!).getByRole('toolbar', { name: 'Image actions' })

describe('a picture or a clip, as today', () => {
  it('stands the whole width of the article, in the boxes the old editor drew', () => {
    const { container } = mount(PICTURE)
    const figure = container.querySelector('figure')!
    expect(figure.classList).toContain('w-full')
    const picture = figure.querySelector('img')!
    for (const name of ['w-full', 'block', 'border', 'border-border-divider', 'self-stretch']) {
      expect(picture.classList, name).toContain(name)
    }
    expect(picture.closest('[data-media-cell]')?.classList).toContain('rounded-xl')
  })

  it('marks a picture as still to come until it has loaded', () => {
    const { container } = mount(PICTURE)
    const picture = container.querySelector('img')!
    expect(picture.hasAttribute('data-media-pending')).toBe(true)
    fireEvent.load(picture)
    expect(picture.hasAttribute('data-media-pending')).toBe(false)
  })

  it("holds a clip still and silent, with none of the browser's controls", () => {
    const { container } = mount(CLIP)
    const clip = container.querySelector('video')!
    expect(clip.controls).toBe(false)
    expect(clip.autoplay).toBe(false)
    expect(clip.muted).toBe(true)
    expect(clip.loop).toBe(true)
    expect(clip.getAttribute('preload')).toBe('metadata')
  })

  it("has today's rail over it, less the properties", () => {
    const { container } = mount(PICTURE)
    expect(
      within(rail(container))
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
    ).toEqual(['Replace image', 'Delete image'])
  })

  it('takes the picture out of the note from Delete', () => {
    const { container, written } = mount(PICTURE)
    fireEvent.click(within(rail(container)).getByRole('button', { name: 'Delete image' }))
    expect(written()).toBe(lines('After'))
    expect(container.querySelector('figure')).toBeNull()
  })

  it('leaves a line to write on when the picture deleted was all the note held', () => {
    const { container, written } = mount(lines('![A hill](https://example.com/a.png)'))
    fireEvent.click(within(rail(container)).getByRole('button', { name: 'Delete image' }))
    // A line that holds nothing is how an empty note is written.
    expect(written()).toBe(lines('&nbsp;'))
    expect(container.querySelectorAll('p')).toHaveLength(1)
  })

  it('puts another picture in its place from Replace, the caption kept', () => {
    const { container, written } = mount(PICTURE)
    fireEvent.click(within(rail(container)).getByRole('button', { name: 'Replace image' }))
    const pick = screen.getByRole('button', { name: 'Insert the picked picture' })
    // Today's dialog opens on the library for a change.
    expect(pick.getAttribute('data-mode')).toBe('change')
    expect(pick.getAttribute('data-phase')).toBe('library')
    fireEvent.click(pick)
    expect(written()).toBe(
      lines('![Picked](https://example.com/picked.png "At dawn")', '', 'After')
    )
    expect(screen.queryByRole('button', { name: 'Insert the picked picture' })).toBeNull()
  })

  it('keeps the rail out of what the note is saved as and what is typed', () => {
    const { container, onChange } = mount(PICTURE)
    expect(rail(container).closest('[contenteditable="false"]')).not.toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })
})

describe('what the library knows of a picture', () => {
  const asset = (over: Partial<MediaAsset>): MediaAsset => ({
    key: 'k',
    url: 'https://example.com/a.png',
    filename: 'a.png',
    contentType: 'image/png',
    size: 1,
    ...over
  })

  function library(assets: MediaAsset[]): void {
    vi.stubGlobal('api', { media: { list: () => Promise.resolve(assets) } })
  }

  it('holds the box at the shape the library has for it while the picture is coming', async () => {
    library([asset({ width: 1200, height: 800 })])
    const { container } = mount(PICTURE)
    await act(async () => {})
    const picture = container.querySelector('img')!
    expect(picture.style.aspectRatio).toBe('1200 / 800')
    fireEvent.load(picture)
    expect(picture.style.aspectRatio).toBe('')
  })

  it("shows a clip's still from the library until it has a frame", async () => {
    library([
      asset({
        url: 'https://example.com/b.mp4',
        contentType: 'video/mp4',
        poster: 'https://example.com/b.jpg'
      })
    ])
    const { container } = mount(CLIP)
    await act(async () => {})
    expect(container.querySelector('video')!.getAttribute('poster')).toBe(
      'https://example.com/b.jpg'
    )
  })

  it('draws the picture all the same when there is no library to ask', async () => {
    const { container } = mount(PICTURE)
    await act(async () => {})
    expect(container.querySelector('img')!.getAttribute('src')).toBe('https://example.com/a.png')
  })
})
