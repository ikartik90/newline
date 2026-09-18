import { describe, expect, it } from 'vitest'
import type { InlineNode } from '@shared/domain/nodes'
import {
  domToInlineNodes,
  inlineNodesToHtml,
  renumberSidenoteSups,
  sanitiseClipboardHtml,
  stripEmptySidenoteWrappers
} from '../inline-html'

describe('inlineNodesToHtml', () => {
  it('renders plain text', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: 'hello' }])).toBe('hello')
  })

  it('wraps bold text in <strong>', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: 'bold', marks: [{ type: 'bold' }] }])).toBe(
      '<strong>bold</strong>'
    )
  })

  it('wraps italic text in <em>', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: 'italic', marks: [{ type: 'italic' }] }])).toBe(
      '<em>italic</em>'
    )
  })

  it('wraps code text in <code>', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: 'fn()', marks: [{ type: 'code' }] }])).toBe(
      '<code class="inline-code">fn()</code>'
    )
  })

  it('wraps underline and strikethrough', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: 'u', marks: [{ type: 'underline' }] }])).toBe(
      '<u class="article-underline">u</u>'
    )
    expect(
      inlineNodesToHtml([{ type: 'text', text: 's', marks: [{ type: 'strikethrough' }] }])
    ).toBe('<s class="article-strikethrough">s</s>')
  })

  it('wraps a link in an anchor carrying its href', () => {
    expect(
      inlineNodesToHtml([
        { type: 'text', text: 'go', marks: [{ type: 'link', href: 'https://example.com' }] }
      ])
    ).toBe('<a href="https://example.com" class="article-link">go</a>')
  })

  it('wraps highlighted text in <mark>', () => {
    expect(
      inlineNodesToHtml([{ type: 'text', text: 'note', marks: [{ type: 'highlight' }] }])
    ).toBe('<mark class="article-highlight">note</mark>')
  })

  it('coalesces a styled sub-span within a highlight into a single <mark>', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'hello ', marks: [{ type: 'highlight' }] },
      { type: 'text', text: 'world', marks: [{ type: 'highlight' }, { type: 'italic' }] }
    ]
    expect(inlineNodesToHtml(nodes)).toBe(
      '<mark class="article-highlight">hello <em>world</em></mark>'
    )
  })

  it('extracts highlight as the outer wrapper regardless of mark order', () => {
    expect(
      inlineNodesToHtml([
        { type: 'text', text: 'x', marks: [{ type: 'italic' }, { type: 'highlight' }] }
      ])
    ).toBe('<mark class="article-highlight"><em>x</em></mark>')
  })

  it('keeps non-adjacent highlights in separate marks', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'a', marks: [{ type: 'highlight' }] },
      { type: 'text', text: 'b' },
      { type: 'text', text: 'c', marks: [{ type: 'highlight' }] }
    ]
    expect(inlineNodesToHtml(nodes)).toBe(
      '<mark class="article-highlight">a</mark>b<mark class="article-highlight">c</mark>'
    )
  })

  it('escapes HTML entities in text', () => {
    expect(inlineNodesToHtml([{ type: 'text', text: '<script>&' }])).toBe('&lt;script&gt;&amp;')
  })

  it('concatenates multiple nodes', () => {
    expect(
      inlineNodesToHtml([
        { type: 'text', text: 'hello ' },
        { type: 'text', text: 'world', marks: [{ type: 'bold' }] }
      ])
    ).toBe('hello <strong>world</strong>')
  })

  it('returns empty string for empty array', () => {
    expect(inlineNodesToHtml([])).toBe('')
  })

  it('wraps a sidenote run in a dotted span with an anchor-name and a numbered superscript', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'term', marks: [{ type: 'sidenote', id: 'abc', text: 'a note' }] }
    ]
    expect(inlineNodesToHtml(nodes)).toBe(
      '<span class="article-sidenote" data-sidenote-id="abc"' +
        ' data-sidenote-text="a note" style="anchor-name:--sn-abc">' +
        '<span class="article-sidenote-text">term</span>' +
        '<sup class="article-sidenote-ref" contenteditable="false" aria-hidden="true"' +
        ' data-sidenote-number="1"></sup></span>'
    )
  })

  it('offsets note ordinals by the block base and increments within the block', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'a', marks: [{ type: 'sidenote', id: 'x', text: '' }] },
      { type: 'text', text: ' and ' },
      { type: 'text', text: 'b', marks: [{ type: 'sidenote', id: 'y', text: '' }] }
    ]
    const html = inlineNodesToHtml(nodes, 4)
    expect(html).toContain('data-sidenote-id="x"')
    expect(html.match(/data-sidenote-number="(\d+)"/g)).toEqual([
      'data-sidenote-number="5"',
      'data-sidenote-number="6"'
    ])
  })

  it('coalesces contiguous runs of one sidenote into a single span', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'hello ', marks: [{ type: 'sidenote', id: 'x', text: 'n' }] },
      {
        type: 'text',
        text: 'world',
        marks: [{ type: 'sidenote', id: 'x', text: 'n' }, { type: 'bold' }]
      }
    ]
    const html = inlineNodesToHtml(nodes)
    expect(html).toContain('<span class="article-sidenote" data-sidenote-id="x"')
    expect(html.match(/<sup/g)?.length).toBe(1)
    expect(html).toContain('hello <strong>world</strong>')
  })

  it('keeps two adjacent sidenotes with different ids in separate spans', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'a', marks: [{ type: 'sidenote', id: '1', text: 'one' }] },
      { type: 'text', text: 'b', marks: [{ type: 'sidenote', id: '2', text: 'two' }] }
    ]
    expect(inlineNodesToHtml(nodes).match(/<sup/g)?.length).toBe(2)
  })

  it('escapes the note text in the data attribute', () => {
    const nodes: InlineNode[] = [
      {
        type: 'text',
        text: 't',
        marks: [{ type: 'sidenote', id: 'i', text: 'a "quoted" & <tag>' }]
      }
    ]
    expect(inlineNodesToHtml(nodes)).toContain(
      'data-sidenote-text="a &quot;quoted&quot; &amp; &lt;tag&gt;"'
    )
  })
})

