import type { Heading } from 'mdast'
import { describe, expect, it } from 'vitest'
import { mdxDestination, writeMdx } from '../dialect'
import type { Run, RunMark } from '../inline'
import { dress, writeInline, writeParagraph } from '../writing'
import { lines } from './support/corpus'

const text = (value: string, ...marks: RunMark[]): Run =>
  marks.length ? { type: 'text', text: value, marks } : { type: 'text', text: value }

/** Runs as the paragraph a note writes them as. */
const written = (...runs: Run[]): string =>
  writeMdx({ type: 'root', children: [dress(writeParagraph(runs), {})] })

describe('a run of words, written', () => {
  it('writes bold, italic, code, strikethrough and a link in markdown', () => {
    expect(
      written(
        text('b', { type: 'bold' }),
        text(' '),
        text('i', { type: 'italic' }),
        text(' '),
        text('c', { type: 'code' }),
        text(' '),
        text('s', { type: 'strikethrough' }),
        text(' '),
        text('l', { type: 'link', href: 'https://example.com/' })
      )
    ).toBe(lines('**b** *i* `c` ~~s~~ [l](https://example.com/)'))
  })

  it('writes underline, highlight and a colour as their tags', () => {
    expect(
      written(
        text('u', { type: 'underline' }),
        text(' '),
        text('h', { type: 'highlight' }),
        text(' '),
        text('c', { type: 'color', color: 'danger' })
      )
    ).toBe(lines('<u>u</u> <mark>h</mark> <TextStyle color="danger">c</TextStyle>'))
  })

  it('writes a sidenote around its run, the note an attribute', () => {
    expect(
      written(text('See '), text('here', { type: 'sidenote', id: 'sn-1', text: 'A "margin" note' }))
    ).toBe(lines('See <Sidenote note="A &#x22;margin&#x22; note">here</Sidenote>'))
  })

  // An ampersand would read back as an entity, a line break would cut a heading short.
  it("writes out what a note's attribute cannot hold as it is", () => {
    const heading: Heading = {
      type: 'heading',
      depth: 2,
      children: writeInline(
        [text('x', { type: 'sidenote', id: 'sn-1', text: 'AT&amp;T\nnext line' })],
        false
      )
    }
    expect(writeMdx({ type: 'root', children: [heading] })).toBe(
      lines('## <Sidenote note="AT&#x26;amp;T&#xA;next line">x</Sidenote>')
    )
  })

  it('keeps one sidenote around runs marked differently inside it', () => {
    const note: RunMark = { type: 'sidenote', id: 'sn-1', text: 'Note' }
    expect(written(text('plain ', note), text('bold', note, { type: 'bold' }))).toBe(
      lines('<Sidenote note="Note">plain **bold**</Sidenote>')
    )
  })

  // Italic inside bold is written with the other sign, so the two stay apart.
  it('nests marks in one fixed order', () => {
    expect(written(text('x', { type: 'italic' }, { type: 'bold' }, { type: 'underline' }))).toBe(
      lines('<u>**_x_**</u>')
    )
  })

  // A sign must touch a word: a space at its edge is written outside it.
  it('writes a space at the edge of bold or italic outside the signs', () => {
    expect(written(text('an item'), text(' bold', { type: 'bold' }))).toBe(
      lines('an item **bold**')
    )
    expect(written(text('some '), text('slanted ', { type: 'italic' }), text('words'))).toBe(
      lines('some *slanted* words')
    )
    expect(written(text('two words', { type: 'bold' }))).toBe(lines('**two words**'))
  })

  it('writes a line break inside a block as a hard break', () => {
    expect(written(text('one\ntwo'))).toBe(lines('one\\', 'two'))
  })

  // A hard break cannot end a paragraph, so a newline at either end is written out.
  it('keeps a line break at the end of a block', () => {
    expect(written(text('one\n'))).toBe(lines('one&#xA;'))
  })

  it('escapes what markdown or a tag would read as syntax', () => {
    expect(written(text('*not bold* <not a tag> {not code}'))).toBe(
      lines('\\*not bold\\* \\<not a tag> \\{not code}')
    )
    expect(written(text('# not a heading'))).toBe(lines('\\# not a heading'))
    expect(written(text('[ ] not a task, [^1] not a footnote'))).toBe(
      lines('\\[ ] not a task, \\[^1] not a footnote')
    )
  })

  it('writes a paragraph that holds nothing as a line of its own', () => {
    expect(written()).toBe(lines('&nbsp;'))
  })

  it("writes a block's style as the tag around it", () => {
    expect(
      writeMdx({
        type: 'root',
        children: [
          dress(writeParagraph([text('Words')]), { size: 'lg', color: 'muted', align: 'right' }),
          dress(null, { indent: true })
        ]
      })
    ).toBe(
      lines(
        '<BlockStyle size="lg" color="muted" align="right">',
        '  Words',
        '</BlockStyle>',
        '',
        '<BlockStyle indent />'
      )
    )
  })
})

// Main points a note at a picture's new address by replacing the address in
// the note's text, so it must know how the text spells one.
describe('mdxDestination', () => {
  const picture = (url: string, title: string | null = null): string =>
    writeMdx({
      type: 'root',
      children: [{ type: 'paragraph', children: [{ type: 'image', url, alt: '', title }] }]
    })

  it('is the address itself where markdown has nothing to escape in it', () => {
    for (const url of [
      'local://0f8fad5b-d9cb-469f-a165-70867728950e-My-Photo.png',
      'https://api.example.com/m/u/user_1/media/0f8fad5b-My_Photo+1.png'
    ]) {
      expect(mdxDestination(url)).toBe(url)
    }
  })

  it('escapes the brackets a file name may hold', () => {
    expect(mdxDestination('local://0f8fad5b-Shot-(2).png')).toBe(
      'local://0f8fad5b-Shot-\\(2\\).png'
    )
  })

  it.each([
    'local://0f8fad5b-My-Photo.png',
    'local://0f8fad5b-Shot-(2).png',
    'https://api.example.com/m/u/user_1/media/0f8fad5b-Shot-(2)+(3).mp4'
  ])('is how a note spells %s, with a caption or without', (url) => {
    expect(picture(url)).toBe(`![](${mdxDestination(url)})\n`)
    expect(picture(url, 'A caption')).toBe(`![](${mdxDestination(url)} "A caption")\n`)
  })
})
