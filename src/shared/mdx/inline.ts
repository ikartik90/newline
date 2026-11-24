import type { StyleColor } from './dialect'

// ---------------------------------------------------------------------------
// A run of text as the MDX holds it, and what every reader and writer of it
// agrees on: the order marks nest in, and which of them a line break can
// stand inside.
// ---------------------------------------------------------------------------

/** A mark a run can wear. A sidenote's `id` names its run; `text` is what the note says. */
export type RunMark =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'code' }
  | { type: 'underline' }
  | { type: 'strikethrough' }
  | { type: 'highlight' }
  | { type: 'link'; href: string }
  | { type: 'sidenote'; id: string; text: string }
  | { type: 'color'; color: StyleColor }

/** Text under one set of marks. */
export interface Run {
  type: 'text'
  text: string
  marks?: RunMark[]
}

/** Outermost first. Code is last: a code span holds text alone. */
export const MARK_ORDER: RunMark['type'][] = [
  'sidenote',
  'link',
  'color',
  'highlight',
  'underline',
  'strikethrough',
  'bold',
  'italic',
  'code'
]

/**
 * The marks written with signs that must touch a word (`**`, `*`, `~~`, a
 * backtick): a line break cannot stand at their edge, so it is written
 * outside them. The others are tags and links, which hold a break as they
 * hold anything.
 */
const SIGNED = new Set<RunMark['type']>(['strikethrough', 'bold', 'italic', 'code'])

export const BREAK = '\n'

const rank = (mark: RunMark): number => MARK_ORDER.indexOf(mark.type)

/** Marks in the order they nest, so two runs marked alike compare alike. */
export function orderMarks(marks: RunMark[]): RunMark[] {
  return [...marks].sort((a, b) => rank(a) - rank(b))
}

export function run(text: string, marks: RunMark[]): Run {
  return marks.length ? { type: 'text', text, marks: orderMarks(marks) } : { type: 'text', text }
}

const sameMarks = (a: Run, b: Run): boolean =>
  JSON.stringify(a.marks ?? []) === JSON.stringify(b.marks ?? [])

/** Adjacent runs wearing the same marks become one; empty runs vanish. */
export function mergeRuns(runs: Run[]): Run[] {
  const out: Run[] = []
  for (const each of runs) {
    if (!each.text) continue
    const last = out.at(-1)
    if (last && sameMarks(last, each)) last.text += each.text
    else out.push(run(each.text, each.marks ?? []))
  }
  return out
}

/** Runs with every line break one of its own. */
export function splitBreaks(runs: Run[]): Run[] {
  return runs.flatMap((each) =>
    each.text
      .split(/(\n)/)
      .filter(Boolean)
      .map((part) => run(part, each.marks ?? []))
  )
}

/** The marks a line break is written inside: the tags and the link, never a sign. */
export function breakMarks(marks: RunMark[]): RunMark[] {
  return marks.filter((mark) => !SIGNED.has(mark.type))
}

/**
 * Runs as they read back: a line break wears a signed mark only where the
 * words either side of it both do, since it was written outside the signs.
 */
export function settleBreaks(runs: Run[]): Run[] {
  const pieces = splitBreaks(runs)
  const worded = (from: number, step: number): Run | undefined => {
    for (let at = from + step; at >= 0 && at < pieces.length; at += step) {
      if (pieces[at].text !== BREAK) return pieces[at]
    }
    return undefined
  }
  const settled = pieces.map((piece, index) => {
    if (piece.text !== BREAK) return piece
    const before = worded(index, -1)?.marks ?? []
    const after = worded(index, 1)?.marks ?? []
    const shared = before.filter(
      (mark) => SIGNED.has(mark.type) && after.some((other) => other.type === mark.type)
    )
    return run(BREAK, [...breakMarks(piece.marks ?? []), ...shared])
  })
  return mergeRuns(settled)
}