describe('domToInlineNodes', () => {
  function parse(html: string): InlineNode[] {
    const div = document.createElement('div')
    div.innerHTML = html
    return domToInlineNodes(div)
  }

  it('extracts a plain text node', () => {
    expect(parse('hello')).toEqual([{ type: 'text', text: 'hello' }])
  })

  it('extracts bold from <strong> and <b>', () => {
    expect(parse('<strong>bold</strong>')).toEqual([
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }
    ])
    expect(parse('<b>bold</b>')).toEqual([
      { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }
    ])
  })

  it('extracts italic, code, underline, strikethrough and highlight', () => {
    expect(parse('<em>i</em>')).toEqual([{ type: 'text', text: 'i', marks: [{ type: 'italic' }] }])
    expect(parse('<code>c</code>')).toEqual([
      { type: 'text', text: 'c', marks: [{ type: 'code' }] }
    ])
    expect(parse('<u>u</u>')).toEqual([{ type: 'text', text: 'u', marks: [{ type: 'underline' }] }])
    expect(parse('<s>s</s>')).toEqual([
      { type: 'text', text: 's', marks: [{ type: 'strikethrough' }] }
    ])
    expect(parse('<mark>m</mark>')).toEqual([
      { type: 'text', text: 'm', marks: [{ type: 'highlight' }] }
    ])
  })

  it('reads a link off the raw href attribute, never the resolved URL', () => {
    expect(parse('<a href="https://x.io">go</a>')).toEqual([
      { type: 'text', text: 'go', marks: [{ type: 'link', href: 'https://x.io' }] }
    ])
  })

  it('extracts nested marks', () => {
    expect(parse('<strong><em>both</em></strong>')).toEqual([
      {
        type: 'text',
        text: 'both',
        marks: expect.arrayContaining([{ type: 'bold' }, { type: 'italic' }])
      }
    ])
  })

  it('returns empty array for empty element', () => {
    expect(parse('')).toEqual([])
  })

  it('ignores BR tags', () => {
    expect(parse('hello<br>world')).toEqual([
      { type: 'text', text: 'hello' },
      { type: 'text', text: 'world' }
    ])
  })

  it('extracts a sidenote (id + text) from its wrapper span and drops the <sup>', () => {
    expect(
      parse(
        '<span data-sidenote-id="abc" data-sidenote-text="a note">term' +
          '<sup class="article-sidenote-ref" contenteditable="false"></sup></span>'
      )
    ).toEqual([
      { type: 'text', text: 'term', marks: [{ type: 'sidenote', id: 'abc', text: 'a note' }] }
    ])
  })

  it('round-trips a sidenote through inlineNodesToHtml → domToInlineNodes', () => {
    const nodes: InlineNode[] = [
      { type: 'text', text: 'before ' },
      {
        type: 'text',
        text: 'annotated',
        marks: [{ type: 'sidenote', id: 'n1', text: 'the note' }]
      },
      { type: 'text', text: ' after' }
    ]
    expect(parse(inlineNodesToHtml(nodes))).toEqual(nodes)
  })

  it('round-trips a multi-paragraph sidenote (paragraph breaks are newlines)', () => {
    const nodes: InlineNode[] = [
      {
        type: 'text',
        text: 'annotated',
        marks: [{ type: 'sidenote', id: 'n1', text: 'first\nsecond' }]
      }
    ]
    expect(parse(inlineNodesToHtml(nodes))).toEqual(nodes)
  })
})

