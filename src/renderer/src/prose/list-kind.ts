import { Fragment, type Node, type NodeType } from 'prosemirror-model'
import { TextSelection, type EditorState, type Transaction } from 'prosemirror-state'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// An item's kind, changed where it stands: a numbered item made a bullet, or a
// bullet a number, leaves its list and steps nowhere. The list it leaves parts
// round it, and it is one list with any of its new kind that it then stands
// beside.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

const items = (list: Node, from: number, to: number): Fragment => {
  const kept: Node[] = []
  for (let index = from; index < to; index += 1) kept.push(list.child(index))
  return Fragment.fromArray(kept)
}

/**
 * The change that makes the item whose line the caret is in an item of a list
 * of `kind`. None where the caret is in no item's own line.
 */
export function itemKind(state: EditorState, kind: NodeType): Transaction | null {
  const { $from } = state.selection
  const item = $from.depth > 2 ? $from.node(-1) : null
  if (item?.type !== nodes.list_item || $from.index(-1) !== 0) return null
  const list = $from.node(-2)
  const index = $from.index(-2)
  const tr = state.tr
  // A task of that kind already is the plain item of it.
  if (list.type === kind) {
    return item.attrs.checked === null ? tr : tr.setNodeAttribute($from.before(-1), 'checked', null)
  }

  const at = $from.before(-2)
  const numbered = list.type === nodes.ordered_list
  const head = index > 0 ? list.copy(items(list, 0, index)) : null
  const own = kind.create(null, item.type.create({ ...item.attrs, checked: null }, item.content))
  // What follows the item counts on past it.
  const tail =
    index < list.childCount - 1
      ? list.type.create(
          numbered ? { ...list.attrs, start: list.attrs.start + index } : list.attrs,
          items(list, index + 1, list.childCount)
        )
      : null
  tr.replaceWith(
    at,
    at + list.nodeSize,
    [head, own, tail].filter((part): part is Node => !!part)
  )
  const start = at + (head?.nodeSize ?? 0)
  tr.setSelection(TextSelection.create(tr.doc, start + 3 + $from.parentOffset))

  // One list with the lists of its kind either side: dots always, and numbers
  // where the list after began at the number the item now takes.
  const before = tr.doc.resolve(start).nodeBefore
  const joinsBefore = before?.type === kind
  const number =
    joinsBefore && kind === nodes.ordered_list ? before.attrs.start + before.childCount : 1
  const end = start + own.nodeSize
  const after = tr.doc.resolve(end).nodeAfter
  if (after?.type === kind && (kind === nodes.bullet_list || after.attrs.start === number)) {
    tr.join(end)
  }
  if (joinsBefore) tr.join(start)
  return tr
}
