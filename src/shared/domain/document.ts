import { z } from 'zod'
import { linkCardTitle } from './link-card'
import { BlockNodeSchema, type BlockNode, type InlineNode } from './nodes'

// ---------------------------------------------------------------------------
// Document — the root AST node a note's body holds
// ---------------------------------------------------------------------------

export const DocumentSchema = z.object({
  type: z.literal('doc'),
  content: z.array(BlockNodeSchema)
})

export type Document = z.infer<typeof DocumentSchema>

export const EMPTY_DOCUMENT: Document = { type: 'doc', content: [] }

export function emptyParagraph(): BlockNode {
  return { type: 'paragraph', children: [] }
}

/** The text of an inline run, marks ignored. */
export function inlineText(nodes: InlineNode[]): string {
  return nodes.map((node) => node.text).join('')
}

/**
 * The words a block holds, for search and for naming a note. A picture
 * answers with its caption, a rule with nothing, a link card with the words
 * on it or failing that where it goes.
 */
export function blockText(block: BlockNode): string {
  switch (block.type) {
    case 'horizontal_rule':
      return ''
    case 'media':
      return block.caption ?? ''
    case 'link_card':
      return linkCardTitle(block.config) ?? ''
    case 'metric':
      return [block.caption, inlineText(block.children), block.subtext]
        .filter((part) => part && part.trim())
        .join(' ')
    default:
      return inlineText(block.children)
  }
}

/** The text of every sidenote in a run, in order. */
function sidenoteTexts(nodes: InlineNode[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const node of nodes) {
    for (const mark of node.marks ?? []) {
      if (mark.type === 'sidenote' && !seen.has(mark.id)) {
        seen.add(mark.id)
        if (mark.text.trim()) out.push(mark.text)
      }
    }
  }
  return out
}

/**
 * Every word in the document, one block per line, so full-text search finds
 * a note by anything written in it — margin notes included.
 */
export function documentPlainText(doc: Document): string {
  const lines: string[] = []
  for (const block of doc.content) {
    const text = blockText(block)
    if (text.trim()) lines.push(text)
    if ('children' in block) lines.push(...sidenoteTexts(block.children))
  }
  return lines.join('\n')
}

const TITLE_LENGTH = 40

/**
 * What a note is called: the title the author typed, or the first line of
 * text, or "Untitled".
 */
export function documentTitle(title: string, doc: Document): string {
  if (title.trim()) return title.trim()
  for (const block of doc.content) {
    const text = blockText(block).trim()
    if (text) return text.slice(0, TITLE_LENGTH)
  }
  return 'Untitled'
}

export function serializeDocument(doc: Document): string {
  return JSON.stringify(doc)
}

/**
 * A stored body as a document. Anything that is not one — an empty string, a
 * markdown body the migration has not reached, a malformed blob — reads as an
 * empty document rather than throwing, so a bad row never takes the app down.
 */
export function parseDocument(body: string): Document {
  if (!body) return EMPTY_DOCUMENT
  try {
    const result = DocumentSchema.safeParse(JSON.parse(body))
    return result.success ? result.data : EMPTY_DOCUMENT
  } catch {
    return EMPTY_DOCUMENT
  }
}
