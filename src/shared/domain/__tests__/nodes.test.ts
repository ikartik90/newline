import { describe, expect, it } from 'vitest'
import {
  BlockNodeSchema,
  DEFAULT_MEDIA_FIT,
  DEFAULT_MEDIA_RADIUS,
  MEDIA_PADDING_MAX,
  MEDIA_PADDING_REFERENCE,
  MEDIA_PADDING_STEP,
  MEDIA_PLACEHOLDER_ASPECT,
  MEDIA_RADIUS_MAX,
  MEDIA_RADIUS_STEP,
  MarkSchema,
  MediaNodeSchema,
  TextNodeSchema,
  hasMediaLayout,
  mediaBoxStyle,
  mediaContainerWidth,
  mediaFrameStyle,
  mediaHeightBudgetFactor,
  mediaInsetPx,
  mediaObjectStyle,
  mediaPictureShare,
  mediaRadiusPx,
  mediaReservationStyle,
  mediaReservedAspect
} from '../nodes'

// ---------------------------------------------------------------------------
// MarkSchema
// ---------------------------------------------------------------------------

describe('MarkSchema', () => {
  it.each(['bold', 'italic', 'code', 'underline', 'strikethrough', 'highlight'])(
    'accepts %s',
    (type) => {
      expect(MarkSchema.safeParse({ type }).success).toBe(true)
    }
  )

  it('accepts link with a valid href', () => {
    expect(MarkSchema.safeParse({ type: 'link', href: 'https://example.com' }).success).toBe(true)
  })

  it('rejects link without href', () => {
    expect(MarkSchema.safeParse({ type: 'link' }).success).toBe(false)
  })

  it('rejects link with a non-URL href', () => {
    expect(MarkSchema.safeParse({ type: 'link', href: 'not-a-url' }).success).toBe(false)
  })

  it('accepts a sidenote with an id and its text', () => {
    expect(MarkSchema.safeParse({ type: 'sidenote', id: 'sn-1', text: 'Aside' }).success).toBe(true)
  })

  it('rejects a sidenote with an empty id', () => {
    expect(MarkSchema.safeParse({ type: 'sidenote', id: '', text: 'Aside' }).success).toBe(false)
  })

  it('rejects an unknown mark type', () => {
    expect(MarkSchema.safeParse({ type: 'wavy_underline' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// TextNodeSchema
// ---------------------------------------------------------------------------

describe('TextNodeSchema', () => {
  it('accepts a plain text node', () => {
    expect(TextNodeSchema.safeParse({ type: 'text', text: 'hello' }).success).toBe(true)
  })

  it('accepts a text node with marks', () => {
    expect(
      TextNodeSchema.safeParse({
        type: 'text',
        text: 'hello',
        marks: [{ type: 'bold' }, { type: 'link', href: 'https://example.com' }]
      }).success
    ).toBe(true)
  })

  it('accepts a text node with empty text', () => {
    expect(TextNodeSchema.safeParse({ type: 'text', text: '' }).success).toBe(true)
  })

  it('rejects a text node missing text', () => {
    expect(TextNodeSchema.safeParse({ type: 'text' }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// BlockNodeSchema
// ---------------------------------------------------------------------------

const text = (t: string) => ({ type: 'text', text: t })

describe('BlockNodeSchema', () => {
  it('accepts a paragraph node', () => {
    expect(
      BlockNodeSchema.safeParse({ type: 'paragraph', children: [text('Hello')] }).success
    ).toBe(true)
  })

  it('accepts an indented, centred paragraph', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'paragraph',
        children: [text('Hello')],
        indent: true,
        align: 'center'
      }).success
    ).toBe(true)
  })

  it('rejects a left alignment — left is the absence of the field', () => {
    expect(
      BlockNodeSchema.safeParse({ type: 'paragraph', children: [], align: 'left' }).success
    ).toBe(false)
  })

  it('accepts a heading node at every level', () => {
    for (const level of [1, 2, 3, 4, 5, 6]) {
      expect(
        BlockNodeSchema.safeParse({ type: 'heading', level, children: [text('Title')] }).success
      ).toBe(true)
    }
  })

  it('rejects a heading with an invalid level', () => {
    expect(
      BlockNodeSchema.safeParse({ type: 'heading', level: 7, children: [text('Title')] }).success
    ).toBe(false)
  })

  it('accepts a heading node with a caption', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'heading',
        level: 2,
        caption: 'Eyebrow',
        children: [text('Title')]
      }).success
    ).toBe(true)
  })

  it('accepts a blockquote node with a caption', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'blockquote',
        caption: 'Someone',
        children: [text('Quote')]
      }).success
    ).toBe(true)
  })

  it('accepts a list_item node with numbering fields', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'list_item',
        children: [text('One')],
        marker: 'alpha',
        continued: true,
        start: 3
      }).success
    ).toBe(true)
  })

  it('rejects a list_item node missing children', () => {
    expect(BlockNodeSchema.safeParse({ type: 'list_item' }).success).toBe(false)
  })

  it('rejects a list_item start below one', () => {
    expect(BlockNodeSchema.safeParse({ type: 'list_item', children: [], start: 0 }).success).toBe(
      false
    )
  })

  it('accepts a bullet_list_item node with a check or cross marker', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'bullet_list_item',
        children: [text('Done')],
        marker: 'check'
      }).success
    ).toBe(true)
    expect(
      BlockNodeSchema.safeParse({
        type: 'bullet_list_item',
        children: [text('Nope')],
        marker: 'cross'
      }).success
    ).toBe(true)
  })

  it('accepts a code_block node', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'code_block',
        language: 'typescript',
        children: [text('const a = 1')]
      }).success
    ).toBe(true)
  })

  it('rejects an unsupported code_block language', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'code_block',
        language: 'cobol',
        children: [text('x')]
      }).success
    ).toBe(false)
  })

  it('accepts a horizontal_rule node', () => {
    expect(BlockNodeSchema.safeParse({ type: 'horizontal_rule' }).success).toBe(true)
  })

  it('accepts a media node', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'media',
        kind: 'image',
        src: 'https://cdn.example.com/a.png',
        alt: 'A',
        caption: 'Caption'
      }).success
    ).toBe(true)
  })

  it('accepts a local media source, which is where a picture starts life here', () => {
    expect(
      BlockNodeSchema.safeParse({ type: 'media', kind: 'image', src: 'local://abc.png' }).success
    ).toBe(true)
  })

  it('accepts a clip, with everything a picture takes', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'media',
        kind: 'video',
        src: 'https://cdn.example.com/a.mp4',
        caption: 'Clip',
        objectFit: 'contain',
        padding: 16,
        poster: 'https://cdn.example.com/posters/a.jpg'
      }).success
    ).toBe(true)
  })

  it('refuses a media block that never says what it is', () => {
    expect(BlockNodeSchema.safeParse({ src: 'https://cdn.example.com/a.png' }).success).toBe(false)
    expect(
      BlockNodeSchema.safeParse({ type: 'image', src: 'https://cdn.example.com/a.png' }).success
    ).toBe(false)
  })

  it('accepts a metric node with a caption, value, and subtext', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'metric',
        caption: 'Revenue',
        children: [text('$377k')],
        subtext: 'in the first year'
      }).success
    ).toBe(true)
  })

  it('accepts a metric node without a caption or subtext', () => {
    expect(BlockNodeSchema.safeParse({ type: 'metric', children: [text('12')] }).success).toBe(true)
  })

  it('accepts a link_card node with nothing configured yet', () => {
    expect(BlockNodeSchema.safeParse({ type: 'link_card', config: {} }).success).toBe(true)
  })

  it('accepts a link_card node with a destination and words', () => {
    expect(
      BlockNodeSchema.safeParse({
        type: 'link_card',
        config: {
          content: { title: 'Docs', meta: 'Reference' },
          link: { kind: 'external', href: 'https://example.com', newTab: true }
        }
      }).success
    ).toBe(true)
  })

  it('rejects the kartik.to-only blocks', () => {
    for (const type of ['collection', 'component', 'project_grid', 'social_links']) {
      expect(BlockNodeSchema.safeParse({ type, items: [], componentId: 'x' }).success).toBe(false)
    }
  })

  it('rejects an unknown block type', () => {
    expect(BlockNodeSchema.safeParse({ type: 'table', children: [] }).success).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Media layout
// ---------------------------------------------------------------------------

const image = { type: 'media', kind: 'image', src: '/a.png' }

describe('media layout on media nodes', () => {
  it('leaves both properties absent on a node that never set them', () => {
    const node = MediaNodeSchema.parse(image)
    expect(node.objectFit).toBeUndefined()
    expect(node.padding).toBeUndefined()
  })

  it('accepts the two fits the segmented control offers, and nothing else', () => {
    expect(MediaNodeSchema.parse({ ...image, objectFit: 'contain' }).objectFit).toBe('contain')
    expect(MediaNodeSchema.parse({ ...image, objectFit: 'cover' }).objectFit).toBe('cover')
    expect(() => MediaNodeSchema.parse({ ...image, objectFit: 'fill' })).toThrow()
  })

  it("holds padding to the slider's own grid — multiples of the step, within range", () => {
    expect(MediaNodeSchema.parse({ ...image, padding: 0 }).padding).toBe(0)
    expect(MediaNodeSchema.parse({ ...image, padding: MEDIA_PADDING_MAX }).padding).toBe(
      MEDIA_PADDING_MAX
    )
    expect(() => MediaNodeSchema.parse({ ...image, padding: 5 })).toThrow()
    expect(() => MediaNodeSchema.parse({ ...image, padding: -8 })).toThrow()
    expect(() =>
      MediaNodeSchema.parse({ ...image, padding: MEDIA_PADDING_MAX + MEDIA_PADDING_STEP })
    ).toThrow()
  })

  it("holds the corner to the slider's grid", () => {
    expect(MediaNodeSchema.parse({ ...image, borderRadius: 0 }).borderRadius).toBe(0)
    expect(MediaNodeSchema.parse({ ...image, borderRadius: MEDIA_RADIUS_MAX }).borderRadius).toBe(
      MEDIA_RADIUS_MAX
    )
    expect(() => MediaNodeSchema.parse({ ...image, borderRadius: 3 })).toThrow()
    expect(() => MediaNodeSchema.parse({ ...image, borderRadius: -2 })).toThrow()
    expect(() =>
      MediaNodeSchema.parse({ ...image, borderRadius: MEDIA_RADIUS_MAX + MEDIA_RADIUS_STEP })
    ).toThrow()
  })
})

describe('mediaFrameStyle / mediaObjectStyle', () => {
  it('costs an untouched picture no boxes', () => {
    expect(mediaFrameStyle({})).toEqual({ display: 'contents' })
    expect(mediaBoxStyle({})).toEqual({ display: 'contents' })
  })

  it('states the corner even for an untouched picture, so no surface can supply one', () => {
    expect(mediaObjectStyle({})).toEqual({
      objectFit: DEFAULT_MEDIA_FIT,
      borderRadius: DEFAULT_MEDIA_RADIUS
    })
    expect(DEFAULT_MEDIA_RADIUS).toBe(0)
  })

  it('reads absent and zero as the same square corner', () => {
    expect(mediaObjectStyle({ borderRadius: 0 })).toEqual(mediaObjectStyle({}))
  })

  it('wants no boxes for a square, uninset picture', () => {
    expect(hasMediaLayout({})).toBe(false)
    expect(hasMediaLayout({ borderRadius: 0 })).toBe(false)
    expect(hasMediaLayout({ borderRadius: 2 })).toBe(true)
    expect(hasMediaLayout({ padding: 8 })).toBe(true)
  })

  it('styles the object alone, never the surface or the ground behind it', () => {
    const media = { borderRadius: 20, padding: 32 }
    expect(Object.keys(mediaFrameStyle(media))).not.toContain('borderRadius')
    expect(Object.keys(mediaBoxStyle(media))).not.toContain('borderRadius')
    expect(mediaObjectStyle(media).borderRadius).toBe('3.125cqw')
  })

  it('declares the frame a query container and keeps the inset off it', () => {
    const media = { padding: 32, borderRadius: 12 }
    expect(mediaFrameStyle(media).containerType).toBe('inline-size')
    expect(mediaFrameStyle(media).display).toBe('block')
    expect('padding' in mediaFrameStyle(media)).toBe(false)
    expect(mediaBoxStyle(media).padding).toBe('5%')
  })

  it('claims a query container only for a corner, never merely for an inset', () => {
    expect(mediaFrameStyle({ padding: 32 })).toEqual({ display: 'contents' })
    expect(mediaFrameStyle({ borderRadius: 0, padding: 32 })).toEqual({ display: 'contents' })
    expect(mediaFrameStyle({ borderRadius: 12 }).containerType).toBe('inline-size')
    expect(mediaBoxStyle({ padding: 32 }).padding).toBe('5%')
  })

  it('expresses padding as a share of the reference container, not as pixels', () => {
    expect(mediaBoxStyle({ padding: MEDIA_PADDING_REFERENCE }).padding).toBe('100%')
    expect(mediaBoxStyle({ padding: 32 }).padding).toBe('5%')
    expect(mediaBoxStyle({ padding: 64 }).padding).toBe('10%')
  })

  it('keeps the inset on the box and the corner on the object', () => {
    const media = { padding: 32, borderRadius: 12 }
    expect(mediaBoxStyle(media).padding).toBe('5%')
    expect('borderRadius' in mediaBoxStyle(media)).toBe(false)
    expect(mediaObjectStyle(media).borderRadius).toBeDefined()
    expect('padding' in mediaObjectStyle(media)).toBe(false)
  })

  it('scales the corner with the container, in width-relative units', () => {
    expect(mediaObjectStyle({ borderRadius: MEDIA_PADDING_REFERENCE }).borderRadius).toBe('100cqw')
    expect(mediaObjectStyle({ borderRadius: 20 }).borderRadius).toBe('3.125cqw')
  })

  it('writes a square corner as a plain zero, which needs no container', () => {
    expect(mediaObjectStyle({ borderRadius: 0 }).borderRadius).toBe(0)
  })

  it('resolves the corner in pixels against whatever width it is handed', () => {
    expect(mediaRadiusPx({ borderRadius: 20 }, MEDIA_PADDING_REFERENCE * 2)).toBe(40)
    expect(mediaRadiusPx({ borderRadius: 20 }, MEDIA_PADDING_REFERENCE / 2)).toBe(10)
    expect(mediaRadiusPx({ borderRadius: 20 }, 1280)).toBe(
      (parseFloat(mediaObjectStyle({ borderRadius: 20 }).borderRadius as string) / 100) * 1280
    )
  })

  it('falls back to the authored pixels when no width is known', () => {
    expect(mediaRadiusPx({ borderRadius: 20 })).toBe(20)
    expect(mediaRadiusPx({})).toBe(DEFAULT_MEDIA_RADIUS)
  })

  it('resolves the inset in pixels against whatever width it is handed', () => {
    expect(mediaInsetPx({ padding: 40 }, MEDIA_PADDING_REFERENCE * 2)).toBe(80)
    expect(mediaInsetPx({ padding: 40 }, MEDIA_PADDING_REFERENCE / 2)).toBe(20)
    expect(mediaInsetPx({ padding: 40 }, 1280)).toBe(
      (parseFloat(mediaBoxStyle({ padding: 40 }).padding as string) / 100) * 1280
    )
  })

  it('falls back to the authored inset when no width is known', () => {
    expect(mediaInsetPx({ padding: 40 })).toBe(40)
    expect(mediaInsetPx({})).toBe(0)
  })

  it('reports the share of the box the picture itself takes', () => {
    expect(mediaPictureShare({})).toBe(1)
    expect(mediaPictureShare({ padding: 40 })).toBe(0.875)
    expect(mediaPictureShare({ padding: MEDIA_PADDING_MAX })).toBe(0.75)
  })

  it('takes the height budget through the shape of the picture', () => {
    expect(mediaHeightBudgetFactor({}, 1.778)).toBe(1)
    expect(mediaHeightBudgetFactor({ padding: 40 }, 1)).toBeCloseTo(
      1 / mediaPictureShare({ padding: 40 }),
      10
    )
    expect(mediaHeightBudgetFactor({ padding: 40 }, 16 / 9)).toBeGreaterThan(
      mediaHeightBudgetFactor({ padding: 40 }, 1)
    )
    expect(mediaHeightBudgetFactor({ padding: 40 }, 9 / 16)).toBeLessThan(
      mediaHeightBudgetFactor({ padding: 40 }, 1)
    )
  })

  it('spends the whole height budget and no more', () => {
    const media = { padding: MEDIA_PADDING_MAX }
    for (const aspect of [16 / 9, 1, 9 / 16, 3]) {
      const budget = 800
      const height = budget / mediaHeightBudgetFactor(media, aspect)
      const box = mediaContainerWidth(media, height * aspect)
      expect(height + 2 * mediaInsetPx(media, box)).toBeCloseTo(budget, 10)
    }
  })

  it('recovers the container width an enlarged picture implies', () => {
    expect(mediaContainerWidth({}, 640)).toBe(640)
    expect(mediaContainerWidth({ padding: 40 }, 560)).toBe(640)
    const media = { padding: MEDIA_PADDING_MAX }
    const box = mediaContainerWidth(media, 1200)
    expect(1200 + 2 * mediaInsetPx(media, box)).toBeCloseTo(box, 10)
  })

  it('sizes a laid-out `contain` object to its content, so the corner rounds the picture', () => {
    expect(mediaObjectStyle({ objectFit: 'contain', padding: 32 })).toMatchObject({
      objectFit: 'contain',
      width: 'auto',
      height: 'auto',
      maxWidth: '100%',
      maxHeight: '100%'
    })
  })

  it('lets a `cover` object fill its frame', () => {
    const style = mediaObjectStyle({ objectFit: 'cover', padding: 32 })
    expect(style.objectFit).toBe('cover')
    expect('width' in style).toBe(false)
  })

  it('adds no sizing to an untouched `contain` picture', () => {
    const style = mediaObjectStyle({ objectFit: 'contain' })
    expect(style.objectFit).toBe('contain')
    expect('width' in style).toBe(false)
  })
})

describe('MediaNodeSchema', () => {
  it('holds a picture and a clip under one block identity', () => {
    expect(MediaNodeSchema.parse(image).type).toBe('media')
    expect(MediaNodeSchema.parse({ type: 'media', kind: 'video', src: '/a.mp4' }).type).toBe(
      'media'
    )
  })

  it('takes every field on the clip arm that it takes on the picture arm', () => {
    const node = MediaNodeSchema.parse({
      type: 'media',
      kind: 'video',
      src: '/demo.mp4',
      alt: 'A demo',
      caption: 'The flow',
      objectFit: 'contain',
      padding: MEDIA_PADDING_STEP,
      borderRadius: MEDIA_RADIUS_STEP
    })
    expect(node).toMatchObject({
      kind: 'video',
      alt: 'A demo',
      caption: 'The flow',
      objectFit: 'contain',
      padding: MEDIA_PADDING_STEP,
      borderRadius: MEDIA_RADIUS_STEP
    })
  })

  it('routes on the declared kind, not on the filename', () => {
    expect(MediaNodeSchema.parse({ type: 'media', kind: 'video', src: '/clip' }).kind).toBe('video')
    expect(MediaNodeSchema.parse({ type: 'media', kind: 'image', src: '/still.mp4' }).kind).toBe(
      'image'
    )
  })

  it('takes neither a third kind nor a missing one', () => {
    expect(() => MediaNodeSchema.parse({ type: 'media', kind: 'audio', src: '/a.mp3' })).toThrow()
    expect(() => MediaNodeSchema.parse({ type: 'media', src: '/a.png' })).toThrow()
  })

  it('stores the source’s own pixel size, on either arm', () => {
    expect(MediaNodeSchema.parse({ ...image, width: 1600, height: 900 })).toMatchObject({
      width: 1600,
      height: 900
    })
  })

  it('refuses a dimension no picture could have', () => {
    for (const size of [0, -4, 12.5]) {
      expect(() => MediaNodeSchema.parse({ ...image, width: size, height: 100 })).toThrow()
    }
  })

  it('keeps a poster on a clip and not on a picture', () => {
    const clip = MediaNodeSchema.parse({
      type: 'media',
      kind: 'video',
      src: '/a.mp4',
      poster: 'https://cdn.example.com/posters/a.jpg'
    })
    expect(clip.kind === 'video' && clip.poster).toBe('https://cdn.example.com/posters/a.jpg')
    const picture = MediaNodeSchema.parse({ ...image, poster: 'https://x/y.jpg' })
    expect('poster' in picture).toBe(false)
  })
})

describe('mediaReservedAspect / mediaReservationStyle', () => {
  it("reserves the picture's own shape once the document knows it", () => {
    expect(mediaReservedAspect({ width: 1600, height: 900 })).toBe('1600 / 900')
  })

  it('falls back to the house ratio when either dimension is missing', () => {
    expect(mediaReservedAspect({})).toBe(MEDIA_PLACEHOLDER_ASPECT)
    expect(mediaReservedAspect({ width: 1600 })).toBe(MEDIA_PLACEHOLDER_ASPECT)
  })

  it('is the ratio alone wherever the box gives the picture its width', () => {
    expect(mediaReservationStyle({ width: 1600, height: 900 })).toEqual({
      aspectRatio: '1600 / 900'
    })
  })

  it('gives a sized-to-content picture a width to apply the ratio to', () => {
    expect(
      mediaReservationStyle({}, { objectFit: 'contain', padding: MEDIA_PADDING_STEP })
    ).toEqual({ aspectRatio: MEDIA_PLACEHOLDER_ASPECT, width: '100%', height: 'auto' })
  })

  it('leaves a `contain` picture with no frame around it alone', () => {
    expect(mediaReservationStyle({}, { objectFit: 'contain' })).toEqual({
      aspectRatio: MEDIA_PLACEHOLDER_ASPECT
    })
  })
})
