import { describe, expect, it } from 'vitest'
import type { BlockNode } from '@shared/domain/nodes'
import {
  ensureBlocks,
  hasSyntheticTrailingParagraph,
  isBlockEmpty,
  isListItemType,
  mediaNodeFrom,
  withTrailingParagraph
} from '../blocks'

const text = (t: string) => ({ type: 'text' as const, text: t })

describe('isBlockEmpty', () => {
  it('is true for a text block holding only whitespace', () => {
    expect(isBlockEmpty({ type: 'paragraph', children: [] })).toBe(true)
    expect(isBlockEmpty({ type: 'paragraph', children: [text('  ')] })).toBe(true)
    expect(isBlockEmpty({ type: 'code_block', children: [text('\n')] })).toBe(true)
  })

  it('is false for a block with words, and for every caret-less block', () => {
    expect(isBlockEmpty({ type: 'paragraph', children: [text('a')] })).toBe(false)
    expect(isBlockEmpty({ type: 'horizontal_rule' })).toBe(false)
    expect(isBlockEmpty({ type: 'media', kind: 'image', src: 'local://a.png' })).toBe(false)
    expect(isBlockEmpty({ type: 'link_card', config: {} })).toBe(false)
  })
})

describe('isListItemType', () => {
  it('names the two list entries and nothing else', () => {
    expect(isListItemType('list_item')).toBe(true)
    expect(isListItemType('bullet_list_item')).toBe(true)
    expect(isListItemType('paragraph')).toBe(false)
  })
})

describe('mediaNodeFrom', () => {
  it('writes a picture with only the fields the library knew', () => {
    expect(mediaNodeFrom({ kind: 'image', src: 'https://cdn/a.png' })).toEqual({
      type: 'media',
      kind: 'image',
      src: 'https://cdn/a.png'
    })
  })

  it('carries alt and a whole measurement, dropping half of one', () => {
    expect(
      mediaNodeFrom({ kind: 'image', src: 'https://cdn/a.png', alt: 'A', width: 10, height: 5 })
    ).toMatchObject({ alt: 'A', width: 10, height: 5 })
    expect(mediaNodeFrom({ kind: 'image', src: 'https://cdn/a.png', width: 10 })).toEqual({
      type: 'media',
      kind: 'image',
      src: 'https://cdn/a.png'
    })
  })

  it('puts a poster on a clip and never on a picture', () => {
    expect(
      mediaNodeFrom({ kind: 'video', src: 'https://cdn/a', poster: 'https://cdn/p.jpg' })
    ).toEqual({ type: 'media', kind: 'video', src: 'https://cdn/a', poster: 'https://cdn/p.jpg' })
    expect(
      mediaNodeFrom({ kind: 'image', src: 'https://cdn/a.png', poster: 'https://cdn/p.jpg' })
    ).toEqual({ type: 'media', kind: 'image', src: 'https://cdn/a.png' })
  })
})

describe('withTrailingParagraph / ensureBlocks', () => {
  const empty = { type: 'paragraph', children: [text('')] }

  it('adds a paragraph after a terminal caret-less block, a list or a code block', () => {
    for (const last of [
      { type: 'horizontal_rule' },
      { type: 'media', kind: 'image', src: 'local://a.png' },
      { type: 'link_card', config: {} },
      { type: 'list_item', children: [text('x')] },
      { type: 'bullet_list_item', children: [text('x')] },
      { type: 'code_block', children: [text('x')] }
    ] as BlockNode[]) {
      const out = withTrailingParagraph([last])
      expect(out).toHaveLength(2)
      expect(out[1]).toEqual(empty)
    }
  })

  it('leaves a document that ends in a paragraph, heading or quote alone', () => {
    for (const blocks of [
      [{ type: 'paragraph', children: [text('x')] }],
      [{ type: 'blockquote', children: [text('x')] }]
    ] as BlockNode[][]) {
      expect(withTrailingParagraph(blocks)).toBe(blocks)
    }
  })

  it('gives an empty document one paragraph to type in', () => {
    expect(ensureBlocks({ type: 'doc', content: [] })).toEqual([empty])
    expect(withTrailingParagraph([])).toEqual([empty])
  })
})

describe('hasSyntheticTrailingParagraph', () => {
  it('is true only for the block just before a synthetic trailing paragraph', () => {
    const blocks: BlockNode[] = [
      { type: 'media', kind: 'image', src: 'local://a.png' },
      { type: 'paragraph', children: [] }
    ]
    expect(hasSyntheticTrailingParagraph(blocks, 0)).toBe(true)
    expect(hasSyntheticTrailingParagraph(blocks, 1)).toBe(false)
    expect(
      hasSyntheticTrailingParagraph(
        [
          { type: 'media', kind: 'image', src: 'local://a.png' },
          { type: 'paragraph', children: [text('typed')] }
        ],
        0
      )
    ).toBe(false)
  })
})
