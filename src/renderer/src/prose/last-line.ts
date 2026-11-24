import type { Node } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// The line a note is given to go on from. As today's editor does, the note is
// never left ending on a block there is no typing on from: a list would hold
// the caret in it, Enter in code is a new line of code, and a rule or a picture
// takes no caret. The line is the editor's and not the note's: while it holds
// nothing it is left out of what the note is saved as.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

const ENDS = new Set([
  nodes.bullet_list,
  nodes.ordered_list,
  nodes.code_block,
  nodes.horizontal_rule,
  nodes.media
])

const endsOnOne = (doc: Node): boolean => doc.lastChild !== null && ENDS.has(doc.lastChild.type)

/** The note with a line after it, where it ends on a block that gives none. */
export function withLastLine(doc: Node): Node {
  return endsOnOne(doc) ? doc.copy(doc.content.addToEnd(nodes.paragraph.create())) : doc
}

/** A line as the editor gives it: a plain paragraph that holds nothing. */
export function isGivenLine(node: Node | null | undefined): boolean {
  return !!node && node.sameMarkup(nodes.paragraph.create()) && node.content.size === 0
}

/** The note as it is saved: less the line it was given, while that line holds nothing. */
export function withoutLastLine(doc: Node): Node {
  const last = doc.lastChild
  if (doc.childCount < 2 || !last || !isGivenLine(last)) return doc
  const rest = doc.copy(doc.content.cut(0, doc.content.size - last.nodeSize))
  return endsOnOne(rest) ? rest : doc
}

export function lastLine(): Plugin {
  return new Plugin({
    appendTransaction(_transactions, _before, { doc, tr }) {
      return endsOnOne(doc) ? tr.insert(doc.content.size, nodes.paragraph.create()) : null
    }
  })
}
