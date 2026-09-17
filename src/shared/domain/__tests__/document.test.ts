import { describe, expect, it } from 'vitest'
import {
  DocumentSchema,
  EMPTY_DOCUMENT,
  blockText,
  documentPlainText,
  documentTitle,
  emptyParagraph,
  parseDocument,
  serializeDocument
} from '../document'

const text = (t: string, marks?: unknown[]) => ({ type: 'text', text: t, marks })

describe('DocumentSchema', () => {
  it('accepts a valid document', () => {
    expect(
      DocumentSchema.safeParse({
        type: 'doc',
        content: [{ type: 'paragraph', children: [text('Hello')] }]
      }).success
    ).toBe(true)
  })

  it('accepts a document with an empty content array', () => {
    expect(DocumentSchema.safeParse({ type: 'doc', content: [] }).success).toBe(true)
  })

  it('rejects a document missing type', () => {
    expect(DocumentSchema.safeParse({ content: [] }).success).toBe(false)
  })

  it('rejects a document with a malformed block', () => {
    expect(
      DocumentSchema.safeParse({ type: 'doc', content: [{ type: 'heading', level: 9 }] }).success
    ).toBe(false)
  })
})

describe('EMPTY_DOCUMENT / emptyParagraph', () => {
  it('is a doc with nothing in it', () => {
    expect(EMPTY_DOCUMENT).toEqual({ type: 'doc', content: [] })
  })

  it('makes a fresh empty paragraph each time', () => {
    const a = emptyParagraph()
    const b = emptyParagraph()
    expect(a).toEqual({ type: 'paragraph', children: [] })
    expect(a).not.toBe(b)
  })
})

describe('blockText', () => {
  it('joins the inline runs of a text block', () => {
    expect(
      blockText({
        type: 'paragraph',
        children: [text('Hello, '), text('world', [{ type: 'bold' }])]
      })
    ).toBe('Hello, world')
  })

  it('reads the caption of a picture, and nothing for a rule', () => {
    expect(
      blockText({ type: 'media', kind: 'image', src: 'local://a.png', caption: 'A caption' })
    ).toBe('A caption')
    expect(blockText({ type: 'horizontal_rule' })).toBe('')
  })

  it('reads a link card by its words, then its destination', () => {
    expect(blockText({ type: 'link_card', config: { content: { title: 'Docs' } } })).toBe('Docs')
    expect(
      blockText({
        type: 'link_card',
        config: { link: { kind: 'external', href: 'https://example.com' } }
      })
    ).toBe('https://example.com')
  })
})

describe('documentPlainText', () => {
  it('puts every block on its own line, sidenotes included', () => {
    const doc = DocumentSchema.parse({
      type: 'doc',
      content: [
        { type: 'heading', level: 1, children: [text('Title')] },
        {
          type: 'paragraph',
          children: [text('Body '), text('note', [{ type: 'sidenote', id: 'a', text: 'An aside' }])]
        },
        { type: 'metric', caption: 'Revenue', children: [text('$1k')], subtext: 'a year' }
      ]
    })
    expect(documentPlainText(doc)).toBe('Title\nBody note\nAn aside\nRevenue $1k a year')
  })

  it('is empty for an empty document', () => {
    expect(documentPlainText(EMPTY_DOCUMENT)).toBe('')
  })
})

describe('documentTitle', () => {
  it('prefers a title the author typed', () => {
    expect(documentTitle('  My note ', EMPTY_DOCUMENT)).toBe('My note')
  })

  it('falls back to the first line of text, trimmed to forty characters', () => {
    const doc = DocumentSchema.parse({
      type: 'doc',
      content: [
        { type: 'horizontal_rule' },
        { type: 'paragraph', children: [text('A rather long opening line that keeps going on')] }
      ]
    })
    expect(documentTitle('', doc)).toBe('A rather long opening line that keeps go')
  })

  it('is Untitled when there is nothing to read', () => {
    expect(documentTitle('', EMPTY_DOCUMENT)).toBe('Untitled')
  })
})

describe('parseDocument / serializeDocument', () => {
  it('round-trips a document through its stored JSON', () => {
    const doc = DocumentSchema.parse({
      type: 'doc',
      content: [{ type: 'paragraph', children: [text('Hi')] }]
    })
    expect(parseDocument(serializeDocument(doc))).toEqual(doc)
  })

  it('reads an empty or unparseable body as an empty document', () => {
    expect(parseDocument('')).toEqual(EMPTY_DOCUMENT)
    expect(parseDocument('# not json')).toEqual(EMPTY_DOCUMENT)
    expect(parseDocument('{"type":"doc","content":[{"type":"nope"}]}')).toEqual(EMPTY_DOCUMENT)
  })
})
