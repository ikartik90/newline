import { describe, expect, it } from 'vitest'
import { mdxPlainText } from '../plain-text'
import { NOTES, lines } from './support/corpus'

// What search reads of a note, and what Gemma is told it says.
describe('mdxPlainText', () => {
  it('says nothing for a note that holds nothing', () => {
    expect(mdxPlainText('')).toBe('')
    expect(mdxPlainText(lines('&nbsp;', '', '&nbsp;'))).toBe('')
    expect(mdxPlainText(NOTES['blocks that hold nothing'])).toBe(
      'Only a caption\nunder an empty bullet'
    )
  })

  it('gives each block a line, its marks and signs left out', () => {
    expect(
      mdxPlainText(
        lines(
          '# A *heading*',
          '',
          'Some **bold**, <u>lined</u> and <TextStyle color="danger">red</TextStyle> [words](https://example.com).',
          '',
          '<BlockStyle size="lg" align="right">',
          '  Large, and set right',
          '</BlockStyle>',
          '',
          '---',
          '',
          '```css',
          'a { b: c }',
          '```'
        )
      )
    ).toBe('A heading\nSome bold, lined and red words.\nLarge, and set right\na { b: c }')
  })

  it("gives a list's items, tasks and the blocks under them a line each", () => {
    expect(mdxPlainText(NOTES['blocks under an item'])).toBe(
      [
        'one',
        'under one',
        'a heading under one',
        'an eyebrow under one',
        'a quote under one',
        'Them',
        'Share',
        '42%',
        'of all',
        'one again',
        'under it',
        'two',
        'under two',
        'three',
        'a bullet',
        'under the bullet',
        'the next bullet',
        'a { b: c }',
        'stepped in after code'
      ].join('\n')
    )
    expect(
      mdxPlainText(lines('- [x] done', '- [ ] todo', '', '  1. under it', '', '- [ ] &#x20;'))
    ).toBe('done\ntodo\nunder it')
  })

  it("keeps a line's breaks, and a quote's lines", () => {
    expect(mdxPlainText(NOTES.quotes)).toBe(
      'one\ntwo\n\nfour\nsaid\nA "caption"\nover two lines\nsaid'
    )
  })

  it('says a sidenote after the block it is in, once', () => {
    expect(mdxPlainText(NOTES.sidenotes)).toBe(
      [
        'one run and anothertouching',
        'First',
        'Third',
        'In a heading',
        'Fourth',
        'across\na break',
        'Fifth'
      ].join('\n')
    )
  })

  it('says a footnote as the sidenote it is', () => {
    expect(mdxPlainText(lines('A word[^1] here.', '', '[^1]: The source.'))).toBe(
      'A word here.\nThe source.'
    )
  })

  it("says a picture's caption, and nothing for one that has none", () => {
    expect(mdxPlainText(NOTES.media)).toBe('A "caption" (with) brackets\nwords')
    expect(mdxPlainText(lines('Before ![alt](https://example.com/a.png "Seen") after'))).toBe(
      'Before\nSeen\nafter'
    )
  })

  it('reads a text whose tags cannot be read as its words', () => {
    expect(mdxPlainText(lines('An <unclosed tag', '', 'and more'))).toBe(
      'An <unclosed tag\nand more'
    )
  })
})
