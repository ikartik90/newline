import type { Root } from 'mdast'
import { fromMarkdown } from 'mdast-util-from-markdown'
import {
  gfmAutolinkLiteralFromMarkdown,
  gfmAutolinkLiteralToMarkdown
} from 'mdast-util-gfm-autolink-literal'
import { gfmFootnoteFromMarkdown } from 'mdast-util-gfm-footnote'
import {
  gfmStrikethroughFromMarkdown,
  gfmStrikethroughToMarkdown
} from 'mdast-util-gfm-strikethrough'
import {
  gfmTaskListItemFromMarkdown,
  gfmTaskListItemToMarkdown
} from 'mdast-util-gfm-task-list-item'
import { mdxJsxFromMarkdown, mdxJsxToMarkdown } from 'mdast-util-mdx-jsx'
import { toMarkdown } from 'mdast-util-to-markdown'
import { gfmAutolinkLiteral } from 'micromark-extension-gfm-autolink-literal'
import { gfmFootnote } from 'micromark-extension-gfm-footnote'
import { gfmStrikethrough } from 'micromark-extension-gfm-strikethrough'
import { gfmTaskListItem } from 'micromark-extension-gfm-task-list-item'
import { mdxJsx } from 'micromark-extension-mdx-jsx'
import { mdxMd } from 'micromark-extension-mdx-md'
import { z } from 'zod'

// ---------------------------------------------------------------------------
// The dialect a note is written in: CommonMark with strikethrough and tasks
// (`- [ ]`, `- [x]`), and five tags of our own. Two more things are read and
// never written: an address written bare is a link, and a footnote (`[^1]`) a
// sidenote. MDX here is a syntax and never code: a tag is parsed and read from
// a closed list, and `import` and `{expression}` are not syntax at all, so
// nothing in a note can run.
// ---------------------------------------------------------------------------

/** The tags the dialect knows, by what they are for. */
export const TAG = {
  underline: 'u',
  highlight: 'mark',
  sidenote: 'Sidenote',
  /** Around a run of text: its colour. */
  textStyle: 'TextStyle',
  /** Around a block: its size, colour, alignment and indent. */
  blockStyle: 'BlockStyle'
} as const

/** A colour by the name of its role, never a value, so a note follows the theme. */
export const StyleColorSchema = z.enum(['highlight', 'muted', 'danger', 'warning', 'success'])
export type StyleColor = z.infer<typeof StyleColorSchema>

/** A paragraph's size beside its own, which is written as nothing. */
export const StyleSizeSchema = z.enum(['sm', 'lg'])
export type StyleSize = z.infer<typeof StyleSizeSchema>

/** The side a block is set to beside the left, which is written as nothing. */
export const StyleAlignSchema = z.enum(['center', 'right'])
export type StyleAlign = z.infer<typeof StyleAlignSchema>

/** The languages a block of code can say it is in; any other is written as none. */
export const CodeLanguageSchema = z.enum([
  'html',
  'css',
  'json',
  'javascript',
  'jsx',
  'typescript',
  'tsx'
])
export type CodeLanguage = z.infer<typeof CodeLanguageSchema>

/** What a block's style tag says of it. */
export interface Style {
  size?: StyleSize
  color?: StyleColor
  align?: StyleAlign
  indent?: boolean
}

const GFM = [gfmStrikethrough(), gfmTaskListItem(), gfmAutolinkLiteral(), gfmFootnote()]
const FROM_GFM = [
  gfmStrikethroughFromMarkdown(),
  gfmTaskListItemFromMarkdown(),
  // Without its second look over the whole tree, which links an address even
  // where its escape says it is words.
  { ...gfmAutolinkLiteralFromMarkdown(), transforms: [] },
  gfmFootnoteFromMarkdown()
]

/** The tree of a note's text. Throws where a tag is malformed. */
export function parseMdx(text: string): Root {
  return fromMarkdown(text, {
    extensions: [mdxJsx(), mdxMd(), ...GFM],
    mdastExtensions: [mdxJsxFromMarkdown(), ...FROM_GFM]
  })
}

/** The tree of a text read with no tags at all: one written as words stays words. */
export function parseMarkdown(text: string): Root {
  return fromMarkdown(text, { extensions: [mdxMd(), ...GFM], mdastExtensions: FROM_GFM })
}

/** A tree as text, in the one style every note is written in. */
export function writeMdx(tree: Root): string {
  return toMarkdown(tree, {
    extensions: [
      mdxJsxToMarkdown(),
      gfmStrikethroughToMarkdown(),
      gfmTaskListItemToMarkdown(),
      // Escapes an address left as words, so it is not read back as a link.
      gfmAutolinkLiteralToMarkdown()
    ],
    bullet: '-',
    rule: '-',
    emphasis: '*',
    strong: '*',
    fences: true,
    // `[text](url)` always: MDX reads `<url>` as a tag.
    resourceLink: true,
    // Not syntax to us, but an expression to any other reader of MDX.
    unsafe: [{ character: '{', inConstruct: 'phrasing' }],
    // An item that holds more than its own line stands clear of the next.
    join: [
      (left, _right, parent) =>
        parent.type === 'list' && left.type === 'listItem' && left.spread ? 1 : undefined
    ]
  })
}

/**
 * An address as a note's text spells it inside `(…)`: markdown escapes what it
 * would read as its own, a file name's brackets among it. Asked of the writer
 * itself, so the two never disagree.
 */
export function mdxDestination(url: string): string {
  const written = writeMdx({
    type: 'root',
    children: [{ type: 'paragraph', children: [{ type: 'image', url, alt: '', title: null }] }]
  })
  return written.slice('![]('.length, written.lastIndexOf(')'))
}
