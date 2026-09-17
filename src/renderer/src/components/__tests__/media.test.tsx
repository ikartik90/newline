import { act, render, screen, cleanup, fireEvent } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Media } from '../media'
import { MEDIA_PLACEHOLDER_ASPECT } from '@shared/domain/nodes'

// jsdom ships no media stack at all: `play()` is a not-implemented stub that
// returns undefined where every browser returns a promise, and `paused` is a
// getter hard-wired to true. So the stubs stand in for the PLATFORM rather than
// just recording calls — they flip `paused` and announce it, which is what the
// element does and what anything reading the element is entitled to expect.
const play = vi.fn(function (this: HTMLMediaElement) {
  Object.defineProperty(this, 'paused', { value: false, configurable: true })
  this.dispatchEvent(new Event('play'))
  return Promise.resolve()
})
const pause = vi.fn(function (this: HTMLMediaElement) {
  Object.defineProperty(this, 'paused', { value: true, configurable: true })
  this.dispatchEvent(new Event('pause'))
})

beforeEach(() => {
  play.mockClear()
  pause.mockClear()
  HTMLMediaElement.prototype.play = play
  HTMLMediaElement.prototype.pause = pause
  window.matchMedia = vi.fn().mockReturnValue({ matches: false })
})

const video = () => document.querySelector('video')

