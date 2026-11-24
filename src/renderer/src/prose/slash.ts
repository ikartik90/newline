import { setBlockType, wrapIn } from 'prosemirror-commands'
import { wrapInList } from 'prosemirror-schema-list'
import { Plugin, PluginKey, TextSelection, type EditorState } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView } from 'prosemirror-view'
import type { SlashMenuBlockType } from '@/components/slash-menu'
import { itemKind } from './list-kind'
import { noteSchema } from './schema'
import { startTask } from './tasks'

// ---------------------------------------------------------------------------
// The block menu's half of the editor: a slash, and what is typed after it,
// is a question the menu answers. The plugin says where the slash stands and
// marks its block for the menu to open under; picking makes the block.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

/** A heading as the menu names it, by level: Heading 1 first. */
const HEADINGS: SlashMenuBlockType[] = ['heading_1', 'heading_2', 'heading_3', 'heading_4']

export interface SlashQuery {
  /** Where the slash stands, and where what was typed after it ends. */
  from: number
  to: number
  query: string
}

interface SlashState {
  active: SlashQuery | null
  /** A slash the menu was closed on: it stays closed while that slash stands. */
  dismissed: number | null
}

export const slashKey = new PluginKey<SlashState>('slash')

/** The slash question at the caret, if the caret stands at the end of one. */
function queryAt(state: EditorState): SlashQuery | null {
  const { $from, empty } = state.selection
  if (!empty || !$from.parent.isTextblock || $from.parent.type.spec.code) return null
  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
  const match = /(?:^|\s)\/([^\s/]*)$/.exec(before)
  if (!match) return null
  return { from: $from.pos - match[1].length - 1, to: $from.pos, query: match[1] }
}

export function slash(): Plugin<SlashState> {
  return new Plugin<SlashState>({
    key: slashKey,
    state: {
      init: () => ({ active: null, dismissed: null }),
      apply(transaction, was, _old, state) {
        const found = queryAt(state)
        const dismissed =
          transaction.getMeta(slashKey) === 'dismiss' ? (found?.from ?? null) : was.dismissed
        if (!found) return { active: null, dismissed: null }
        return { active: found.from === dismissed ? null : found, dismissed }
      }
    },
    props: {
      // The menu opens under the block the slash is in.
      decorations(state) {
        const active = slashKey.getState(state)?.active
        if (!active) return null
        const $slash = state.doc.resolve(active.from)
        return DecorationSet.create(state.doc, [
          Decoration.node($slash.before(), $slash.after(), { 'data-slash-anchor': '' })
        ])
      }
    }
  })
}

/** The kind of block the caret is in, as the menu names it, so it is not offered again. */
export function slashBlockAt(state: EditorState): SlashMenuBlockType | undefined {
  const { $from } = state.selection
  if ($from.parent.type === nodes.heading) return HEADINGS[$from.parent.attrs.level - 1]
  if ($from.parent.type === nodes.code_block) return 'code_block'
  return $from.depth === 1 ? 'paragraph' : undefined
}

export function dismissSlash(view: EditorView): void {
  view.dispatch(view.state.tr.setMeta(slashKey, 'dismiss'))
}

/**
 * Make the block picked from the menu, in place of the slash and what followed
 * it. A picture is not made here: the slash is cleared and the editor opens
 * the dialog it is picked from.
 */
export function pickSlashBlock(view: EditorView, type: SlashMenuBlockType): void {
  const active = slashKey.getState(view.state)?.active
  if (!active) return
  // The space that set the slash apart from the words before it goes with it.
  const $slash = view.state.doc.resolve(active.from)
  const spaced = /\s/.test($slash.parent.textBetween($slash.parentOffset - 1, $slash.parentOffset))
  view.dispatch(view.state.tr.delete(active.from - (spaced ? 1 : 0), active.to))
  const run = (command: ReturnType<typeof setBlockType>): void => {
    command(view.state, view.dispatch)
  }
  switch (type) {
    case 'heading_1':
    case 'heading_2':
    case 'heading_3':
    case 'heading_4':
      run(setBlockType(nodes.heading, { level: HEADINGS.indexOf(type) + 1 }))
      break
    case 'paragraph':
      run(setBlockType(nodes.paragraph))
      break
    case 'code_block':
      run(setBlockType(nodes.code_block))
      break
    case 'blockquote':
      run(wrapIn(nodes.blockquote))
      break
    case 'list_item':
    case 'bullet_list_item': {
      const kind = type === 'list_item' ? nodes.ordered_list : nodes.bullet_list
      // A line already in a list changes kind where it stands; any other starts a list.
      const changed = itemKind(view.state, kind)
      if (changed) view.dispatch(changed)
      else run(wrapInList(kind))
      break
    }
    case 'task_list_item':
      startTask(view)
      break
    case 'horizontal_rule': {
      const { $from } = view.state.selection
      const rule = nodes.horizontal_rule.create()
      // In place of a line that holds nothing, with a line under it to go on from.
      if ($from.parent.content.size === 0) {
        const tr = view.state.tr.replaceWith($from.before(), $from.after(), [
          rule,
          nodes.paragraph.create()
        ])
        view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve($from.before() + 2))))
      } else {
        view.dispatch(view.state.tr.insert($from.after(), rule))
      }
      break
    }
  }
  view.focus()
}
