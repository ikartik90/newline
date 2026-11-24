import { Slice } from 'prosemirror-model'
import type { EditorView } from 'prosemirror-view'
import { mdxToProse } from './mdx-to-prose'
import { noteSchema } from './schema'
import { pastedSidenotes } from './sidenotes'

const { nodes } = noteSchema

/**
 * Add an assistant reply at the end of the note, in place of the empty lines
 * the note ends on. The model writes Markdown, so the reply is read as
 * markdown pasted in is and arrives as real blocks; it is one step to undo and
 * saves as any edit does.
 */
export function insertReply(view: EditorView, markdown: string): void {
  if (!markdown.trim()) return
  const added = pastedSidenotes(new Slice(mdxToProse(markdown).content, 0, 0), view).content
  const { doc } = view.state
  let from = doc.content.size
  for (let index = doc.childCount - 1; index >= 0; index -= 1) {
    const block = doc.child(index)
    if (block.type !== nodes.paragraph || block.textContent.trim()) break
    from -= block.nodeSize
  }
  view.dispatch(view.state.tr.replaceWith(from, doc.content.size, added).scrollIntoView())
}
