import { Fragment, Slice, type Mark, type Node } from 'prosemirror-model'
import { Plugin, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import { nextSidenoteId, sidenoteAnchorName, type SidenoteEntry } from '@/utils/sidenotes'
import { noteSchema } from './schema'
import { markAt } from './selection'

// ---------------------------------------------------------------------------
// A note's sidenotes as the margin shows them: each numbered in the order it
// is met, its number drawn after its run and never part of the text, and its
// note listed for the card that stands beside the prose.
// ---------------------------------------------------------------------------

const { marks } = noteSchema

interface Found extends SidenoteEntry {
  /** Where the note's last run ends: its number stands there. */
  end: number
}

function found(doc: Node): Found[] {
  const byId = new Map<string, Found>()
  doc.descendants((node, position) => {
    const mark = node.marks.find((worn) => worn.type === marks.sidenote)
    if (!mark) return
    const id: string = mark.attrs.id
    const known = byId.get(id)
    if (known) known.end = position + node.nodeSize
    else
      byId.set(id, {
        id,
        // The document's own field: a note here is found by its id alone.
        blockIndex: 0,
        number: byId.size + 1,
        text: mark.attrs.note,
        anchorName: sidenoteAnchorName(id),
        end: position + node.nodeSize
      })
  })
  return [...byId.values()]
}

/** Every sidenote in the note, in the order it is met, for the cards beside the prose. */
export function noteEntries(doc: Node): SidenoteEntry[] {
  return found(doc).map(({ id, blockIndex, number, text, anchorName }) => ({
    id,
    blockIndex,
    number,
    text,
    anchorName
  }))
}

function numberAfter(note: Found): Decoration {
  return Decoration.widget(
    note.end,
    () => {
      const number = document.createElement('sup')
      number.className = 'article-sidenote-ref'
      number.setAttribute('data-sidenote-number', String(note.number))
      return number
    },
    // Outside every mark its run wears: a line drawn on the words stops where they do.
    { side: -1, marks: [], key: `${note.id} ${note.number}` }
  )
}

export function sidenotes(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => DecorationSet.create(state.doc, found(state.doc).map(numberAfter))
    }
  })
}

const sidenoteOf = (node: Node): Mark | undefined =>
  node.marks.find((worn) => worn.type === marks.sidenote)

function remarked(fragment: Fragment, remark: (node: Node) => Node): Fragment {
  const nodes: Node[] = []
  fragment.forEach((node) =>
    nodes.push(remark(node.isText ? node : node.copy(remarked(node.content, remark))))
  )
  return Fragment.fromArray(nodes)
}

/**
 * What is pasted, each of its sidenotes a note of its own: text read as markdown
 * numbers its notes from one and a copy brings the id it had, and an id the note
 * already holds would make the two one note, under one number and one card.
 */
export function pastedSidenotes(slice: Slice, view: EditorView): Slice {
  // Dragged to another place, the words it had are taken away: the same note still.
  if (view.dragging?.move) return slice
  // So are words put back inside the sidenote they were copied from.
  const around = marks.sidenote.isInSet(view.state.selection.$from.marks())
  const itsOwn = (node: Node): Mark | undefined => {
    const worn = sidenoteOf(node)
    return worn && !(around && worn.eq(around)) ? worn : undefined
  }
  const held = new Set<string>()
  view.state.doc.descendants((node) => {
    const worn = sidenoteOf(node)
    if (worn) held.add(worn.attrs.id)
  })
  // A new id is clear of the note's and of the rest of what is pasted.
  const taken = new Set(held)
  slice.content.descendants((node) => {
    const worn = itsOwn(node)
    if (worn) taken.add(worn.attrs.id)
  })
  const renamed = new Map<string, string>()
  const content = remarked(slice.content, (node) => {
    const worn = itsOwn(node)
    if (!worn || !held.has(worn.attrs.id)) return node
    const id = renamed.get(worn.attrs.id) ?? nextSidenoteId(taken)
    renamed.set(worn.attrs.id, id)
    taken.add(id)
    return node.mark(
      worn.type.create({ ...worn.attrs, id }).addToSet(worn.removeFromSet(node.marks))
    )
  })
  return renamed.size === 0 ? slice : new Slice(content, slice.openStart, slice.openEnd)
}

/** The sidenote the caret is in, if it is in one. */
export function sidenoteAt(state: EditorState): string | null {
  const mark = markAt(state.selection.$from, marks.sidenote)
  return mark ? mark.attrs.id : null
}

/** Write a sidenote's note, on every run that wears it. */
export function setSidenoteNote(view: EditorView, id: string, note: string): void {
  const tr = view.state.tr
  view.state.doc.descendants((node, position) => {
    const mark = node.marks.find((worn) => worn.type === marks.sidenote && worn.attrs.id === id)
    if (!mark || mark.attrs.note === note) return
    const end = position + node.nodeSize
    tr.removeMark(position, end, mark).addMark(position, end, marks.sidenote.create({ id, note }))
  })
  if (tr.docChanged) view.dispatch(tr)
}
