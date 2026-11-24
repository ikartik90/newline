// ---------------------------------------------------------------------------
// Sidenotes: what the editor's numbering and the layer of cards share.
//
// A sidenote's visible number is not stored: it is the order the note first
// appears in, so one put in before another renumbers every one after it.
// ---------------------------------------------------------------------------

export interface SidenoteEntry {
  /** Stable id shared by every run of this note (from the mark). */
  id: string
  /** Index of the block the annotation lives in. */
  blockIndex: number
  /** 1-based ordinal in document order. */
  number: number
  /** Note body shown in the aside card. */
  text: string
  /** CSS anchor-name the annotation exposes and the card positions against. */
  anchorName: string
}

/** CSS dashed-ident anchor name for a sidenote id (sanitised to ident-safe chars). */
export function sidenoteAnchorName(id: string): string {
  return `--sn-${id.replace(/[^a-zA-Z0-9_-]/g, '')}`
}

/**
 * The id of a sidenote new to a note that holds `ids`: `sn-` and one past the
 * highest number among them, as the MDX reader numbers the ones it reads.
 */
export function nextSidenoteId(ids: Iterable<string>): string {
  let highest = 0
  for (const id of ids) {
    const number = /^sn-(\d+)$/.exec(id)
    if (number) highest = Math.max(highest, Number(number[1]))
  }
  return `sn-${highest + 1}`
}
