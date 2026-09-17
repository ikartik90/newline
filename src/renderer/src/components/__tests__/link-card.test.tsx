import { cleanup, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { LinkCardConfig } from '@shared/domain/link-card'
import type { MediaNode } from '@shared/domain/nodes'
import { LinkCard } from '../link-card'

/** A cover is a media object; these two spell the constant parts once. */
const picture = (src: string, over: Partial<MediaNode> = {}): MediaNode =>
  ({ type: 'media', kind: 'image', src, ...over }) as MediaNode

const clip = (src: string): MediaNode => ({ type: 'media', kind: 'video', src })

const external = (href: string, newTab?: boolean): LinkCardConfig['link'] => ({
  kind: 'external',
  href,
  ...(newTab ? { newTab } : {})
})

const scrim = () => document.querySelector('[data-link-card-scrim]')
const caption = () => document.querySelector('[data-link-card-caption]')

describe('LinkCard', () => {
  it('is a link to where it points, named by its title', () => {
    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    const link = screen.getByRole('link', { name: 'Atlas' })
    expect(link.getAttribute('href')).toBe('https://atlas.test/')
  })

  it('is ONE box with the title inside it', () => {
    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    const link = screen.getByRole('link', { name: 'Atlas' })
    expect(link.querySelector('h2')?.textContent).toBe('Atlas')
  })

  it('carries a meta line over the cover when it is given one', () => {
    render(
      <LinkCard
        config={{
          content: { title: 'On frames', meta: '21 August 2026' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    const link = screen.getByRole('link')
    expect(link.contains(screen.getByText('21 August 2026'))).toBe(true)
  })

  it('says nothing but its title when there is no meta line', () => {
    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    expect(screen.getByRole('link').textContent).toBe('Atlas')
  })

  it('lays its cover across the card, as the element that can show it', () => {
    const { container } = render(
      <LinkCard
        config={{
          media: { light: picture('/opening.png') },
          content: { title: 'On frames' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    expect(container.querySelector('img')?.getAttribute('src')).toBe('/opening.png')
    // The FORMAT decides the element, and it is the cover's own word for it.
    expect(container.querySelector('video')).toBeNull()
  })

  it('plays a clip rather than showing it as a broken picture', () => {
    const { container } = render(
      <LinkCard
        config={{
          media: { light: clip('/demo.mp4') },
          content: { title: 'Atlas' },
          link: external('https://atlas.test/')
        }}
      />
    )
    const shown = container.querySelector('video')
    expect(shown?.getAttribute('src')).toBe('/demo.mp4')
    expect(shown?.hasAttribute('autoplay')).toBe(true)
    expect(shown?.hasAttribute('loop')).toBe(true)
    expect(shown?.hasAttribute('muted')).toBe(true)
  })

  it("keeps the cover out of the link's name", () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/opening.png', { alt: 'A diagram' }) },
          content: { title: 'On frames', meta: '21 August 2026' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    // The picture is the illustration; the link is named by what it opens.
    expect(screen.getByRole('link', { name: '21 August 2026 On frames' })).toBeTruthy()
  })

  it('grounds the words only where there is a picture under them', () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/opening.png') },
          content: { title: 'On frames' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    expect(screen.getByRole('link').hasAttribute('data-covered')).toBe(true)
    expect(document.querySelector('[data-link-card-wash]')).not.toBeNull()

    cleanup()

    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    expect(screen.getByRole('link').hasAttribute('data-covered')).toBe(false)
    expect(document.querySelector('[data-link-card-wash]')).toBeNull()
  })

  // Everything is positioned with no z-index anywhere, so tree order IS paint
  // order: frosting under the wash, the wash under the words.
  it('stacks every layer in paint order, frosting to caption', () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/opening.png') },
          content: { title: 'On frames', meta: '21 August 2026' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    const layers = [...scrim()!.children].map((node) =>
      node.hasAttribute('data-link-card-frost')
        ? 'frosting'
        : node.hasAttribute('data-link-card-wash')
          ? 'wash'
          : node.hasAttribute('data-link-card-caption')
            ? 'caption'
            : '?'
    )
    expect(layers).toEqual(['frosting', 'wash', 'caption'])
  })

  it('puts the words INSIDE the scrim, so it can never be shorter than they are', () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/opening.png') },
          content: { title: 'On frames', meta: '21 August 2026' },
          link: external('https://x.test/on-frames')
        }}
      />
    )
    expect(scrim()?.contains(screen.getByText('On frames'))).toBe(true)
    expect(scrim()?.contains(screen.getByText('21 August 2026'))).toBe(true)
  })

  it('draws no caption at all when it carries no words', () => {
    render(
      <LinkCard
        config={{ media: { light: picture('/p.png') }, link: external('https://p.test/') }}
      />
    )
    expect(caption()).toBeNull()
  })

  // The picture is decorative, so a wordless card is named by where it goes.
  it('is named by its destination when it shows no words', () => {
    render(
      <LinkCard
        config={{ media: { light: picture('/p.png') }, link: external('https://p.test/') }}
      />
    )
    expect(screen.getByRole('link', { name: 'https://p.test/' })).toBeTruthy()
  })

  it('shows a meta line with no title under it', () => {
    render(
      <LinkCard config={{ content: { meta: 'Playground' }, link: external('https://p.test/') }} />
    )
    expect(screen.getByRole('link').textContent).toBe('Playground')
  })

  it('can carry words over a picture with no scrim under them', () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/p.png') },
          content: { title: 'Shader', scrim: false },
          link: external('https://p.test/')
        }}
      />
    )
    expect(document.querySelector('[data-link-card-wash]')).toBeNull()
    expect(caption()).toBeTruthy()
  })

  it('pins the scrim and its ink to the tone it was given', () => {
    render(
      <LinkCard
        config={{
          media: { light: picture('/p.png') },
          content: { title: 'Shader', tone: 'dark' },
          link: external('https://p.test/')
        }}
      />
    )
    expect(scrim()?.getAttribute('data-tone')).toBe('dark')
  })

  it("lets the words follow the reader's theme when no tone is set", () => {
    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    expect(scrim()?.hasAttribute('data-tone')).toBe(false)
  })

  // Two files, both in the DOM, swapped in CSS.
  it('carries a picture per theme, and shows one of them at a time', () => {
    const { container } = render(
      <LinkCard
        config={{
          media: { light: picture('/light.png'), dark: picture('/dark.png') },
          link: external('https://p.test/')
        }}
      />
    )
    const sources = [...container.querySelectorAll('img')].map((img) => img.getAttribute('src'))
    expect(sources).toEqual(['/light.png', '/dark.png'])
    const frames = container.querySelectorAll('[data-link-card-media-frame]')
    expect(frames[0].className).toContain('dark:hidden')
    expect(frames[1].className).toContain('dark:block')
  })

  it('shows the one picture in both themes when only one was given', () => {
    const { container } = render(
      <LinkCard
        config={{ media: { light: picture('/one.png') }, link: external('https://p.test/') }}
      />
    )
    expect(container.querySelectorAll('img').length).toBe(1)
    expect(
      container.querySelector('[data-link-card-media-frame]')?.className.includes('dark:')
    ).toBe(false)
  })

  it('counts a dark-only picture as a cover', () => {
    render(
      <LinkCard
        config={{ media: { dark: picture('/dark.png') }, link: external('https://p.test/') }}
      />
    )
    expect(screen.getByRole('link').hasAttribute('data-covered')).toBe(true)
  })

  it('opens away from here when it is told to', () => {
    render(
      <LinkCard
        config={{ content: { title: 'Elsewhere' }, link: external('https://example.com', true) }}
      />
    )
    const link = screen.getByRole('link', { name: 'Elsewhere' })
    expect(link.getAttribute('target')).toBe('_blank')
    // Never `_blank` without it: the opened page otherwise gets a handle on
    // this one through `window.opener`.
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  })

  it('stays in this tab by default', () => {
    render(
      <LinkCard config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }} />
    )
    expect(screen.getByRole('link').hasAttribute('target')).toBe(false)
  })

  // A card being built has not been pointed anywhere yet. An anchor with an
  // empty href is a link to the page you are already on, so a card with no
  // destination is not a link at all.
  it('is not a link until it has somewhere to go', () => {
    render(<LinkCard config={{ content: { title: 'Unfinished' } }} />)
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText('Unfinished')).toBeTruthy()
  })

  // On the editor's canvas the card is scenery: not followable, and not in
  // the tab order either, since Enter on a focused link navigates as well as
  // a click does.
  it('is a plain box on the canvas, whatever it points at', () => {
    const { container } = render(
      <LinkCard
        interactive={false}
        config={{ content: { title: 'Atlas' }, link: external('https://atlas.test/') }}
      />
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(container.querySelector('a')).toBeNull()
    expect(container.querySelector('[tabindex]')).toBeNull()
    expect(screen.getByText('Atlas')).toBeTruthy()
  })

  it('takes a class from its surface', () => {
    const { container } = render(<LinkCard className="canvas" config={{}} />)
    expect(container.firstElementChild?.className).toContain('canvas')
  })
})
