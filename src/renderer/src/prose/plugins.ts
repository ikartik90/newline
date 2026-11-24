import { baseKeymap, chainCommands, exitCode } from 'prosemirror-commands'
import { dropCursor } from 'prosemirror-dropcursor'
import { gapCursor } from 'prosemirror-gapcursor'
import { history, redo, undo } from 'prosemirror-history'
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule
} from 'prosemirror-inputrules'
import { keymap } from 'prosemirror-keymap'
import { liftListItem, sinkListItem } from 'prosemirror-schema-list'
import { Fragment, Slice } from 'prosemirror-model'
import { Plugin, TextSelection, type Command } from 'prosemirror-state'
import { Decoration, DecorationSet } from 'prosemirror-view'
import { codeLanguage } from '@shared/mdx/reading'
import { codeBlocks } from './code-block'
import { isGivenLine, lastLine } from './last-line'
import { linkAtEnter, linkFromAddress } from './links'
import { listMarkers } from './list-markers'
import { mdxToProse } from './mdx-to-prose'
import { MediaSlots, mediaBlocks } from './media'
import { moving } from './moving'
import { numbering } from './numbering'
import { noteSchema } from './schema'
import { toggleWords } from './selection'
import { pastedSidenotes, sidenotes } from './sidenotes'
import { slash } from './slash'
import { splitItem, taskFromBox, toggleTask } from './tasks'

// ---------------------------------------------------------------------------
// What the note editor does as it is typed in: markdown's signs start their
// blocks, and the keys mark, break, list and undo.
// ---------------------------------------------------------------------------

const { nodes, marks } = noteSchema

/** Three dashes alone on a line: a rule in their place, and a line under it to go on from. */
const ruleFromDashes = new InputRule(/^---$/, (state, _match, start, end) => {
  const $start = state.doc.resolve(start)
  const line = $start.parent
  if (line.type !== nodes.paragraph || line.content.size !== end - start) return null
  const tr = state.tr.replaceWith($start.before(), $start.after(), [
    nodes.horizontal_rule.create(),
    nodes.paragraph.create()
  ])
  return tr.setSelection(TextSelection.near(tr.doc.resolve($start.before() + 2)))
})

