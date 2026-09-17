import { marked, type Token, type Tokens } from 'marked'
import { z } from 'zod'
import { DocumentSchema, EMPTY_DOCUMENT, parseDocument, type Document } from '../domain/document'
import {
  CodeLanguageSchema,
  type BlockNode,
  type CodeLanguage,
  type InlineNode,
  type Mark
} from '../domain/nodes'
import type { MediaNode } from '../domain/media-node'

// ---------------------------------------------------------------------------
// Markdown → Document. Used once by the v2 migration and on every pull of a
// remote body that predates the document model. Lossy where the model has no
// place for something (tables, nested lists), never throwing: a body the
// lexer cannot make sense of becomes paragraphs of its own text.
// ---------------------------------------------------------------------------

const LANGUAGE_ALIASES: Record<string, CodeLanguage> = { js: 'javascript', ts: 'typescript' }

const VIDEO_EXTENSIONS = /\.mp4$/i

function isAbsoluteUrl(href: string): boolean {
  return z.url().safeParse(href).success
}

function sameMarks(a?: Mark[], b?: Mark[]): boolean {
  return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
}

/** Adjacent runs wearing the same marks become one; empty runs vanish. */
function mergeRuns(nodes: InlineNode[]): InlineNode[] {
  const out: InlineNode[] = []
  for (const node of nodes) {
    if (!node.text) continue
    const last = out.at(-1)
    if (last && sameMarks(last.marks, node.marks)) {
      last.text += node.text
    } else {
      out.push(
        node.marks?.length ? { ...node, marks: [...node.marks] } : { type: 'text', text: node.text }
      )
    }
  }
  return out
}

/** Whitespace at the edges of a run is the markdown's, not the author's. */
function trimRun(nodes: InlineNode[]): InlineNode[] {
  const run = mergeRuns(nodes)
  const first = run[0]
  if (first) first.text = first.text.replace(/^\s+/, '')
  const last = run.at(-1)
  if (last) last.text = last.text.replace(/\s+$/, '')
  return mergeRuns(run)
}

function textNode(text: string, marks: Mark[]): InlineNode {
  return marks.length ? { type: 'text', text, marks } : { type: 'text', text }
}

/**
 * The inline nodes of a run of tokens. An image met here — inside a heading,
 * a mark, a list item — has no block to become and stands in as its alt text;
 * only a paragraph splits images out (see `paragraphBlocks`).
 */
function inlineNodes(tokens: Token[], marks: Mark[] = []): InlineNode[] {
  const out: InlineNode[] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'text': {
        const text = token as Tokens.Text
        if (text.tokens) out.push(...inlineNodes(text.tokens, marks))
        else out.push(textNode(text.text, marks))
        break
      }
      case 'escape':
      case 'codespan':
      case 'html':
        out.push(
          textNode(
            (token as Tokens.Escape).text,
            token.type === 'codespan' ? [...marks, { type: 'code' }] : marks
          )
        )
        break
      case 'strong':
        out.push(...inlineNodes((token as Tokens.Strong).tokens, [...marks, { type: 'bold' }]))
        break
      case 'em':
        out.push(...inlineNodes((token as Tokens.Em).tokens, [...marks, { type: 'italic' }]))
        break
      case 'del':
        out.push(
          ...inlineNodes((token as Tokens.Del).tokens, [...marks, { type: 'strikethrough' }])
        )
        break
      case 'link': {
        const link = token as Tokens.Link
        const linkMarks: Mark[] = isAbsoluteUrl(link.href)
          ? [...marks, { type: 'link', href: link.href }]
          : marks
        out.push(...inlineNodes(link.tokens, linkMarks))
        break
      }
      case 'image':
        out.push(textNode((token as Tokens.Image).text, marks))
        break
      case 'br':
        out.push(textNode('\n', marks))
        break
      case 'checkbox':
      case 'space':
        break
      default: {
        const generic = token as Tokens.Generic
        if (generic.tokens) out.push(...inlineNodes(generic.tokens, marks))
        else if (typeof generic.text === 'string') out.push(textNode(generic.text, marks))
      }
    }
  }
  return out
}