describe('Media', () => {
  it('shows a picture as an <img>, alt and all', () => {
    render(<Media src="/media/shot.png" alt="A screenshot" kind="image" />)
    const image = screen.getByAltText('A screenshot')
    expect(image.tagName).toBe('IMG')
    expect(image.getAttribute('src')).toBe('/media/shot.png')
  })

  it('plays a clip as a <video> instead', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(screen.queryByAltText('A demo')).toBeNull()
    expect(video()).not.toBeNull()
    expect(video()?.getAttribute('aria-label')).toBe('A demo')
  })

  // `kind` is the ONLY thing consulted — a clip under a bare key and a still
  // named `.mp4` are precisely the two cases a filename cannot get right.
  it('renders what it is told it is, whatever the src looks like', () => {
    render(<Media src="/media/8f2c-key" alt="A demo" kind="video" />)
    expect(video()).not.toBeNull()
    expect(screen.queryByAltText('A demo')).toBeNull()

    cleanup()

    render(<Media src="/media/still.mp4" alt="A frame" kind="image" />)
    expect(screen.getByAltText('A frame').tagName).toBe('IMG')
    expect(video()).toBeNull()
  })

  it('withholds the transport from anything declared a picture', () => {
    render(<Media src="/media/still.mp4" alt="A frame" kind="image" transport />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // A decorative source is unlabelled, exactly as `alt=""` leaves an <img>.
  it('leaves a clip with no alt unlabelled rather than labelling it empty', () => {
    render(<Media src="/media/demo.mp4" alt="" kind="video" />)
    expect(video()?.hasAttribute('aria-label')).toBe(false)
  })

  it('mutes and loops a clip, in the markup as well as on the element', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(video()?.muted).toBe(true)
    expect(video()?.hasAttribute('muted')).toBe(true)
    expect(video()?.hasAttribute('loop')).toBe(true)
    expect(video()?.hasAttribute('playsinline')).toBe(true)
    expect(play).toHaveBeenCalled()
  })

  it('withholds the start where the caller says not to', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" autoPlay={false} kind="video" />)
    expect(play).not.toHaveBeenCalled()
    expect(video()?.hasAttribute('autoplay')).toBe(false)
    expect(video()?.muted).toBe(true)
    expect(video()?.hasAttribute('loop')).toBe(true)
  })

  it('holds a clip still for a visitor who asked for less motion', () => {
    window.matchMedia = vi.fn().mockReturnValue({ matches: true })
    render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(play).not.toHaveBeenCalled()
    expect(pause).toHaveBeenCalled()
  })

  it('gives a clip its controls only where they are asked for', () => {
    const { rerender } = render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(video()?.hasAttribute('controls')).toBe(false)
    rerender(<Media src="/media/demo.mp4" alt="A demo" controls kind="video" />)
    expect(video()?.hasAttribute('controls')).toBe(true)
  })

  it('reports intrinsic size from whichever element measured it', () => {
    const onMeasure = vi.fn()
    const { rerender } = render(
      <Media src="/media/shot.png" alt="A screenshot" onMeasure={onMeasure} kind="image" />
    )
    const image = screen.getByAltText('A screenshot')
    Object.defineProperty(image, 'naturalWidth', { value: 640 })
    Object.defineProperty(image, 'naturalHeight', { value: 480 })
    fireEvent.load(image)
    expect(onMeasure).toHaveBeenCalledWith(640, 480)

    rerender(<Media src="/media/demo.mp4" alt="A demo" onMeasure={onMeasure} kind="video" />)
    const clip = video()!
    Object.defineProperty(clip, 'videoWidth', { value: 1280 })
    Object.defineProperty(clip, 'videoHeight', { value: 720 })
    fireEvent.loadedMetadata(clip)
    expect(onMeasure).toHaveBeenLastCalledWith(1280, 720)
  })

  it('gives a clip a transport where it is asked for, and never a picture', () => {
    const { rerender } = render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(screen.queryByRole('button')).toBeNull()

    rerender(<Media src="/media/demo.mp4" alt="A demo" transport kind="video" />)
    expect(screen.getByRole('button')).toBeTruthy()

    rerender(<Media src="/media/shot.png" alt="A screenshot" transport kind="image" />)
    expect(screen.queryByRole('button')).toBeNull()
  })

  // The chip reports the ELEMENT, not the last press.
  it('names the transport for what pressing it will do', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" transport autoPlay={false} kind="video" />)
    expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy()

    act(() => void video()!.play())
    expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy()

    act(() => video()!.pause())
    expect(screen.getByRole('button', { name: 'Play video' })).toBeTruthy()
  })

  it('reports a clip that was already running when the chip arrived', () => {
    const { rerender } = render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    expect(video()!.paused).toBe(false)

    rerender(<Media src="/media/demo.mp4" alt="A demo" transport kind="video" />)
    expect(screen.getByRole('button', { name: 'Pause video' })).toBeTruthy()
  })

  it('stops a playing clip and starts a stopped one', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" transport autoPlay={false} kind="video" />)

    fireEvent.click(screen.getByRole('button', { name: 'Play video' }))
    expect(play).toHaveBeenCalledTimes(1)
    expect(pause).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Pause video' }))
    expect(pause).toHaveBeenCalledTimes(1)
    expect(play).toHaveBeenCalledTimes(1)
  })

  it('passes the presentation through to either element', () => {
    const { rerender } = render(
      <Media
        src="/media/shot.png"
        alt="A screenshot"
        kind="image"
        className="tile"
        draggable={false}
        data-checkered=""
      />
    )
    const image = screen.getByAltText('A screenshot')
    expect(image.className).toBe('tile')
    expect(image.getAttribute('draggable')).toBe('false')
    expect(image.hasAttribute('data-checkered')).toBe(true)

    rerender(
      <Media
        src="/media/demo.mp4"
        alt="A demo"
        kind="video"
        className="tile"
        draggable={false}
        data-checkered=""
      />
    )
    expect(video()?.className).toBe('tile')
    expect(video()?.getAttribute('draggable')).toBe('false')
    expect(video()?.hasAttribute('data-checkered')).toBe(true)
  })

  // The editor's block has no caret of its own, so the media element is the
  // tab stop — and which element that is, is what this component decides.
  it('passes the interaction contract through to either element', () => {
    const onFocus = vi.fn()
    const onBlur = vi.fn()
    const onKeyDown = vi.fn()
    const contract = { tabIndex: 0, onFocus, onBlur, onKeyDown, 'data-showcase-media': '' }

    const { rerender } = render(
      <Media src="/media/shot.png" alt="A screenshot" kind="image" {...contract} />
    )
    const image = screen.getByAltText('A screenshot')
    expect(image.tabIndex).toBe(0)
    expect(image.hasAttribute('data-showcase-media')).toBe(true)
    fireEvent.focus(image)
    fireEvent.keyDown(image, { key: 'Backspace' })
    fireEvent.blur(image)

    rerender(<Media src="/media/demo.mp4" alt="A demo" kind="video" {...contract} />)
    const clip = video() as HTMLVideoElement
    expect(clip.tabIndex).toBe(0)
    expect(clip.hasAttribute('data-showcase-media')).toBe(true)
    fireEvent.focus(clip)
    fireEvent.keyDown(clip, { key: 'Backspace' })
    fireEvent.blur(clip)

    expect(onFocus).toHaveBeenCalledTimes(2)
    expect(onKeyDown).toHaveBeenCalledTimes(2)
    expect(onBlur).toHaveBeenCalledTimes(2)
  })

  // -------------------------------------------------------------------------
  // The reserved box — held from the first paint at the shape the document
  // records, or the house ratio, and let go the instant the source can paint.
  // -------------------------------------------------------------------------

  it('holds a box at the house ratio for a picture whose shape is unrecorded', () => {
    render(<Media src="/media/shot.png" alt="A screenshot" kind="image" />)
    const image = screen.getByAltText('A screenshot')
    expect(image.hasAttribute('data-media-pending')).toBe(true)
    expect(image.style.aspectRatio).toBe(MEDIA_PLACEHOLDER_ASPECT)
  })

  it("holds the picture's OWN box when the document recorded one", () => {
    render(
      <Media src="/media/shot.png" alt="A screenshot" kind="image" width={1600} height={900} />
    )
    expect(screen.getByAltText('A screenshot').style.aspectRatio).toBe('1600 / 900')
  })

  it('lets the box go the moment the picture can paint', () => {
    render(<Media src="/media/shot.png" alt="A screenshot" kind="image" />)
    const image = screen.getByAltText('A screenshot')
    fireEvent.load(image)
    expect(image.hasAttribute('data-media-pending')).toBe(false)
    expect(image.style.aspectRatio).toBe('')
  })

  it('lets it go on a source that fails, too', () => {
    render(<Media src="/media/gone.png" alt="A screenshot" kind="image" />)
    const image = screen.getByAltText('A screenshot')
    fireEvent.error(image)
    expect(image.hasAttribute('data-media-pending')).toBe(false)
  })

  it('takes the box back when the source changes', () => {
    const { rerender } = render(<Media src="/media/one.png" alt="A screenshot" kind="image" />)
    fireEvent.load(screen.getByAltText('A screenshot'))
    rerender(<Media src="/media/two.png" alt="A screenshot" kind="image" />)
    expect(screen.getByAltText('A screenshot').hasAttribute('data-media-pending')).toBe(true)
  })

  it("holds a clip's box until it has a frame to show", () => {
    render(<Media src="/media/demo.mp4" alt="A demo" kind="video" />)
    const clip = video() as HTMLVideoElement
    expect(clip.hasAttribute('data-media-pending')).toBe(true)
    fireEvent.loadedData(clip)
    expect(clip.hasAttribute('data-media-pending')).toBe(false)
  })

  it('shows the stored still while a clip has no frame of its own', () => {
    render(<Media src="/media/demo.mp4" alt="A demo" kind="video" poster="/media/still.jpg" />)
    expect(video()?.getAttribute('poster')).toBe('/media/still.jpg')
  })
})
