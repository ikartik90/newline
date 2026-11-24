import { useCallback, useEffect, useRef, useState } from 'react'
import { mediaReservedAspect, type MediaKind } from '@shared/domain/media-node'

// ---------------------------------------------------------------------------
// Media — one source, shown with whichever element can show it.
//
// The library takes clips as well as pictures, and every surface that renders
// one — the note's block, the library's thumbnail and its preview — faces the
// same fork. It is settled here, once, and settled by `kind` rather than
// guessed from the filename: every caller holds a node or an upload that
// already states what it is.
//
// The two elements are interchangeable on purpose: same className, same box.
// A clip plays ITSELF — muted, looping, inline — with the browser's strip
// (`controls`) only where a clip is read.
// ---------------------------------------------------------------------------

/**
 * How far into a held clip to seek for a frame to show. Small enough to be the
 * opening image and large enough that browsers treat it as a real seek.
 */
const FIRST_FRAME_SEEK_S = 0.05

export interface MediaProps {
  src: string
  /** Describes the source. Empty means decorative, as it does on an `<img>`. */
  alt: string
  /** Which element to render with. Required: the src is never consulted. */
  kind: MediaKind
  className?: string
  /**
   * The source's own pixel size, when the document recorded it — the shape
   * the box is HELD at until the source can size itself. Only the ratio is
   * read.
   */
  width?: number
  height?: number
  /** Clips only — the still stored for this clip, shown until it has a frame. */
  poster?: string
  /** Clips only — the browser's own strip. */
  controls?: boolean
  /**
   * Clips only — does this one start itself? Withheld, not stopped: the clip
   * is never asked to play, so nothing flickers.
   */
  autoPlay?: boolean
}

/**
 * Has this element already got something on screen? The two answer it
 * differently and neither announces it once the moment has passed — a cached
 * picture arrives done.
 */
function hasSomethingToShow(node: HTMLElement | null): node is HTMLImageElement | HTMLVideoElement {
  if (node instanceof HTMLImageElement) {
    return node.complete && node.naturalWidth > 0
  }
  if (node instanceof HTMLVideoElement) {
    return node.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA
  }
  return false
}

export function Media({
  src,
  alt,
  kind,
  className,
  width,
  height,
  poster,
  controls,
  autoPlay = true
}: MediaProps) {
  // Which source has actually PAINTED — the src rather than a boolean, so
  // swapping the source takes the reserved box back with no effect to reset
  // it. Settled by the PROP, never `currentSrc`, which the browser resolves
  // to an absolute URL.
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null)
  const pending = paintedSrc !== src
  const settle = useCallback(() => setPaintedSrc(src), [src])

  // Settles a source that had ALREADY painted by the time the element reached
  // us — a cached picture is `complete` before React hears a `load`. The src
  // comes off the ATTRIBUTE so the callback's identity owes nothing to the
  // current render.
  const hold = useCallback((node: HTMLElement | null) => {
    if (hasSomethingToShow(node)) setPaintedSrc(node.getAttribute('src'))
  }, [])

  // Read through a ref so changing it never re-runs the ref callback below.
  const autoPlayRef = useRef(autoPlay)
  useEffect(() => {
    autoPlayRef.current = autoPlay
  }, [autoPlay])

  /**
   * Everything about a clip that cannot be said in markup. `muted` is set as
   * both property and attribute, then the play is asked for ourselves — the
   * autoplay policy declines an un-muted clip. Reduced motion is honoured
   * here because CSS cannot stop a video.
   */
  const startPlaying = useCallback(
    (node: HTMLVideoElement | null) => {
      hold(node)
      if (!node) return
      node.muted = true
      node.setAttribute('muted', '')

      if (!autoPlayRef.current) return
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        node.pause()
        return
      }
      // Rejects whenever the browser declines; the clip stays on its frame.
      void node.play()?.catch(() => {})
    },
    [hold]
  )

  // The box is held at the source's shape only while it has nothing to paint.
  const objectStyle = pending ? { aspectRatio: mediaReservedAspect({ width, height }) } : undefined

  if (kind !== 'video') {
    return (
      <img
        ref={hold}
        src={src}
        alt={alt}
        className={className}
        style={objectStyle}
        loading="lazy"
        // The box's own answer to "is there anything here yet".
        data-media-pending={pending ? '' : undefined}
        onLoad={settle}
        // A source that will never arrive is a FINISHED state, not a pending one.
        onError={settle}
      />
    )
  }

  return (
    <video
      ref={startPlaying}
      src={src}
      // A <video> has no `alt`. An empty one is left OFF: `aria-label=""` is
      // not a way to say "decorative", it is a broken label.
      aria-label={alt || undefined}
      className={className}
      style={objectStyle}
      controls={controls}
      autoPlay={autoPlay}
      loop
      muted
      playsInline
      poster={poster}
      preload="metadata"
      data-media-pending={pending ? '' : undefined}
      // `loadeddata`, not `loadedmetadata`: a <video> with no frame decoded
      // still paints nothing at all.
      onLoadedData={settle}
      onError={settle}
      onLoadedMetadata={(event) => {
        const node = event.currentTarget
        // A HELD clip has to be given something to show: `preload="metadata"`
        // fetches no frames, so seeking a hair past the start asks for the
        // first one. Not where a still is already painting.
        if (!poster && !autoPlayRef.current && node.currentTime === 0) {
          node.currentTime = Math.min(FIRST_FRAME_SEEK_S, node.duration || 0)
        }
      }}
    />
  )
}
