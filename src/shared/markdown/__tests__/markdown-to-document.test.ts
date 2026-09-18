import { describe, expect, it } from 'vitest'
import { DocumentSchema, EMPTY_DOCUMENT, serializeDocument } from '../../domain/document'
import { bodyToDocument, looksLikeDocumentJson, markdownToDocument } from '../markdown-to-document'

const text = (t: string, marks?: unknown[]) =>
  marks ? { type: 'text', text: t, marks } : { type: 'text', text: t }

describe('markdownToDocument', () => {
  it('turns empty or whitespace markdown into the empty document', () => {
    expect(markdownToDocument('')).toEqual(EMPTY_DOCUMENT)
    expect(markdownToDocument('   \n\n  ')).toEqual(EMPTY_DOCUMENT)
  })

  it('maps headings and paragraphs', () => {
    expect(markdownToDocument('# Title\n\nSome text').content).toEqual([
      { type: 'heading', level: 1, children: [text('Title')] },
      { type: 'paragraph', children: [text('Some text')] }
    ])
  })

  it('maps inline marks', () => {
    const [para] = markdownToDocument(
      'a **bold** *em* `code` ~~del~~ [link](https://x.com)'
    ).content
    expect(para).toEqual({
      type: 'paragraph',
      children: [
        text('a '),
        text('bold', [{ type: 'bold' }]),
        text(' '),
        text('em', [{ type: 'italic' }]),
        text(' '),
        text('code', [{ type: 'code' }]),
        text(' '),
        text('del', [{ type: 'strikethrough' }]),
        text(' '),
        text('link', [{ type: 'link', href: 'https://x.com' }])
      ]
    })
  })

  it('nests marks and merges adjacent runs with the same marks', () => {
    const [para] = markdownToDocument('***both*** plain \\* escaped').content
    expect(para).toEqual({
      type: 'paragraph',
      children: [text('both', [{ type: 'italic' }, { type: 'bold' }]), text(' plain * escaped')]
    })
  })

  it('drops the link mark when the href is not an absolute URL', () => {
    const [para] = markdownToDocument('see [here](/relative) and [there](https://ok.io)').content
    expect(para).toEqual({
      type: 'paragraph',
      children: [text('see here and '), text('there', [{ type: 'link', href: 'https://ok.io' }])]
    })
  })

  it('keeps hashtags as plain text', () => {
    expect(markdownToDocument('tagged #work').content).toEqual([
      { type: 'paragraph', children: [text('tagged #work')] }
    ])
  })

  it('turns a hard break into a newline in the text', () => {
    expect(markdownToDocument('one  \ntwo').content).toEqual([
      { type: 'paragraph', children: [text('one\ntwo')] }
    ])
  })

  it('turns a lone image into a media block, keeping local sources', () => {
    expect(markdownToDocument('![A cat](local://abc.png)').content).toEqual([
      { type: 'media', kind: 'image', src: 'local://abc.png', alt: 'A cat' }
    ])
  })

  it('reads a clip by its extension and omits an empty alt', () => {
    expect(markdownToDocument('![](https://cdn.io/clip.MP4?x=1)').content).toEqual([
      { type: 'media', kind: 'video', src: 'https://cdn.io/clip.MP4?x=1' }
    ])
  })

  it('splits images out of a paragraph that also holds text', () => {
    expect(markdownToDocument('before ![p](https://c.io/a.png) after').content).toEqual([
      { type: 'paragraph', children: [text('before')] },
      { type: 'media', kind: 'image', src: 'https://c.io/a.png', alt: 'p' },
      { type: 'paragraph', children: [text('after')] }
    ])
  })

  it('flattens a blockquote to one inline run', () => {
    expect(markdownToDocument('> quoted **bold**\n>\n> second').content).toEqual([
      {
        type: 'blockquote',
        children: [text('quoted '), text('bold', [{ type: 'bold' }]), text(' second')]
      }
    ])
  })

  it('maps ordered lists to a run of list items, with a start above one', () => {
    expect(markdownToDocument('3. three\n4. four').content).toEqual([
      { type: 'list_item', children: [text('three')], start: 3 },
      { type: 'list_item', children: [text('four')] }
    ])
    expect(markdownToDocument('1. one\n2. two').content).toEqual([
      { type: 'list_item', children: [text('one')] },
      { type: 'list_item', children: [text('two')] }
    ])
  })

  it('maps bullets and task items', () => {
    expect(markdownToDocument('- [x] done\n- [ ] todo\n- plain **b**').content).toEqual([
      { type: 'bullet_list_item', children: [text('done')], marker: 'check' },
      { type: 'bullet_list_item', children: [text('todo')] },
      { type: 'bullet_list_item', children: [text('plain '), text('b', [{ type: 'bold' }])] }
    ])
  })

  it('flattens nested lists into the run', () => {
    expect(markdownToDocument('- a\n  - a1\n  - a2\n- b').content).toEqual([
      { type: 'bullet_list_item', children: [text('a')] },
      { type: 'bullet_list_item', children: [text('a1')] },
      { type: 'bullet_list_item', children: [text('a2')] },
      { type: 'bullet_list_item', children: [text('b')] }
    ])
  })

  it('keeps a loose list item to one block', () => {
    expect(markdownToDocument('- one\n\n- two\n\n  more').content).toEqual([
      { type: 'bullet_list_item', children: [text('one')] },
      { type: 'bullet_list_item', children: [text('two more')] }
    ])
  })

  it('maps fenced code with a known language, aliases included', () => {
    expect(markdownToDocument('```ts\nconst x = 1\n```').content).toEqual([
      { type: 'code_block', language: 'typescript', children: [text('const x = 1')] }
    ])
    expect(markdownToDocument('```js\nlet y\n```').content).toEqual([
      { type: 'code_block', language: 'javascript', children: [text('let y')] }
    ])
  })

  it('drops a language it does not know, and reads indented code', () => {
    expect(markdownToDocument('```python\nprint(1)\n```').content).toEqual([
      { type: 'code_block', children: [text('print(1)')] }
    ])
    expect(markdownToDocument('    indented\n    code').content).toEqual([
      { type: 'code_block', children: [text('indented\ncode')] }
    ])
  })

  it('maps a rule, and holds html and tables as raw text', () => {
    expect(markdownToDocument('---').content).toEqual([{ type: 'horizontal_rule' }])
    expect(markdownToDocument('<div>hi</div>').content).toEqual([
      { type: 'paragraph', children: [text('<div>hi</div>')] }
    ])
    expect(markdownToDocument('| a | b |\n|---|---|\n| 1 | 2 |').content).toEqual([
      { type: 'paragraph', children: [text('| a | b |\n|---|---|\n| 1 | 2 |')] }
    ])
  })

  it('trims trailing empty paragraphs', () => {
    const doc = markdownToDocument('text\n\n&nbsp;\n\n\u00a0\n\n')
    expect(doc.content.at(-1)).toEqual({ type: 'paragraph', children: [text('text')] })
  })

  it('always produces a document the schema accepts', () => {
    const sample = [
      '# H',
      '###### deep',
      'para with [l](https://a.b) and ![i](local://x.png) mixed',
      '> q',
      '1. a\n   - b',
      '- [x] c',
      '```html\n<p>\n```',
      '---',
      '<span>x</span>',
      '| t |\n|---|\n| r |'
    ].join('\n\n')
    expect(() => DocumentSchema.parse(markdownToDocument(sample))).not.toThrow()
  })
})

describe('looksLikeDocumentJson', () => {
  it('is true for a serialised document only', () => {
    expect(looksLikeDocumentJson(serializeDocument(EMPTY_DOCUMENT))).toBe(true)
    expect(looksLikeDocumentJson('')).toBe(false)
    expect(looksLikeDocumentJson('# markdown')).toBe(false)
    expect(looksLikeDocumentJson('{"type":"doc"}')).toBe(false)
    expect(looksLikeDocumentJson('{"type":"doc","content":[{"type":"nope"}]}')).toBe(false)
  })
})

describe('bodyToDocument', () => {
  it('parses a JSON body and converts anything else as markdown', () => {
    const doc = { type: 'doc', content: [{ type: 'heading', level: 2, children: [text('J')] }] }
    expect(bodyToDocument(JSON.stringify(doc))).toEqual(doc)
    expect(bodyToDocument('## M').content).toEqual([
      { type: 'heading', level: 2, children: [text('M')] }
    ])
    expect(bodyToDocument('')).toEqual(EMPTY_DOCUMENT)
  })
})
