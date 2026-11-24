import { InputRule } from 'prosemirror-inputrules'
import { Plugin, type EditorState } from 'prosemirror-state'
import { normalizeLinkHref } from '@/components/editor/marks'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// An address typed bare is a link to itself, as one read from markdown is: at
// the space after it, or at Enter.
// ---------------------------------------------------------------------------

const { marks } = noteSchema

/** An address, with its scheme or opening with `www.`, that ends what stands before the caret. */
const BARE = /(?:^|\s|\()((?:https?:\/\/|www\.)\S+)$/

interface Address {
  from: number
  to: number
  href: string
}

/** The stop or the bracket that ends a sentence is not the address's own. */
function trimmed(address: string): string {
  let kept = address.replace(/[.,;:!?'"]+$/, '')
  while (kept.endsWith(')') && kept.split('(').length <= kept.split(')').length - 1) {
    kept = kept.slice(0, -1).replace(/[.,;:!?'"]+$/, '')
  }
  return kept
}

/** The bare address that ends at a position in its line, where it is neither a link nor code. */
function addressBefore(state: EditorState, end: number): Address | null {
  const $end = state.doc.resolve(end)
  if (!$end.parent.isTextblock || $end.parent.type.spec.code) return null
  const before = $end.parent.textBetween(0, $end.parentOffset, undefined, '￼')
  const found = BARE.exec(before)
  const address = found ? trimmed(found[1]) : ''
  if (!found || !/^(https?:\/\/|www\.)[^\s/]/.test(address)) return null
  const from = $end.start() + found.index + found[0].length - found[1].length
  const to = from + address.length
  const worn = (mark: typeof marks.link): boolean => state.doc.rangeHasMark(from, to, mark)
  if (worn(marks.link) || worn(marks.code)) return null
  return { from, to, href: normalizeLinkHref(address) }
}

/** A space after a bare address links it; the space itself is no part of the link. */
export const linkFromAddress = new InputRule(/\S\s$/, (state, match, _start, end) => {
  const address = addressBefore(state, end)
  if (!address) return null
  const space = match[0].slice(-1)
  return state.tr
    .addMark(address.from, address.to, marks.link.create({ href: address.href }))
    .insertText(space, end)
    .removeMark(end, end + space.length, marks.link)
})

/** Enter after a bare address links it, and then does what Enter does. */
export function linkAtEnter(): Plugin {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key !== 'Enter' || event.shiftKey || event.metaKey || event.ctrlKey) return false
        const { empty, from } = view.state.selection
        const address = empty ? addressBefore(view.state, from) : null
        if (address) {
          const { href } = address
          view.dispatch(
            view.state.tr.addMark(address.from, address.to, marks.link.create({ href }))
          )
        }
        return false
      }
    }
  })
}
