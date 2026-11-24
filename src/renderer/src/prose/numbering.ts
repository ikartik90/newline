import type { Node } from 'prosemirror-model'
import { Plugin, PluginKey, type Transaction } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// A numbered list's count, set from its number: counting on from the list
// before it, or starting again at an item. MDX says a list's first number and
// nothing more, so a list counts on from another exactly when it starts one
// past it, and is kept there as the list before it grows and shrinks.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

interface NumberingState {
  /** Where the item stands whose number was pressed, while its options are open. */
  asked: number | null
}

type Said = { ask: number } | 'close'

export const numberingKey = new PluginKey<NumberingState>('numbering')

interface Run {
  position: number
  start: number
  end: number
}

/** The numbered lists that stand in no other block, in order, with where each counts from and to. */
function runs(doc: Node): Run[] {
  const found: Run[] = []
  doc.forEach((node, position) => {
    if (node.type !== nodes.ordered_list) return
    const start: number = node.attrs.start
    found.push({ position, start, end: start + node.childCount - 1 })
  })
  return found
}

/** The run an item is in and the number it would count on from, when a list stands before it. */
function following(doc: Node, item: number): { run: Run; from: number } | null {
  const $item = doc.resolve(item)
  if ($item.depth !== 1) return null
  const all = runs(doc)
  const index = all.findIndex((run) => run.position === $item.before())
  return index > 0 ? { run: all[index], from: all[index - 1].end + 1 } : null
}

/** Whether the list an item is in counts on from the numbered list before it. */
export function countsOn(doc: Node, item: number): boolean {
  const found = following(doc, item)
  return found !== null && found.run.start === found.from
}

/** Lists that counted on before a change still do after it, unless the change set their number. */
function keptCountingOn(
  transactions: readonly Transaction[],
  before: Node,
  after: Node,
  tr: Transaction
): Transaction | null {
  const was = runs(before)
  const now = runs(after)
  let changed = false
  was.forEach((run, index) => {
    if (index === 0 || run.start !== was[index - 1].end + 1) return
    const position = transactions.reduce((at, each) => each.mapping.map(at, 1), run.position)
    const at = now.findIndex((each) => each.position === position)
    if (at < 0 || now[at].start !== run.start) return
    const from = at === 0 ? 1 : now[at - 1].end + 1
    const moved = from - now[at].start
    if (moved === 0) return
    tr.setNodeAttribute(position, 'start', from)
    // The lists after this one count on from where it now ends.
    now[at] = { position, start: from, end: now[at].end + moved }
    changed = true
  })
  return changed ? tr : null
}

export function numbering(): Plugin<NumberingState> {
  return new Plugin<NumberingState>({
    key: numberingKey,
    state: {
      init: () => ({ asked: null }),
      apply(transaction, was) {
        const said = transaction.getMeta(numberingKey) as Said | undefined
        if (said === 'close' || (transaction.docChanged && !said)) return { asked: null }
        return said ? { asked: said.ask } : was
      }
    },
    appendTransaction(transactions, before, after) {
      if (!transactions.some((transaction) => transaction.docChanged)) return null
      return keptCountingOn(transactions, before.doc, after.doc, after.tr)
    }
  })
}

/** Open the numbering options for the item at a position, or put them away if they are its. */
export function askNumbering(view: EditorView, item: number): void {
  const said: Said = numberingKey.getState(view.state)?.asked === item ? 'close' : { ask: item }
  view.dispatch(view.state.tr.setMeta(numberingKey, said))
}

export function closeNumbering(view: EditorView): void {
  if (numberingKey.getState(view.state)?.asked == null) return
  view.dispatch(view.state.tr.setMeta(numberingKey, 'close' satisfies Said))
}

/** Count the item's list on from the list before it, or from one again if it already does. */
export function toggleCountingOn(view: EditorView, item: number): void {
  const found = following(view.state.doc, item)
  const tr = view.state.tr.setMeta(numberingKey, 'close' satisfies Said)
  if (found) {
    const { run, from } = found
    tr.setNodeAttribute(run.position, 'start', run.start === from ? 1 : from)
  }
  view.dispatch(tr)
}

/**
 * Start the count again at an item: the list parts there, the item first in a
 * list of its own that counts from one. Asked of an item already first, a list
 * that starts elsewhere starts at one, and one that follows straight on from
 * another list joins it again.
 */
export function resetNumbering(view: EditorView, item: number): void {
  const { doc } = view.state
  const $item = doc.resolve(item)
  const list = $item.parent
  const tr = view.state.tr.setMeta(numberingKey, 'close' satisfies Said)
  if (list.type !== nodes.ordered_list) return view.dispatch(tr)
  const at = $item.before()
  if ($item.index() > 0) {
    tr.split(item, 1, [{ type: nodes.ordered_list, attrs: { ...list.attrs, start: 1 } }])
  } else if (list.attrs.start !== 1) {
    tr.setNodeAttribute(at, 'start', 1)
  } else if (doc.resolve(at).nodeBefore?.type === nodes.ordered_list) {
    tr.join(at)
  }
  view.dispatch(tr)
}
