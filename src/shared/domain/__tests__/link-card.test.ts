import { describe, expect, it } from 'vitest'
import { LinkCardConfigSchema, LinkCardLinkSchema, linkCardHref, linkCardTitle } from '../link-card'

const image = {
  type: 'media' as const,
  kind: 'image' as const,
  src: 'https://cdn.example.com/a.png'
}

describe('LinkCardLinkSchema', () => {
  it('takes a kind with no destination chosen yet', () => {
    expect(LinkCardLinkSchema.safeParse({ kind: 'external' }).success).toBe(true)
  })

  it('takes an absolute URL for an external link', () => {
    expect(
      LinkCardLinkSchema.safeParse({ kind: 'external', href: 'https://example.com/thing' }).success
    ).toBe(true)
  })

  it('refuses an external link that is not a URL', () => {
    expect(LinkCardLinkSchema.safeParse({ kind: 'external', href: 'example.com' }).success).toBe(
      false
    )
  })

  it("takes the uploaded file's URL for a document link", () => {
    expect(
      LinkCardLinkSchema.safeParse({
        kind: 'document',
        href: 'https://cdn.example.com/media/uuid-cv.pdf'
      }).success
    ).toBe(true)
  })

  it('has no internal kind — there is no site to link into', () => {
    expect(LinkCardLinkSchema.safeParse({ kind: 'internal', href: '/x' }).success).toBe(false)
  })
})

describe('LinkCardConfigSchema', () => {
  it('accepts a card with nothing configured', () => {
    expect(LinkCardConfigSchema.parse({})).toEqual({})
  })

  it('carries a picture per theme', () => {
    const parsed = LinkCardConfigSchema.parse({
      media: { light: image, dark: { ...image, src: 'https://cdn.example.com/b.png' } }
    })
    expect(parsed.media?.light?.src).toBe(image.src)
    expect(parsed.media?.dark?.src).toBe('https://cdn.example.com/b.png')
  })

  it("takes one theme's picture on its own", () => {
    expect(LinkCardConfigSchema.parse({ media: { light: image } })).toEqual({
      media: { light: image }
    })
  })

  it('carries the words and the ground they stand on', () => {
    const parsed = LinkCardConfigSchema.parse({
      content: { title: 'Shader Playground', meta: 'Playground', scrim: true, tone: 'dark' }
    })
    expect(parsed.content).toEqual({
      title: 'Shader Playground',
      meta: 'Playground',
      scrim: true,
      tone: 'dark'
    })
  })

  it('refuses a tone that is neither light nor dark', () => {
    expect(LinkCardConfigSchema.safeParse({ content: { tone: 'system' } }).success).toBe(false)
  })

  it('carries the destination and whether it opens away from here', () => {
    const parsed = LinkCardConfigSchema.parse({
      link: { kind: 'external', href: 'https://example.com', newTab: true }
    })
    expect(parsed.link?.newTab).toBe(true)
  })
})

describe('linkCardHref', () => {
  it('reads the destination off whichever kind was chosen', () => {
    expect(linkCardHref({ link: { kind: 'external', href: 'https://example.com' } })).toBe(
      'https://example.com'
    )
  })

  it('has no href until a destination is chosen', () => {
    expect(linkCardHref({})).toBeUndefined()
  })
})

describe('linkCardTitle', () => {
  it('is the title the author wrote', () => {
    expect(linkCardTitle({ content: { title: 'Shader' } })).toBe('Shader')
  })

  it('falls back to the destination for a card with no words', () => {
    expect(linkCardTitle({ link: { kind: 'external', href: 'https://example.com' } })).toBe(
      'https://example.com'
    )
  })

  it('has no name at all for a card with neither', () => {
    expect(linkCardTitle({})).toBeUndefined()
  })
})
