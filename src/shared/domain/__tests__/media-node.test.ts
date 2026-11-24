import { describe, expect, it } from 'vitest'
import { MEDIA_PLACEHOLDER_ASPECT, MediaNodeSchema, mediaReservedAspect } from '../media-node'

const image = { type: 'media', kind: 'image', src: '/a.png' }

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
      width: 1600,
      height: 900
    })
    expect(node).toMatchObject({
      kind: 'video',
      alt: 'A demo',
      caption: 'The flow',
      width: 1600,
      height: 900
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

describe('mediaReservedAspect', () => {
  it("reserves the picture's own shape once the document knows it", () => {
    expect(mediaReservedAspect({ width: 1600, height: 900 })).toBe('1600 / 900')
  })

  it('falls back to the house ratio when either dimension is missing', () => {
    expect(mediaReservedAspect({})).toBe(MEDIA_PLACEHOLDER_ASPECT)
    expect(mediaReservedAspect({ width: 1600 })).toBe(MEDIA_PLACEHOLDER_ASPECT)
  })
})