function mediaBlock(image: Tokens.Image): MediaNode {
  const path = image.href.split(/[?#]/)[0]
  const kind = VIDEO_EXTENSIONS.test(path) ? 'video' : 'image'
  return image.text
    ? { type: 'media', kind, src: image.href, alt: image.text }
    : { type: 'media', kind, src: image.href }
}

/**
 * A paragraph, or the media blocks it held with the text around them as
 * paragraphs of their own. A picture on a line by itself is the common case.
 */
function paragraphBlocks(tokens: Token[]): BlockNode[] {
  const blocks: BlockNode[] = []
  let run: InlineNode[] = []
  const flush = (): void => {
    const children = trimRun(run)
    if (children.length) blocks.push({ type: 'paragraph', children })
    run = []
  }
  for (const token of tokens) {
    if (token.type === 'image') {
      flush()
      blocks.push(mediaBlock(token as Tokens.Image))
    } else {
      run.push(...inlineNodes([token]))
    }
  }
  flush()
  return blocks
}

/**
 * Everything inside a container token as one inline run, its blocks joined
 * with a space. Blockquotes and list items hold one run each; the model has
 * no nesting for them to keep.
 */
function flattenedChildren(tokens: Token[]): InlineNode[] {
  const runs: InlineNode[][] = []
  for (const token of tokens) {
    switch (token.type) {
      case 'space':
      case 'list':
        break
      case 'code':
        runs.push([textNode((token as Tokens.Code).text, [])])
        break
      case 'blockquote':
        runs.push(flattenedChildren((token as Tokens.Blockquote).tokens))
        break
      default: {
        const generic = token as Tokens.Generic
        runs.push(generic.tokens ? inlineNodes(generic.tokens) : inlineNodes([token]))
      }
    }
  }
  const joined: InlineNode[] = []
  for (const run of runs) {
    const trimmed = trimRun(run)
    if (!trimmed.length) continue
    if (joined.length) joined.push(textNode(' ', []))
    joined.push(...trimmed)
  }
  return mergeRuns(joined)
}

/**
 * A list as the run of item blocks the model keeps. A nested list's items
 * follow their parent in the same run: the model has no depth, so the
 * indentation is lost and a nested numbered list continues its parent's count.
 */
function listBlocks(list: Tokens.List): BlockNode[] {
  const blocks: BlockNode[] = []
  list.items.forEach((item, index) => {
    const children = flattenedChildren(item.tokens)
    if (list.ordered) {
      const start =
        index === 0 && typeof list.start === 'number' && list.start > 1 ? list.start : undefined
      blocks.push(start ? { type: 'list_item', children, start } : { type: 'list_item', children })
    } else {
      blocks.push(
        item.task && item.checked
          ? { type: 'bullet_list_item', children, marker: 'check' }
          : { type: 'bullet_list_item', children }
      )
    }
    for (const token of item.tokens) {
      if (token.type === 'list') blocks.push(...listBlocks(token as Tokens.List))
    }
  })
  return blocks
}

function codeLanguage(lang: string | undefined): CodeLanguage | undefined {
  const name = (lang ?? '').trim().split(/\s+/)[0].toLowerCase()
  const result = CodeLanguageSchema.safeParse(LANGUAGE_ALIASES[name] ?? name)
  return result.success ? result.data : undefined
}

function codeBlock(code: Tokens.Code): BlockNode {
  const language = codeLanguage(code.lang)
  const children: InlineNode[] = code.text ? [{ type: 'text', text: code.text }] : []
  return language ? { type: 'code_block', language, children } : { type: 'code_block', children }
}

function rawParagraph(raw: string): BlockNode[] {
  const text = raw.trim()
  return text ? [{ type: 'paragraph', children: [{ type: 'text', text }] }] : []
}

function blockNodes(tokens: Token[]): BlockNode[] {
  const blocks: BlockNode[] = []
  for (const token of tokens) {
    switch (token.type) {
      // A link reference definition renders as nothing, like a blank line.
      case 'space':
      case 'def':
        break
      case 'heading': {
        const heading = token as Tokens.Heading
        const level = Math.min(6, Math.max(1, heading.depth)) as 1 | 2 | 3 | 4 | 5 | 6
        blocks.push({ type: 'heading', level, children: trimRun(inlineNodes(heading.tokens)) })
        break
      }
      case 'paragraph':
        blocks.push(...paragraphBlocks((token as Tokens.Paragraph).tokens))
        break
      case 'blockquote':
        blocks.push({
          type: 'blockquote',
          children: flattenedChildren((token as Tokens.Blockquote).tokens)
        })
        break
      case 'list':
        blocks.push(...listBlocks(token as Tokens.List))
        break
      case 'code':
        blocks.push(codeBlock(token as Tokens.Code))
        break
      case 'hr':
        blocks.push({ type: 'horizontal_rule' })
        break
      case 'html':
        blocks.push(...rawParagraph((token as Tokens.HTML).text))
        break
      // A tight list item's text wrapper, met only when a caller hands one in.
      case 'text':
        blocks.push({ type: 'paragraph', children: trimRun(inlineNodes([token])) })
        break
      default:
        blocks.push(...rawParagraph(token.raw))
    }
  }
  return blocks
}

function isEmptyParagraph(block: BlockNode): boolean {
  return (
    block.type === 'paragraph' &&
    block.children.every((child) => !child.text.replace(/\s|&nbsp;/g, ''))
  )
}

export function markdownToDocument(markdown: string): Document {
  const content = blockNodes(marked.lexer(markdown))
  while (content.length && isEmptyParagraph(content[content.length - 1])) content.pop()
  if (!content.length) return EMPTY_DOCUMENT
  return DocumentSchema.parse({ type: 'doc', content })
}

/** Is this body already a serialised document, rather than markdown? */
export function looksLikeDocumentJson(body: string): boolean {
  if (!body) return false
  try {
    return DocumentSchema.safeParse(JSON.parse(body)).success
  } catch {
    return false
  }
}

/** A stored body as a document, whichever of the two forms it is in. */
export function bodyToDocument(body: string): Document {
  return looksLikeDocumentJson(body) ? parseDocument(body) : markdownToDocument(body)
}