describe('stripEmptySidenoteWrappers', () => {
  function make(html: string): HTMLElement {
    const div = document.createElement('div')
    div.innerHTML = html
    return div
  }

  const annotated = (id: string, text: string) =>
    `<span class="article-sidenote" data-sidenote-id="${id}" data-sidenote-text="n">${text}` +
    `<sup class="article-sidenote-ref" contenteditable="false"></sup></span>`

  it('removes a sidenote wrapper left empty by deleting its text (with its <sup>)', () => {
    const el = make(`a ${annotated('x', '')} b`)
    expect(el.querySelectorAll('[data-sidenote-id]').length).toBe(1)
    expect(stripEmptySidenoteWrappers(el)).toBe(true)
    expect(el.querySelectorAll('[data-sidenote-id]').length).toBe(0)
    expect(el.querySelectorAll('sup').length).toBe(0)
    expect(el.textContent).toBe('a  b')
  })

  it('keeps wrappers that still have annotated text, and reports no change', () => {
    const el = make(`a ${annotated('x', 'kept')} b`)
    expect(stripEmptySidenoteWrappers(el)).toBe(false)
    expect(el.querySelector('[data-sidenote-id]')?.textContent).toBe('kept')
  })

  it('removes only the emptied note when others remain', () => {
    const el = make(`${annotated('a', '')} then ${annotated('b', 'second')}`)
    stripEmptySidenoteWrappers(el)
    const remaining = el.querySelectorAll('[data-sidenote-id]')
    expect(remaining.length).toBe(1)
    expect(remaining[0].getAttribute('data-sidenote-id')).toBe('b')
    expect(el.querySelectorAll('sup').length).toBe(1)
  })
})

describe('renumberSidenoteSups', () => {
  function make(html: string): HTMLElement {
    const div = document.createElement('div')
    div.innerHTML = html
    return div
  }
  const annotated = (id: string, text: string) =>
    `<span class="article-sidenote" data-sidenote-id="${id}">${text}` +
    `<sup class="article-sidenote-ref"></sup></span>`

  const numbers = (el: HTMLElement) =>
    Array.from(el.querySelectorAll('.article-sidenote-ref')).map((s) =>
      s.getAttribute('data-sidenote-number')
    )

  it("numbers a block's superscripts from base + 1 in DOM order", () => {
    const el = make(`${annotated('a', 'x')} and ${annotated('b', 'y')}`)
    renumberSidenoteSups(el, 3)
    expect(numbers(el)).toEqual(['4', '5'])
  })

  it('re-numbers after a note is removed so later ones decrement', () => {
    const el = make(`${annotated('a', 'x')} ${annotated('b', 'y')} ${annotated('c', 'z')}`)
    el.querySelector('[data-sidenote-id="a"]')!.remove()
    renumberSidenoteSups(el, 0)
    expect(numbers(el)).toEqual(['1', '2'])
  })
})

describe('sanitiseClipboardHtml', () => {
  it('keeps semantic inline marks and drops their attributes', () => {
    expect(
      sanitiseClipboardHtml('<b style="color:red">a</b> <i class="x">b</i> <code>c</code>')
    ).toBe('<strong>a</strong> <em>b</em> <code class="inline-code">c</code>')
  })

  it('collapses block elements to line breaks and drops the trailing one', () => {
    expect(sanitiseClipboardHtml('<p>one</p><div>two</div>')).toBe('one<br>two')
  })

  it('unwraps links and unknown wrappers, keeping their text', () => {
    expect(sanitiseClipboardHtml('<span><a href="https://x">go</a></span>')).toBe('go')
  })

  it('escapes text content', () => {
    expect(sanitiseClipboardHtml('a &lt; b')).toBe('a &lt; b')
  })
})
