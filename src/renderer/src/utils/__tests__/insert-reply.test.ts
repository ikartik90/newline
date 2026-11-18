import { describe, expect, it } from 'vitest'
import type { Document } from '@shared/domain/document'
import { insertReply } from '../insert-reply'

const p = (text: string) => ({
  type: 'paragraph' as const,
  children: [{ type: 'text' as const, text }]
})
const doc = (...content: Document['content']): Document => ({ type: 'doc', content })

describe('insertReply', () => {
  it('adds the reply’s Markdown as blocks at the end of the note', () => {
    const next = insertReply(doc(p('Mine')), '## Summary\n\nShort **and** sweet.')
    expect(next.content).toEqual([
      p('Mine'),
      { type: 'heading', level: 2, children: [{ type: 'text', text: 'Summary' }] },
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Short ' },
          { type: 'text', text: 'and', marks: [{ type: 'bold' }] },
          { type: 'text', text: ' sweet.' }
        ]
      }
    ])
  })

  it('takes the place of the empty paragraphs the note ends on', () => {
    expect(insertReply(doc(p('Mine'), p(''), p('')), 'Added').content).toEqual([
      p('Mine'),
      p('Added')
    ])
    expect(insertReply(doc(p('')), 'Added').content).toEqual([p('Added')])
  })

  it('leaves somewhere to type after a reply that ends in a list', () => {
    const next = insertReply(doc(p('Mine')), '- one\n- two')
    expect(next.content.at(-1)).toEqual(p(''))
  })

  it('changes nothing for an empty reply', () => {
    const before = doc(p('Mine'))
    expect(insertReply(before, '   ')).toBe(before)
  })
})
