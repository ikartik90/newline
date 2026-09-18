import { pickPosterFrame, posterSampleTimes, type FrameSample } from '@/utils/poster-frame'

// ---------------------------------------------------------------------------
// The still that stands in for a clip, taken in the renderer at upload.
//
// It has to be taken HERE, and that is not a preference. Decoding an mp4 needs
// a video decoder; the only one in reach is the one already inside the
// renderer that is holding the file — there is no ffmpeg in the main process
// and nothing the bucket will transform on the way out. The one moment a frame
// of a clip can be had for free is the moment somebody picks the file, when it
// is local and the browser is about to decode it anyway to measure it
// (`measure-media.ts`).
//
// The poster earns its place: a <video> with one paints its first frame
// immediately instead of after the clip has been fetched and seeked — which
// for a note that opens on a clip is a multi-megabyte download standing
// between the reader and a block that has anything in it.
//
// The DOM half is thin on purpose. Everything that decides anything is either
// in `poster-frame.ts` or in `choosePoster` below, both of which are written
// against a `ClipReader` rather than against a <video> — so the rule that picks
// the frame can be tested without a decoder, which is the only way it was ever
// going to be tested at all.
// ---------------------------------------------------------------------------

/** How wide a sampled frame is scored at. */
const SAMPLE_WIDTH = 64

/**
 * How wide the still is stored at.
 *
 * The surface that shows it is the note's own <video> poster, at most the
 * article column wide. 1280 covers that with a retina copy to spare, and caps
 * a 4K screen recording at a fraction of the bytes its own frame would be.
 */
const POSTER_MAX_WIDTH = 1280

/** JPEG, and at what quality — see `stillAt` for why not PNG. */
const POSTER_TYPE = 'image/jpeg'
const POSTER_QUALITY = 0.82

/**
 * How long any one decode is given. A local file seeks in a frame or two; this
 * is for the decoder that stalls, and the format that fires neither `seeked`
 * nor `error`.
 */
const STEP_TIMEOUT_MS = 4000

export interface PosterCapture {
  blob: Blob
  /** Where in the clip it came from, in seconds. */
  time: number
}

/**
 * A clip, asked only the two things choosing a poster needs of it.
 *
 * An interface rather than the <video> itself so the choice can be tested
 * against frames written by hand — see the file note.
 */
export interface ClipReader {
  /** Seconds, or a non-finite number for a clip that will not say. */
  duration: number
  /** RGBA bytes of a small frame at that time, for scoring. */
  sampleAt(time: number): Promise<Uint8ClampedArray>
  /** The full-size still at that time, encoded. */
  stillAt(time: number): Promise<Blob | null>
  close(): void
}

/**
 * The best frame in a clip, or `null` for one that will not give up any.
 *
 * NEVER THROWS. This runs inside an upload, and a poster is an optimisation on
 * top of a file that is going to be stored either way — a clip whose decoder
 * gives out is one that shows its own first frame, exactly as every clip
 * uploaded before this existed does. Failing the upload over it would trade a
 * missing still for a missing file.
 */
export async function choosePoster(reader: ClipReader): Promise<PosterCapture | null> {
  try {
    const samples: FrameSample[] = []
    for (const time of posterSampleTimes(reader.duration)) {
      // A frame that would not decode is DROPPED rather than scored. Handing
      // the picker an empty array for it would be a vote — "nothing in this
      // one" — cast by a frame nobody ever saw, and next to a clip whose real
      // frames are dark that vote can win.
      try {
        samples.push({ time, pixels: await reader.sampleAt(time) })
      } catch {
        continue
      }
    }

    const index = pickPosterFrame(samples)
    if (index === -1) return null

    const { time } = samples[index]
    const blob = await reader.stillAt(time)
    return blob ? { blob, time } : null
  } catch {
    return null
  } finally {
    reader.close()
  }
}

/** Settle on the first of two events, or on a timer — whichever comes. */
function settle(
  element: HTMLVideoElement,
  event: string,
  timeout = STEP_TIMEOUT_MS
): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (fail?: unknown) => {
      clearTimeout(timer)
      element.removeEventListener(event, ok)
      element.removeEventListener('error', no)
      if (fail) reject(fail)
      else resolve()
    }
    const ok = () => done()
    const no = () => done(new Error(`clip failed before ${event}`))
    const timer = setTimeout(no, timeout)
    element.addEventListener(event, ok, { once: true })
    element.addEventListener('error', no, { once: true })
  })
}

/**
 * Open a local clip for reading frames out of.
 *
 * `null` for anything that will not decode — which includes every codec the
 * renderer declines, and is the same "no poster, and the upload carries on"
 * the rest of this module is written for.
 */
export async function openClip(file: File): Promise<ClipReader | null> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.preload = 'auto'
  video.muted = true
  video.playsInline = true
  video.src = url

  const close = () => {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }

  try {
    await settle(video, 'loadedmetadata')
  } catch {
    close()
    return null
  }

  // `seeked` is not guaranteed to fire when the time asked for is the time
  // already shown, and a clip parks on 0 — so a sample at 0 would wait out the
  // whole timeout for an event that has already happened.
  const seek = async (time: number) => {
    if (Math.abs(video.currentTime - time) < 1e-3) return
    const seeked = settle(video, 'seeked')
    video.currentTime = time
    await seeked
  }

  const drawnAt = (width: number): HTMLCanvasElement => {
    const scale = Math.min(1, width / (video.videoWidth || width))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round((video.videoWidth || width) * scale))
    canvas.height = Math.max(1, Math.round((video.videoHeight || width) * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('no 2d context')
    context.drawImage(video, 0, 0, canvas.width, canvas.height)
    return canvas
  }

  return {
    duration: video.duration,
    async sampleAt(time) {
      await seek(time)
      const canvas = drawnAt(SAMPLE_WIDTH)
      return canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data
    },
    async stillAt(time) {
      await seek(time)
      const canvas = drawnAt(POSTER_MAX_WIDTH)
      // JPEG rather than PNG: an mp4 frame has no alpha to preserve and a
      // photographic PNG of a 1280px screen recording is several megabytes,
      // which is a poster heavier than some of the clips it stands in for.
      return new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, POSTER_TYPE, POSTER_QUALITY)
      )
    },
    close
  }
}

/** The still for a clip the reader has just picked, or `null`. */
export async function capturePoster(file: File): Promise<PosterCapture | null> {
  const reader = await openClip(file)
  return reader ? choosePoster(reader) : null
}
