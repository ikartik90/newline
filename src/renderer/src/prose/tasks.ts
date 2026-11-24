import { InputRule } from 'prosemirror-inputrules'
import { splitListItem, wrapInList } from 'prosemirror-schema-list'
import type { ResolvedPos } from 'prosemirror-model'
import type { Command, Transaction } from 'prosemirror-state'
import { canJoin, findWrapping } from 'prosemirror-transform'
import type { EditorView } from 'prosemirror-view'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// A task: a list item that is open or done (`- [ ]`, `- [x]`). Its box is its
// marker, drawn by the item's view; here is what makes one, ticks it and
// carries it on to the next line.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

/** Where the item round a position starts, if the position is in that item's own line. */
function itemOfLine($pos: ResolvedPos): number | null {
  const holder = $pos.depth > 1 ? $pos.node(-1) : null
  return holder?.type === nodes.list_item && $pos.index(-1) === 0 ? $pos.before(-1) : null
}

/** The item a position is in, at any depth inside it. */
function itemAround($pos: ResolvedPos): number | null {
  for (let depth = $pos.depth; depth > 0; depth -= 1) {
    if ($pos.node(depth).type === nodes.list_item) return $pos.before(depth)
  }
  return null
}

function checking(tr: Transaction, item: number, checked: boolean | null): Transaction {
  return tr.setNodeAttribute(item, 'checked', checked)
}

/** Tick a task, or untick it. */
export function setTask(view: EditorView, item: number, checked: boolean): void {
  const node = view.state.doc.nodeAt(item)
  if (node?.type !== nodes.list_item || node.attrs.checked === checked) return
  view.dispatch(checking(view.state.tr, item, checked))
}

/**
 * A box typed where a line opens, `[ ]`, `[x]` or `[]`, and a space: the item
 * whose line it is becomes a task, and a line in no list a list of one.
 */
export const taskFromBox = new InputRule(/^\[([ xX]?)\]\s$/, (state, match, start, end) => {
  const $start = state.doc.resolve(start)
  if ($start.parent.type !== nodes.paragraph) return null
  const checked = match[1].toLowerCase() === 'x'
  const tr = state.tr.delete(start, end)
  const item = itemOfLine($start)
  if (item !== null) return checking(tr, item, checked)
  const range = tr.doc.resolve(start).blockRange()
  const wrapping = range && findWrapping(range, nodes.bullet_list)
  if (!range || !wrapping) return null
  tr.wrap(
    range,
    wrapping.map((each) => (each.type === nodes.list_item ? { ...each, attrs: { checked } } : each))
  )
  // A task under a list of bullets is one of them.
  const before = tr.doc.resolve(start - 1).nodeBefore
  if (before?.type === nodes.bullet_list && canJoin(tr.doc, start - 1)) tr.join(start - 1)
  return tr
})

/** Tick the task the caret is in from the keys, or untick it. */
export const toggleTask: Command = (state, dispatch) => {
  const item = itemAround(state.selection.$from)
  const node = item === null ? null : state.doc.nodeAt(item)
  if (item === null || !node || node.attrs.checked === null) return false
  dispatch?.(checking(state.tr, item, !node.attrs.checked))
  return true
}

/** Enter in an item goes on to another like it; a task that follows a done one is still to do. */
export const splitItem: Command = (state, dispatch) =>
  splitListItem(nodes.list_item)(
    state,
    dispatch &&
      ((tr) => {
        const item = itemAround(tr.selection.$from)
        if (item !== null && tr.doc.nodeAt(item)?.attrs.checked) checking(tr, item, false)
        dispatch(tr)
      })
  )

/** Make a task of the line the caret is in: of its item, or of a list made round it. */
export function startTask(view: EditorView): void {
  const within = itemOfLine(view.state.selection.$from)
  if (within === null) wrapInList(nodes.bullet_list)(view.state, view.dispatch)
  const item = itemOfLine(view.state.selection.$from)
  if (item !== null && view.state.doc.nodeAt(item)?.attrs.checked === null) {
    view.dispatch(checking(view.state.tr, item, false))
  }
}
