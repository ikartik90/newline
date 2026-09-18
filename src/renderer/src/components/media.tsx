import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FocusEventHandler,
  type KeyboardEventHandler
} from 'react'
import { MediaTransport } from '@/components/media-transport'
import {
  mediaBoxStyle,
  mediaFrameStyle,
  mediaObjectStyle,
  mediaReservationStyle,
  type MediaKind,
  type MediaLayout
} from '@shared/domain/nodes'

// ---------------------------------------------------------------------------
// Media — one source, shown with whichever element can show it.
//
// The library takes clips as well as pictures, and every surface that renders
// one — the editor's block, the lightbox, the library's preview, a link card's
// cover — faces the same fork. It is settled here, once, and settled by `kind`
// rather than guessed from the filename: every caller holds a node or an
// upload that already states what it is, so there is no fallback to forget
// into.
//
// The two elements are interchangeable on purpose: same className, same box,
// same `object-fit`, and one `onMeasure` in place of `naturalWidth` and
// `videoWidth`. A clip plays ITSELF — muted, looping, inline — with either the
// browser's strip (`controls`, where a clip is read) or the house chip
// (`transport`, where it is looked at), and neither by default.
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
  style?: CSSProperties
  /**
   * How the picture sits in its box — fit, inset, corner. Takes TWO elements
   * (a frame for the inset, the object for fit and corner); both collapse to
   * `display: contents` when there is nothing to apply.
   */
  layout?: MediaLayout
  /**
   * The source's own pixel size, when the document recorded it — the shape
   * the box is HELD at until the source can size itself. Only the ratio is
   * read.
   */
  width?: number
  height?: number
  draggable?: boolean
  /** Pictures only — a clip decides its own fetching through `preload`. */
  loading?: 'lazy' | 'eager'
  /** Clips only — the still stored for this clip, shown until it has a frame. */
  poster?: string
  /** Clips only — the browser's own strip. */
  controls?: boolean
  /**
   * Clips only — ONE play/pause chip in the corner of the surface. Absolute
   * against the surface's own positioned box, so nothing in the media's
   * layout moves when it is turned on.
   */
  transport?: boolean
  /**
   * Clips only — does this one start itself? Withheld, not stopped: the clip
   * is never asked to play, so nothing flickers and the transport can start
   * it on request.
   */
  autoPlay?: boolean
  /** The checkerboard hook for a see-through picture. */
  'data-checkered'?: string
  /**
   * The surface's own interaction contract, handed through untouched to
   * whichever element the fork produced. The editor's media block is
   * FOCUSABLE, and the element itself is its tab stop.
   */
  tabIndex?: number
  onFocus?: FocusEventHandler<HTMLElement>
  onBlur?: FocusEventHandler<HTMLElement>
  onKeyDown?: KeyboardEventHandler<HTMLElement>
  /** The editor's block-focus hook; see `tabIndex` above. */
  'data-showcase-media'?: string
  /** The source's intrinsic size once it is known — both dimensions, one callback. */
  onMeasure?: (width: number, height: number) => void
  /**
   * The element itself, for a caller that has to MEASURE what it came out at.
   * A callback so the caller can hold it in state; must be stable, or a clip
   * is torn down and stood back up on every render and loses its playhead.
   */
  elementRef?: (node: HTMLElement | null) => void
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
  style,
  layout,
  width,
  height,
  draggable,
  loading = 'lazy',
  poster,
  controls,
  transport,
  autoPlay = true,
  onMeasure,
  elementRef,
  tabIndex,
  onFocus,
  onBlur,
  onKeyDown,
  'data-checkered': checkered,
  'data-showcase-media': showcaseMedia
}: MediaProps) {
  // The element as STATE rather than a ref, because the transport has to
  // re-render when it arrives — and arrive again it does, since the lightbox
  // keys its clip by index.
  const [clip, setClip] = useState<HTMLVideoElement | null>(null)

  // Which source has actually PAINTED — the src rather than a boolean, so
  // swapping the source takes the reserved box back with no effect to reset
  // it. Settled by the PROP, never `currentSrc`, which the browser resolves
  // to an absolute URL.
  const [paintedSrc, setPaintedSrc] = useState<string | null>(null)
  const pending = paintedSrc !== src
  const settle = useCallback(() => setPaintedSrc(src), [src])

  // The caller's ref, which takes whichever element this turned out to be. It
  // also settles a source that had ALREADY painted by the time the element
  // reached us — a cached picture is `complete` before React hears a `load`.
  // The src comes off the ATTRIBUTE so the callback's identity owes nothing
  // to the current render.
  const hold = useCallback(
    (node: HTMLElement | null) => {
      if (hasSomethingToShow(node)) setPaintedSrc(node.getAttribute('src'))
      elementRef?.(node)
    },
    [elementRef]
  )

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
      setClip(node)
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

  // The caller's own style wins. The reservation sits between the two, only
  // while the source has nothing to paint.
  const objectStyle = {
    ...(layout ? mediaObjectStyle(layout) : {}),
    ...(pending ? mediaReservationStyle({ width, height }, layout) : {}),
    ...style
  }

  const isClip = kind === 'video'

  const element = !isClip ? (
    <img
      ref={hold}
      src={src}
      alt={alt}
      className={className}
      style={objectStyle}
      draggable={draggable}
      loading={loading}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      data-checkered={checkered}
      data-showcase-media={showcaseMedia}
      // The box's own answer to "is there anything here yet".
      data-media-pending={pending ? '' : undefined}
      onLoad={(event) => {
        settle()
        onMeasure?.(event.currentTarget.naturalWidth, event.currentTarget.naturalHeight)
      }}
      // A source that will never arrive is a FINISHED state, not a pending one.
      onError={settle}
    />
  ) : (
    <video
      ref={startPlaying}
      src={src}
      // A <video> has no `alt`. An empty one is left OFF: `aria-label=""` is
      // not a way to say "decorative", it is a broken label.
      aria-label={alt || undefined}
      className={className}
      style={objectStyle}
      draggable={draggable}
      controls={controls}
      autoPlay={autoPlay}
      loop
      muted
      playsInline
      poster={poster}
      preload="metadata"
      tabIndex={tabIndex}
      onFocus={onFocus}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      data-checkered={checkered}
      data-showcase-media={showcaseMedia}
      data-media-pending={pending ? '' : undefined}
      // `loadeddata`, not `loadedmetadata`: a <video> with no frame decoded
      // still paints nothing at all.
      onLoadedData={settle}
      onError={settle}
      onLoadedMetadata={(event) => {
        const node = event.currentTarget
        onMeasure?.(node.videoWidth, node.videoHeight)
        // A HELD clip has to be given something to show: `preload="metadata"`
        // fetches no frames, so seeking a hair past the start asks for the
        // first one. Not where a still is already painting.
        if (!poster && !autoPlayRef.current && node.currentTime === 0) {
          node.currentTime = Math.min(FIRST_FRAME_SEEK_S, node.duration || 0)
        }
      }}
    />
  )

  // Two boxes: the OUTER is the query container the corner is a share of, so
  // it spans the full width; the inset lives on the INNER one. Both collapse
  // to `display: contents` when there is nothing to apply.
  const media = !layout ? (
    element
  ) : (
    <span data-media-frame="" style={mediaFrameStyle(layout)}>
      <span data-media-box="" style={mediaBoxStyle(layout)}>
        {element}
      </span>
    </span>
  )

  // A picture has nothing to play, so a transport over one is a no-op rather
  // than a dead button.
  if (!transport || !isClip) return media

  // A SIBLING of the media, never a box around it — the chip is out of flow
  // and pins itself to the surface's corner.
  return (
    <>
      {media}
      <MediaTransport clip={clip} />
    </>
  )
}