const typing = inputRules({
  rules: [
    textblockTypeInputRule(/^(#{1,4})\s$/, nodes.heading, (match) => ({ level: match[1].length })),
    wrappingInputRule(/^>\s$/, nodes.blockquote),
    wrappingInputRule(/^[-*+]\s$/, nodes.bullet_list),
    wrappingInputRule(
      /^(\d+)[.)]\s$/,
      nodes.ordered_list,
      (match) => ({ start: Number(match[1]) }),
      // A number that follows on joins the list above it.
      (match, node) => node.childCount + node.attrs.start === Number(match[1])
    ),
    textblockTypeInputRule(/^```([a-z]*)\s$/, nodes.code_block, (match) => ({
      language: codeLanguage(match[1]) ?? null
    })),
    ruleFromDashes,
    taskFromBox,
    linkFromAddress
  ]
})

/** Step a block that stands in no list in or out, as Tab does to an item in one. */
const indent =
  (on: boolean): Command =>
  (state, dispatch) => {
    const { $from } = state.selection
    const block = $from.parent
    const steps =
      $from.depth === 1 && (block.type === nodes.paragraph || block.type === nodes.heading)
    if (steps && dispatch && block.attrs.indent !== on) {
      dispatch(state.tr.setNodeMarkup($from.before(), null, { ...block.attrs, indent: on }))
    }
    // Tab never leaves the note.
    return true
  }

const isList = (type: unknown): boolean => type === nodes.bullet_list || type === nodes.ordered_list

/** A block that follows a list steps in under the list's last item, as its own child. */
const stepUnder: Command = (state, dispatch) => {
  const { $from } = state.selection
  const depth = $from.depth
  const index = $from.index(depth - 1)
  const before = index > 0 ? $from.node(depth - 1).child(index - 1) : null
  if (!before || !isList(before.type)) return false
  if (dispatch) {
    const start = $from.before(depth)
    const block = $from.parent
    // The end of the last item's content: inside the list, inside the item.
    const under = start - 2
    const tr = state.tr.delete(start, start + block.nodeSize).insert(under, block)
    dispatch(tr.setSelection(TextSelection.create(tr.doc, under + 1 + $from.parentOffset)))
  }
  return true
}

/** The last block under a list's last item steps back out, to stand after the list. */
const stepOut: Command = (state, dispatch) => {
  const { $from } = state.selection
  const depth = $from.depth
  const item = $from.node(depth - 1)
  if (depth < 3 || item.type !== nodes.list_item) return false
  const list = $from.node(depth - 2)
  const lastChild = $from.index(depth - 1) === item.childCount - 1
  const lastItem = $from.index(depth - 2) === list.childCount - 1
  if ($from.index(depth - 1) === 0 || !lastChild || !lastItem) return false
  if (dispatch) {
    const start = $from.before(depth)
    const block = $from.parent
    const tr = state.tr.delete(start, start + block.nodeSize)
    // Past the end of the item and of the list.
    const after = start + 2
    tr.insert(after, block)
    // The line the list was given to go on from has the block in its place now.
    const end = after + block.nodeSize
    const given = tr.doc.nodeAt(end)
    if (depth === 3 && isGivenLine(given) && end + given!.nodeSize === tr.doc.content.size) {
      tr.delete(end, end + given!.nodeSize)
    }
    dispatch(tr.setSelection(TextSelection.create(tr.doc, after + 1 + $from.parentOffset)))
  }
  return true
}

const lineBreak: Command = (state, dispatch) => {
  dispatch?.(state.tr.replaceSelectionWith(nodes.hard_break.create()).scrollIntoView())
  return true
}

// The keys today's editor has: the other marks are the toolbar's.
const keys = keymap({
  'Mod-z': undo,
  'Shift-Mod-z': redo,
  'Mod-b': toggleWords(marks.strong),
  'Mod-i': toggleWords(marks.em),
  'Mod-u': toggleWords(marks.underline),
  Enter: splitItem,
  'Mod-Enter': toggleTask,
  Tab: chainCommands(stepUnder, sinkListItem(nodes.list_item), indent(true)),
  'Shift-Tab': chainCommands(stepOut, liftListItem(nodes.list_item), indent(false)),
  'Shift-Enter': chainCommands(exitCode, lineBreak)
})

/** A note that holds nothing but one empty line says where to begin. */
const placeholder = new Plugin({
  props: {
    decorations({ doc }) {
      const only = doc.childCount === 1 ? doc.firstChild : null
      if (only?.type !== nodes.paragraph || only.content.size > 0) return null
      return DecorationSet.create(doc, [
        Decoration.node(0, only.nodeSize, {
          class: 'editor-placeholder',
          'data-placeholder': 'Start writing…',
          'data-empty': ''
        })
      ])
    }
  }
})

/** Text pasted in is read as markdown, so what it says is what it becomes. */
const pasting = new Plugin({
  props: {
    clipboardTextParser(text, _context, plain) {
      if (plain) {
        const lines = text
          .split(/\r?\n/)
          .map((line) => nodes.paragraph.create(null, line ? [noteSchema.text(line)] : []))
        return Slice.maxOpen(nodes.doc.create(null, lines).content)
      }
      const read = mdxToProse(text)
      const only = read.childCount === 1 ? read.firstChild : null
      if (only?.type === nodes.paragraph) {
        // Markdown drops the spaces round a line: words pasted into a line keep theirs.
        const [before] = /^[ \t]*/.exec(text) ?? ['']
        const [after] = /[ \t]*$/.exec(text.trimStart()) ?? ['']
        const spaced = Fragment.fromArray([
          ...(before ? [noteSchema.text(before)] : []),
          ...only.content.content,
          ...(after ? [noteSchema.text(after)] : [])
        ])
        return Slice.maxOpen(Fragment.from(only.copy(spaced)))
      }
      // Open at its ends, so a line of words joins the line the caret is in.
      return Slice.maxOpen(read.content)
    },
    transformPasted: pastedSidenotes
  }
})

/** The editor's plugins. `media` is where the note's pictures and clips are listed for drawing. */
export function notePlugins(media: MediaSlots = new MediaSlots()): Plugin[] {
  return [
    slash(),
    placeholder,
    pasting,
    typing,
    linkAtEnter(),
    keys,
    keymap(baseKeymap),
    history(),
    listMarkers(),
    numbering(),
    lastLine(),
    codeBlocks(),
    mediaBlocks(media),
    sidenotes(),
    moving(),
    // The line a dragged block will land on, in the app's own ink.
    dropCursor({ class: 'bg-border-drop-line', color: false, width: 2 }),
    gapCursor()
  ]
}
