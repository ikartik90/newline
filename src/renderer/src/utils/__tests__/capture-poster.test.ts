import { describe, expect, it, vi } from 'vitest'
import { POSTER_SAMPLE_COUNT } from '../poster-frame'
import { choosePoster, type ClipReader } from '../capture-poster'

/** A flat frame of one brightness — nothing in it, whatever the value. */
const flatFrame = (value: number, size = 4) =>
  new Uint8ClampedArray(size * size * 4).fill(value).map((_, i) => (i % 4 === 3 ? 255 : value))

/** A frame with a picture in it. */
function busyFrame(size = 4) {
  const pixels = new Uint8ClampedArray(size * size * 4)
  for (let i = 0; i < size * size; i++) {
    const value = i % 2 === 0 ? 0 : 255
    pixels.set([value, value, value, 255], i * 4)
  }
  return pixels
}

/**
 * A clip that is blank for its first half and holds a picture for its second —
 * the shape of every screen recording that opens on an empty state.
 */
function fakeReader(overrides: Partial<ClipReader> = {}): ClipReader {
  const duration = overrides.duration ?? 10
  return {
    duration,
    sampleAt: vi.fn(async (time: number) => (time < duration / 2 ? flatFrame(0) : busyFrame())),
    stillAt: vi.fn(async (time: number) => new Blob([`still@${time}`], { type: 'image/jpeg' })),
    close: vi.fn(),
    ...overrides
  }
}

describe('choosePoster', () => {
  it('reads a frame at each sample time and takes the still from the winner', async () => {
    const reader = fakeReader()
    const poster = await choosePoster(reader)

    expect(reader.sampleAt).toHaveBeenCalledTimes(POSTER_SAMPLE_COUNT)
    // The picture is in the second half, so that is where the still comes from.
    expect(poster?.time).toBeGreaterThan(5)
    expect(reader.stillAt).toHaveBeenCalledWith(poster?.time)
    expect(poster?.blob.type).toBe('image/jpeg')
  })

  it('closes the clip however it goes', async () => {
    const reader = fakeReader()
    await choosePoster(reader)
    expect(reader.close).toHaveBeenCalled()

    const broken = fakeReader({
      sampleAt: vi.fn(async () => {
        throw new Error('decode failed')
      })
    })
    await choosePoster(broken)
    expect(broken.close).toHaveBeenCalled()
  })

  it('gives the clip up rather than failing the upload it happens during', async () => {
    expect(
      await choosePoster(
        fakeReader({
          sampleAt: vi.fn(async () => {
            throw new Error('decode failed')
          })
        })
      )
    ).toBeNull()

    expect(await choosePoster(fakeReader({ stillAt: vi.fn(async () => null) }))).toBeNull()
  })

  it('skips a frame it could not read rather than scoring it as blank', async () => {
    // A blank frame and an unreadable one are not the same thing: scoring a
    // failed decode as "nothing in it" is a vote, and the frame did not vote.
    const reader = fakeReader({
      duration: 10,
      sampleAt: vi.fn(async (time: number) => {
        if (time < 5) throw new Error('decode failed')
        return busyFrame()
      })
    })
    const poster = await choosePoster(reader)
    expect(poster?.time).toBeGreaterThan(5)
  })
})
