import { DOMParser, DOMSerializer } from 'prosemirror-model'
import { describe, expect, it } from 'vitest'
import { NOTES } from '@shared/mdx/__tests__/support/corpus'
import { mdxToProse } from '../mdx-to-prose'
import { proseToMdx } from '../prose-to-mdx'
import { noteSchema } from '../schema'

/** A node as JSON, less the attributes left at their defaults. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function said(node: any): any {
  const specs = noteSchema.nodes[node.type]?.spec.attrs ?? {}
  const attrs = Object.fromEntries(
    Object.entries(node.attrs ?? {}).filter(([name, value]) => value !== specs[name]?.default)
  )
  return {
    type: node.type,
    ...(node.text ? { text: node.text } : {}),
    ...(node.marks ? { marks: node.marks } : {}),
    ...(Object.keys(attrs).length ? { attrs } : {}),
    ...(node.content ? { content: node.content.map(said) } : {})
  }
}
const read = (...rows: string[]) => mdxToProse(rows.join('\n')).toJSON().content.map(said)
const lines = (...rows: string[]): string => rows.join('\n') + '\n'
const text = (value: string, ...marks: object[]) =>
  marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value }
const p = (...content: object[]) =>
  content.length ? { type: 'paragraph', content } : { type: 'paragraph' }

describe('the note schema', () => {
  it('holds the blocks and the marks of the dialect, and no eyebrow, metric or caption', () => {
    expect(Object.keys(noteSchema.nodes).sort()).toEqual(
      [
        'blockquote',
        'bullet_list',
        'code_block',
        'doc',
        'hard_break',
        'heading',
        'horizontal_rule',
        'list_item',
        'media',
        'ordered_list',
        'paragraph',
        'text'
      ].sort()
    )
    expect(Object.keys(noteSchema.marks).sort()).toEqual(
      [
        'code',
        'em',
        'highlight',
        'link',
        'sidenote',
        'strikethrough',
        'strong',
        'text_style',
        'underline'
      ].sort()
    )
  })
})

describe('mdxToProse', () => {
  it('reads no text as one empty paragraph', () => {
    expect(read('')).toEqual([p()])
  })

  it('reads paragraphs, and a no-break space alone as an empty one', () => {
    expect(read('One', '', '&nbsp;', '', 'Two')).toEqual([p(text('One')), p(), p(text('Two'))])
  })

  it('reads the four heading levels, a deeper one as the fourth', () => {
    expect(read('# One', '', '#### Four', '', '###### Six')).toEqual([
      { type: 'heading', attrs: { level: 1 }, content: [text('One')] },
      { type: 'heading', attrs: { level: 4 }, content: [text('Four')] },
      { type: 'heading', attrs: { level: 4 }, content: [text('Six')] }
    ])
  })

  it("reads a style tag as its block's own size, colour, centring and indent", () => {
    expect(read('<BlockStyle size="sm" color="highlight">', '  Small', '</BlockStyle>')).toEqual([
      { type: 'paragraph', attrs: { size: 'sm', color: 'highlight' }, content: [text('Small')] }
    ])
    expect(read('<BlockStyle color="highlight" indent>', '  ### Large', '</BlockStyle>')).toEqual([
      {
        type: 'heading',
        attrs: { level: 3, color: 'highlight', indent: true },
        content: [text('Large')]
      }
    ])
    expect(read('<BlockStyle size="lg" align="center" />')).toEqual([
      { type: 'paragraph', attrs: { size: 'lg', align: 'center' } }
    ])
  })

  it('reads and writes a block set to the right, and reads a side it does not know as none', () => {
    const right = lines('<BlockStyle align="right">', '  Signed', '</BlockStyle>')
    expect(read(right)).toEqual([
      { type: 'paragraph', attrs: { align: 'right' }, content: [text('Signed')] }
    ])
    expect(proseToMdx(mdxToProse(right))).toBe(right)
    expect(read('<BlockStyle align="justify">', '  Words', '</BlockStyle>')).toEqual([
      p(text('Words'))
    ])
  })

  it('reads a quote as the blocks it holds', () => {
    expect(read('> Quoted', '>', '> Someone', '>', '> - a point')).toEqual([
      {
        type: 'blockquote',
        content: [
          p(text('Quoted')),
          p(text('Someone')),
          { type: 'bullet_list', content: [{ type: 'list_item', content: [p(text('a point'))] }] }
        ]
      }
    ])
  })

  it('reads lists as lists, one inside another', () => {
    expect(read('3. Three', '   - Under', '4. Four', '', '   Also four')).toEqual([
      {
        type: 'ordered_list',
        attrs: { start: 3 },
        content: [
          {
            type: 'list_item',
            content: [
              p(text('Three')),
              { type: 'bullet_list', content: [{ type: 'list_item', content: [p(text('Under'))] }] }
            ]
          },
          { type: 'list_item', content: [p(text('Four')), p(text('Also four'))] }
        ]
      }
    ])
  })

  it('reads a task as an item that is open or done, in a list of either kind', () => {
    const item = (checked: boolean | null, ...content: object[]) =>
      checked === null
        ? { type: 'list_item', content }
        : { type: 'list_item', attrs: { checked }, content }
    expect(read('- [ ] Open', '- [x] Done', '- Plain')).toEqual([
      {
        type: 'bullet_list',
        content: [
          item(false, p(text('Open'))),
          item(true, p(text('Done'))),
          item(null, p(text('Plain')))
        ]
      }
    ])
    expect(read('1. [X] Done', '2. Plain')).toEqual([
      {
        type: 'ordered_list',
        content: [item(true, p(text('Done'))), item(null, p(text('Plain')))]
      }
    ])
    // What stands under a task is its own, as under any item.
    expect(read('- [ ] Open', '', '  Under it')).toEqual([
      { type: 'bullet_list', content: [item(false, p(text('Open')), p(text('Under it')))] }
    ])
    // A box anywhere but at the head of an item's own line is words.
    expect(read('[ ] Not in a list', '', '- Words [x] here')).toEqual([
      p(text('[ ] Not in a list')),
      { type: 'bullet_list', content: [item(null, p(text('Words [x] here')))] }
    ])
  })

  it('reads code, a rule and a picture', () => {
    expect(
      read(
        '```ts',
        'const a = 1',
        '```',
        '',
        '---',
        '',
        '![A hill](https://example.com/a.png "At dawn")'
      )
    ).toEqual([
      { type: 'code_block', attrs: { language: 'typescript' }, content: [text('const a = 1')] },
      { type: 'horizontal_rule' },
      {
        type: 'media',
        attrs: { src: 'https://example.com/a.png', alt: 'A hill', caption: 'At dawn' }
      }
    ])
  })

  it('stands a picture met among words on a line of its own', () => {
    expect(read('Before ![x](https://example.com/a.png) after')).toEqual([
      p(text('Before')),
      { type: 'media', attrs: { src: 'https://example.com/a.png', alt: 'x' } },
      p(text('after'))
    ])
  })

  it('reads every mark, a colour among them', () => {
    expect(
      read(
        '**b** *i* `c` ~~s~~ [l](https://example.com/) <u>u</u> <mark>h</mark> <TextStyle color="danger">red</TextStyle> <Sidenote note="Beside">run</Sidenote>'
      )
    ).toEqual([
      p(
        text('b', { type: 'strong' }),
        text(' '),
        text('i', { type: 'em' }),
        text(' '),
        text('c', { type: 'code' }),
        text(' '),
        text('s', { type: 'strikethrough' }),
        text(' '),
        text('l', { type: 'link', attrs: { href: 'https://example.com/' } }),
        text(' '),
        text('u', { type: 'underline' }),
        text(' '),
        text('h', { type: 'highlight' }),
        text(' '),
        text('red', { type: 'text_style', attrs: { color: 'danger' } }),
        text(' '),
        text('run', { type: 'sidenote', attrs: { id: 'sn-1', note: 'Beside' } })
      )
    ])
  })

  it('reads a line break as a break of its own', () => {
    expect(read('one\\', 'two')).toEqual([p(text('one'), { type: 'hard_break' }, text('two'))])
  })

  it('makes a note of any text at all', () => {
    for (const source of [
      '<',
      '<u>',
      'a </b> c',
      '<BlockStyle size=',
      '> <BlockStyle size="sm">',
      '1. <u>'
    ]) {
      expect(() => mdxToProse(source).check(), source).not.toThrow()
    }
  })
})

// A footnote is a sidenote: read from markdown, its words go beside the word
// its marker followed, and it is written as the sidenote it now is.
describe('a footnote', () => {
  const note = (id: string, words: string) => ({ type: 'sidenote', attrs: { id, note: words } })
  const through = (...rows: string[]): string => proseToMdx(mdxToProse(rows.join('\n')))

  it('is read as a sidenote on the word before its marker', () => {
    expect(read('Some claim[^1] here.', '', '[^1]: The source.')).toEqual([
      p(text('Some '), text('claim', note('sn-1', 'The source.')), text(' here.'))
    ])
    expect(through('Some claim[^1] here.', '', '[^1]: The source.')).toBe(
      lines('Some <Sidenote note="The source.">claim</Sidenote> here.')
    )
  })

  it('takes the word before the space its marker stood after, and leaves no space behind', () => {
    expect(through('A claim. [^why] More.', '', '[^why]: Because.')).toBe(
      lines('A <Sidenote note="Because.">claim.</Sidenote> More.')
    )
    expect(through('The last word. [^end]', '', '[^end]: Done.')).toBe(
      lines('The last <Sidenote note="Done.">word.</Sidenote>')
    )
  })

  it('keeps the marks of the word it is on', () => {
    expect(read('A **bold claim**[^1].', '', '[^1]: Noted.')).toEqual([
      p(
        text('A '),
        text('bold ', { type: 'strong' }),
        text('claim', note('sn-1', 'Noted.'), { type: 'strong' }),
        text('.')
      )
    ])
  })

  it('says its note as plain words, however it was written', () => {
    expect(
      through(
        'Word[^n]',
        '',
        '[^n]: A **strong** and [linked](https://example.com) note.',
        '',
        '    Its second line.'
      )
    ).toBe(lines('<Sidenote note="A strong and linked note. Its second line.">Word</Sidenote>'))
  })

  it('reads every marker of one footnote as a sidenote of its own', () => {
    expect(read('One[^a] and two[^a].', '', '[^a]: Shared.')).toEqual([
      p(
        text('One', note('sn-1', 'Shared.')),
        text(' and '),
        text('two', note('sn-2', 'Shared.')),
        text('.')
      )
    ])
  })

  it('puts two footnotes on one word into one sidenote', () => {
    expect(through('Word[^a][^b] on.', '', '[^a]: First.', '', '[^b]: Second.')).toBe(
      lines('<Sidenote note="First. Second.">Word</Sidenote> on.')
    )
  })

  it('stands a marker with no word before it on its own name', () => {
    expect(through('[^1] opens the line.', '', '[^1]: Early.')).toBe(
      lines('<Sidenote note="Early.">1</Sidenote> opens the line.')
    )
  })

  it('leaves a marker with no footnote as the words it is', () => {
    expect(through('Odd[^9] words.')).toBe(lines('Odd\\[^9] words.'))
  })

  it('keeps the words of a footnote nothing points at', () => {
    expect(through('Words.', '', '[^lost]: Kept all the same.')).toBe(
      lines('Words.', '', 'Kept all the same.')
    )
  })
})

// An address written bare is a link to it, as it is anywhere markdown is read.
describe('a bare address', () => {
  const link = (href: string) => ({ type: 'link', attrs: { href } })
  const through = (...rows: string[]): string => proseToMdx(mdxToProse(rows.join('\n')))

  it('is read as a link to itself', () => {
    expect(read('See https://example.com/a now.')).toEqual([
      p(text('See '), text('https://example.com/a', link('https://example.com/a')), text(' now.'))
    ])
    expect(through('See https://example.com/a now.')).toBe(
      lines('See [https://example.com/a](https://example.com/a) now.')
    )
  })

  it('leaves the full stop that ends its sentence out of it', () => {
    expect(read('It is at https://example.com.')).toEqual([
      p(text('It is at '), text('https://example.com', link('https://example.com')), text('.'))
    ])
  })

  it('reads an address that opens with www as one too', () => {
    expect(read('www.example.com')).toEqual([
      p(text('www.example.com', link('http://www.example.com')))
    ])
  })

  it('is not read inside code, or inside a link that says something else', () => {
    expect(read('`https://example.com`')).toEqual([
      p(text('https://example.com', { type: 'code' }))
    ])
    expect(read('[https://a.example](https://b.example/)')).toEqual([
      p(text('https://a.example', link('https://b.example/')))
    ])
  })

  it('stays words where its link was taken off, there and back', () => {
    const plain = noteSchema.nodeFromJSON({
      type: 'doc',
      content: [p(text('Not a link: https://example.com and www.example.com here.'))]
    })
    const written = proseToMdx(plain)
    expect(mdxToProse(written).toJSON().content.map(said)).toEqual([
      p(text('Not a link: https://example.com and www.example.com here.'))
    ])
  })
})

describe('proseToMdx', () => {
  const write = (...content: object[]) =>
    proseToMdx(noteSchema.nodeFromJSON({ type: 'doc', content }))

  it('writes an empty note as one empty line', () => {
    expect(write(p())).toBe(lines('&nbsp;'))
  })

  it("writes a block's style as the tag around it, and none where it has none", () => {
    expect(
      write({ type: 'paragraph', attrs: { size: 'lg', color: 'muted' }, content: [text('Large')] })
    ).toBe(lines('<BlockStyle size="lg" color="muted">', '  Large', '</BlockStyle>'))
    expect(write(p(text('Plain')))).toBe(lines('Plain'))
  })

  it('writes a colour around its run', () => {
    expect(
      write(p(text('a '), text('red', { type: 'text_style', attrs: { color: 'danger' } })))
    ).toBe(lines('a <TextStyle color="danger">red</TextStyle>'))
  })

  describe('a task', () => {
    const task = (checked: boolean | null, ...content: object[]) => ({
      type: 'list_item',
      attrs: { checked },
      content
    })
    const bullets = (...content: object[]) => ({ type: 'bullet_list', content })
    const back = (text: string) => proseToMdx(mdxToProse(text))

    it('writes its box before its words, ticked where it is done', () => {
      expect(
        write(
          bullets(
            task(false, p(text('Open'))),
            task(true, p(text('Done'))),
            task(null, p(text('Plain')))
          )
        )
      ).toBe(lines('- [ ] Open', '- [x] Done', '- Plain'))
      expect(
        write({
          type: 'ordered_list',
          attrs: { start: 1 },
          content: [task(true, p(text('Done')))]
        })
      ).toBe(lines('1. [x] Done'))
    })

    it('writes one read as it was, with what stands under it', () => {
      for (const source of [
        lines('- [ ] Open', '- [x] Done', '- Plain'),
        lines('- [x] Done', '', '  Under it', '', '- [ ] Next'),
        lines('- [ ] Outer', '', '  - [x] Inner'),
        lines('1. [ ] One', '2. [x] Two'),
        lines('- [ ] **Bold** and a [link](https://example.com/)')
      ]) {
        expect(back(source), source).toBe(source)
      }
    })

    // A box needs something after it to be read as one.
    it('keeps a task that holds nothing yet', () => {
      const empty = write(bullets(task(false, p())))
      expect(empty).toBe(lines('- [ ] &#x20;'))
      expect(read(empty)).toEqual([
        {
          type: 'bullet_list',
          content: [{ type: 'list_item', attrs: { checked: false }, content: [p()] }]
        }
      ])
      expect(back(empty)).toBe(empty)
    })

    // The box opens the item's own line, so the line's style goes inside it.
    it('keeps the style of its own line, written inside the line', () => {
      const styled = write(
        bullets(
          task(true, {
            type: 'paragraph',
            attrs: { size: 'lg', align: 'right' },
            content: [text('Big')]
          })
        )
      )
      expect(styled).toBe(lines('- [x] <BlockStyle size="lg" align="right">Big</BlockStyle>'))
      expect(read(styled)).toEqual([
        {
          type: 'bullet_list',
          content: [
            {
              type: 'list_item',
              attrs: { checked: true },
              content: [
                { type: 'paragraph', attrs: { size: 'lg', align: 'right' }, content: [text('Big')] }
              ]
            }
          ]
        }
      ])
      expect(back(styled)).toBe(styled)
    })

    it('keeps words that open with a box as words', () => {
      const words = write(bullets(task(null, p(text('[ ] not a task')))))
      expect(words).toBe(lines('- \\[ ] not a task'))
      expect(back(words)).toBe(words)
    })

    it('comes back a task from a copy of it, and from a page that draws one', () => {
      const made = noteSchema.nodeFromJSON(
        bullets(task(true, p(text('Done'))), task(false, p(text('Open'))))
      )
      const copied = document.createElement('div')
      copied.append(DOMSerializer.fromSchema(noteSchema).serializeNode(made))
      const pasted = DOMParser.fromSchema(noteSchema).parse(copied)
      expect(proseToMdx(pasted)).toBe(lines('- [x] Done', '- [ ] Open'))

      const page = document.createElement('div')
      page.innerHTML =
        '<ul><li><input type="checkbox" checked> Done</li><li><input type="checkbox"> Open</li><li>Plain</li></ul>'
      expect(proseToMdx(DOMParser.fromSchema(noteSchema).parse(page))).toBe(
        lines('- [x] Done', '- [ ] Open', '- Plain')
      )
    })
  })

  it('writes a list inside a list and blocks inside a quote', () => {
    const item = (...content: object[]) => ({ type: 'list_item', content })
    expect(
      write(
        {
          type: 'bullet_list',
          content: [
            item(p(text('One')), {
              type: 'ordered_list',
              attrs: { start: 1 },
              content: [item(p(text('Under')))]
            }),
            item(p(text('Two')))
          ]
        },
        {
          type: 'blockquote',
          content: [
            { type: 'heading', attrs: { level: 3 }, content: [text('Said')] },
            p(text('Words'))
          ]
        }
      )
    ).toBe(lines('- One', '', '  1. Under', '', '- Two', '', '> ### Said', '>', '> Words'))
  })
})

describe('MDX through ProseMirror and back', () => {
  // The editor has four heading levels: a deeper one is written as the fourth.
  const asEdited = (mdx: string): string => mdx.replace(/^#{5,6}(?= |$)/gm, '####')

  for (const [name, mdx] of Object.entries(NOTES)) {
    it(`writes ${name} as it was read`, () => {
      // A note holds a paragraph at least.
      const want = mdx === '' ? lines('&nbsp;') : asEdited(mdx)
      expect(proseToMdx(mdxToProse(mdx))).toBe(want)
    })
  }

  it('keeps what only the new format can hold', () => {
    const mdx = lines(
      '<BlockStyle size="lg" color="warning" align="center" indent>',
      '  A large, centred, coloured line',
      '</BlockStyle>',
      '',
      'Words in <TextStyle color="success">green **and bold**</TextStyle> and <TextStyle color="muted">grey</TextStyle>.',
      '',
      '- One',
      '',
      '  1. Under one',
      '',
      '     > quoted under it',
      '',
      '  2. Also under',
      '',
      '- Two',
      '',
      '> ## A heading in a quote',
      '>',
      '> - a list in a quote',
      '>',
      '> ```css',
      '> a { b: c }',
      '> ```'
    )
    expect(proseToMdx(mdxToProse(mdx))).toBe(mdx)
  })
})
