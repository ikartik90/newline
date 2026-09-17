import { describe, expect, it } from 'vitest'
import type { InlineNode } from '@shared/domain/nodes'
import {
  findLinkRangeAt,
  findSidenoteRangeAt,
  mergeAdjacentInlineNodes,
  normalizeLinkHref,
  rangeHasMark,
  transformMarksInRange
} from '../marks'

describe('mergeAdjacentInlineNodes', () => {
  it('merges consecutive nodes with identical marks', () => {
    const out = mergeAdjacentInlineNodes([
      { type: 'text', text: 'foo', marks: [{ type: 'bold' }] },
      { type: 'text', text: 'bar', marks: [{ type: 'bold' }] }
    ])
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('foobar')
  })

  it('treats mark order as irrelevant', () => {
    const out = mergeAdjacentInlineNodes([
      { type: 'text', text: 'a', marks: [{ type: 'bold' }, { type: 'italic' }] },
      { type: 'text', text: 'b', marks: [{ type: 'italic' }, { type: 'bold' }] }
    ])
    expect(out).toHaveLength(1)
  })

  it('keeps nodes with different marks separate and drops empties', () => {
    const out = mergeAdjacentInlineNodes([
      { type: 'text', text: 'a', marks: [{ type: 'bold' }] },
      { type: 'text', text: '' },
      { type: 'text', text: 'b' }
    ])
    expect(out.map((n) => n.text)).toEqual(['a', 'b'])
  })
})

describe('rangeHasMark', () => {
  const nodes: InlineNode[] = [
    { type: 'text', text: 'Hello ', marks: [{ type: 'bold' }] },
    { type: 'text', text: 'world', marks: [{ type: 'bold' }, { type: 'italic' }] }
  ]

  it('is true when every covered char carries the mark', () => {
    expect(rangeHasMark(nodes, 0, 11, 'bold')).toBe(true)
  })

  it('is false when part of the range lacks the mark', () => {
    expect(rangeHasMark(nodes, 0, 11, 'italic')).toBe(false)
  })

  it('is false for an empty (collapsed) range', () => {
    expect(rangeHasMark(nodes, 3, 3, 'bold')).toBe(false)
  })
})

describe('transformMarksInRange', () => {
  it('adds a mark across the range, splitting at boundaries', () => {
    const out = transformMarksInRange([{ type: 'text', text: 'abcdef' }], 2, 4, (marks) => [
      ...marks,
      { type: 'bold' }
    ])
    expect(out.map((n) => n.text)).toEqual(['ab', 'cd', 'ef'])
    expect(out[1].marks).toEqual([{ type: 'bold' }])
    expect(out[0].marks).toBeUndefined()
  })

  it('removes a mark and re-merges neighbouring plain text', () => {
    const out = transformMarksInRange(
      [
        { type: 'text', text: 'ab' },
        { type: 'text', text: 'cd', marks: [{ type: 'bold' }] },
        { type: 'text', text: 'ef' }
      ],
      2,
      4,
      (marks) => marks.filter((m) => m.type !== 'bold')
    )
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('abcdef')
    expect(out[0].marks).toBeUndefined()
  })

  it('returns nodes unchanged for a collapsed range', () => {
    const nodes: InlineNode[] = [{ type: 'text', text: 'abc' }]
    expect(transformMarksInRange(nodes, 1, 1, (m) => m)).toBe(nodes)
  })
})

describe('normalizeLinkHref', () => {
  it('prepends https:// to a bare host', () => {
    expect(normalizeLinkHref('google.com')).toBe('https://google.com')
    expect(normalizeLinkHref('sub.example.co.uk/path')).toBe('https://sub.example.co.uk/path')
  })

  it('prepends https:// to a bare host:port (dotted prefix is not a scheme)', () => {
    expect(normalizeLinkHref('google.com:8080')).toBe('https://google.com:8080')
  })

  it('leaves an explicit scheme untouched', () => {
    for (const url of [
      'http://google.com',
      'https://google.com',
      'mailto:a@b.com',
      'tel:+15551234',
      'ftp://host/file'
    ]) {
      expect(normalizeLinkHref(url)).toBe(url)
    }
  })

  it('leaves relative paths, fragments, queries and protocol-relative URLs untouched', () => {
    for (const url of ['/writing/x', '#section', '?q=1', '//cdn.example.com']) {
      expect(normalizeLinkHref(url)).toBe(url)
    }
  })

  it('trims surrounding whitespace before normalising', () => {
    expect(normalizeLinkHref('  google.com  ')).toBe('https://google.com')
  })
})

describe('findLinkRangeAt', () => {
  const nodes: InlineNode[] = [
    { type: 'text', text: 'see ' },
    { type: 'text', text: 'this link', marks: [{ type: 'link', href: 'https://example.com' }] },
    { type: 'text', text: ' now' }
  ]

  it("returns the link's bounds and href when the caret is inside it", () => {
    expect(findLinkRangeAt(nodes, 7)).toEqual({ start: 4, end: 13, href: 'https://example.com' })
  })

  it('returns null when the caret is outside any link', () => {
    expect(findLinkRangeAt(nodes, 1)).toBeNull()
  })

  it('expands across adjacent nodes sharing the same href', () => {
    const split: InlineNode[] = [
      { type: 'text', text: 'ab', marks: [{ type: 'link', href: 'https://x.io' }] },
      {
        type: 'text',
        text: 'cd',
        marks: [{ type: 'bold' }, { type: 'link', href: 'https://x.io' }]
      }
    ]
    expect(findLinkRangeAt(split, 3)).toEqual({ start: 0, end: 4, href: 'https://x.io' })
  })
})

describe('findSidenoteRangeAt', () => {
  const nodes: InlineNode[] = [
    { type: 'text', text: 'see ' },
    { type: 'text', text: 'the term', marks: [{ type: 'sidenote', id: 'n1', text: 'a note' }] },
    { type: 'text', text: ' end' }
  ]

  it("returns the note's bounds and id when the caret is inside it", () => {
    expect(findSidenoteRangeAt(nodes, 7)).toEqual({ start: 4, end: 12, id: 'n1' })
  })

  it('counts the boundaries as inside', () => {
    expect(findSidenoteRangeAt(nodes, 4)).not.toBeNull()
    expect(findSidenoteRangeAt(nodes, 12)).not.toBeNull()
  })

  it('returns null outside any sidenote', () => {
    expect(findSidenoteRangeAt(nodes, 1)).toBeNull()
    expect(findSidenoteRangeAt(nodes, 14)).toBeNull()
  })

  it('expands across adjacent nodes sharing the same id', () => {
    const split: InlineNode[] = [
      { type: 'text', text: 'ab', marks: [{ type: 'sidenote', id: 's', text: '' }] },
      {
        type: 'text',
        text: 'cd',
        marks: [{ type: 'bold' }, { type: 'sidenote', id: 's', text: '' }]
      }
    ]
    expect(findSidenoteRangeAt(split, 3)).toEqual({ start: 0, end: 4, id: 's' })
  })

  it('does not merge two adjacent notes with different ids', () => {
    const two: InlineNode[] = [
      { type: 'text', text: 'a', marks: [{ type: 'sidenote', id: 'x', text: '' }] },
      { type: 'text', text: 'b', marks: [{ type: 'sidenote', id: 'y', text: '' }] }
    ]
    expect(findSidenoteRangeAt(two, 0)).toEqual({ start: 0, end: 1, id: 'x' })
    expect(findSidenoteRangeAt(two, 2)).toEqual({ start: 1, end: 2, id: 'y' })
  })
})
