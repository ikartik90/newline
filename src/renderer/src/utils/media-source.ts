// ---------------------------------------------------------------------------
// What KIND of thing a media src points at — guessed from its name.
//
// A media node records whether it is a picture or a clip as `kind`
// (`MediaNodeSchema`), carried there from the upload's content type, and
// nothing renders off a filename any more: `Media` takes a required `kind`
// and does not look at the src at all, precisely so that a caller cannot fall
// back into guessing by forgetting to pass it.
//
// `sourceExtension` has one remaining caller worth stating: `formatCanCarryAlpha`
// in `image-transparency`. That function asks whether a picture's format could
// carry an alpha channel — is this a JPEG, or something that might be
// see-through — which is a question about a file already known to be a
// picture. It is NOT a picture-vs-clip test: the grid filters on the item's
// `kind` before asking, and the two questions stay separate.
//
// Neither is a reason to reach for this in new code. Anywhere a media node or
// an upload is in hand, its own word is the answer and this is the wrong
// question.
// ---------------------------------------------------------------------------

/** The extensions rendered as a `<video>`; everything else is a picture. */
const VIDEO_EXTENSIONS = ['mp4']

/**
 * The lowercase extension of a src, or `""` for one without — a bare object
 * key, or a data URL. Reads past the query and hash a CDN url may carry.
 */
export function sourceExtension(src: string): string {
  const path = src.split(/[?#]/, 1)[0]
  const file = path.slice(path.lastIndexOf('/') + 1)
  const dot = file.lastIndexOf('.')
  return dot === -1 ? '' : file.slice(dot + 1).toLowerCase()
}

/**
 * Whether this src should be played rather than shown.
 *
 * Biased towards NO: an unrecognised source renders as a picture, which is
 * what every src written before videos were accepted actually is. A wrong
 * guess this way shows a broken image; the other way would silently turn every
 * extensionless legacy key into an empty video element.
 */
export function isVideoSource(src: string): boolean {
  return VIDEO_EXTENSIONS.includes(sourceExtension(src))
}
