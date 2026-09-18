import type { InlineNode, Mark } from '@shared/domain/nodes'

// ---------------------------------------------------------------------------
// Mark manipulation over an inline-node array — pure, exported for tests
// ---------------------------------------------------------------------------

/** Order-independent structural equality for two mark arrays. */
function marksEqual(a: Mark[] | undefined, b: Mark[] | undefined): boolean {
  const aa = a ?? []
  const bb = b ?? []
  if (aa.length !== bb.length) return false
  const key = (m: Mark) => JSON.stringify(m)
  const sa = aa.map(key).sort()
  const sb = bb.map(key).sort()
  return sa.every((v, i) => v === sb[i])
}

/** Merge consecutive text nodes that carry identical marks. */
export function mergeAdjacentInlineNodes(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    if (node.text.length === 0) continue
    const prev = out[out.length - 1]
    if (prev && marksEqual(prev.marks, node.marks)) {
      out[out.length - 1] = { ...prev, text: prev.text + node.text }
    } else {
      out.push(node)
    }
  }
  return out
}

/**
 * True when every character in [start, end) already carries a mark of `type`.
 * Returns false for an empty range or when no covered text exists.
 */
export function rangeHasMark(
  nodes: InlineNode[],
  start: number,
  end: number,
  type: Mark['type']
): boolean {
  if (start >= end) return false
  let offset = 0
  let sawCovered = false
  for (const node of nodes) {
    const len = node.text.length
    const nodeStart = offset
    const nodeEnd = offset + len
    offset = nodeEnd
    if (len === 0 || nodeEnd <= start || nodeStart >= end) continue
    sawCovered = true
    if (!(node.marks ?? []).some((m) => m.type === type)) return false
  }
  return sawCovered
}

/**
 * Apply `transform` to the marks of every character in [start, end), splitting
 * nodes at the range boundaries. Returns a normalised inline-node array.
 */
export function transformMarksInRange(
  nodes: InlineNode[],
  start: number,
  end: number,
  transform: (marks: Mark[]) => Mark[]
): InlineNode[] {
  if (start >= end) return nodes
  const result: InlineNode[] = []
  let offset = 0
  for (const node of nodes) {
    const len = node.text.length
    const nodeStart = offset
    const nodeEnd = offset + len
    offset = nodeEnd
    if (len === 0) continue
    if (nodeEnd <= start || nodeStart >= end) {
      result.push(node)
      continue
    }
    const marks = node.marks ?? []
    const covStart = Math.max(start, nodeStart) - nodeStart
    const covEnd = Math.min(end, nodeEnd) - nodeStart
    if (covStart > 0) {
      result.push({
        type: 'text',
        text: node.text.slice(0, covStart),
        ...(marks.length ? { marks } : {})
      })
    }
    const nextMarks = transform(marks)
    result.push({
      type: 'text',
      text: node.text.slice(covStart, covEnd),
      ...(nextMarks.length ? { marks: nextMarks } : {})
    })
    if (covEnd < len) {
      result.push({
        type: 'text',
        text: node.text.slice(covEnd),
        ...(marks.length ? { marks } : {})
      })
    }
  }
  return mergeAdjacentInlineNodes(result)
}

/**
 * Normalise a user-typed link target. A bare host ("google.com") gets an
 * implicit "https://" so it is not treated as a page-relative path. An
 * explicit scheme, a root-relative path, a fragment, a query, or a
 * protocol-relative URL is left untouched. A "host:port" still gets
 * "https://" — its dotted prefix marks it as a host, not a scheme.
 */
export function normalizeLinkHref(raw: string): string {
  const href = raw.trim()
  if (!href) return href
  if (/^(\/|#|\?)/.test(href)) return href
  const scheme = href.match(/^([a-z][a-z0-9+.-]*):/i)
  if (scheme && !scheme[1].includes('.')) return href
  return `https://${href}`
}

/** Per-node [start, end) bounds plus one property read off its marks. */
function boundsWith<T>(
  nodes: InlineNode[],
  read: (node: InlineNode) => T | null
): Array<{ start: number; end: number; value: T | null }> {
  let pos = 0
  return nodes.map((node) => {
    const start = pos
    pos += node.text.length
    return { start, end: pos, value: read(node) }
  })
}

/** Expand from the node at `hitIndex` over neighbours sharing its value. */
function expandRun<T>(
  bounds: Array<{ start: number; end: number; value: T | null }>,
  hitIndex: number
): { start: number; end: number; value: T } {
  const value = bounds[hitIndex].value as T
  let start = bounds[hitIndex].start
  let end = bounds[hitIndex].end
  for (let i = hitIndex - 1; i >= 0 && bounds[i].value === value; i--) start = bounds[i].start
  for (let i = hitIndex + 1; i < bounds.length && bounds[i].value === value; i++)
    end = bounds[i].end
  return { start, end, value }
}

/**
 * Locate the contiguous run of link-marked text surrounding character
 * `offset`. Endpoints count as inside. Null when `offset` is not in a link.
 */
export function findLinkRangeAt(
  nodes: InlineNode[],
  offset: number
): { start: number; end: number; href: string } | null {
  const bounds = boundsWith(nodes, (node) => {
    const link = (node.marks ?? []).find((m) => m.type === 'link')
    return link?.type === 'link' ? link.href : null
  })
  const hitIndex = bounds.findIndex((b) => b.value !== null && offset >= b.start && offset <= b.end)
  if (hitIndex === -1) return null
  const { start, end, value } = expandRun(bounds, hitIndex)
  return { start, end, href: value }
}

/**
 * Locate the contiguous run of one sidenote surrounding character `offset`.
 * Mirrors `findLinkRangeAt`.
 */
export function findSidenoteRangeAt(
  nodes: InlineNode[],
  offset: number
): { start: number; end: number; id: string } | null {
  const bounds = boundsWith(nodes, (node) => {
    const mark = (node.marks ?? []).find((m) => m.type === 'sidenote')
    return mark?.type === 'sidenote' ? mark.id : null
  })
  const hitIndex = bounds.findIndex((b) => b.value !== null && offset >= b.start && offset <= b.end)
  if (hitIndex === -1) return null
  const { start, end, value } = expandRun(bounds, hitIndex)
  return { start, end, id: value }
}
