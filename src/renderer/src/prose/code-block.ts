import type { Node } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { CodeLanguageSchema, type CodeLanguage } from '@shared/mdx/dialect'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// A block of code as the editor draws it: the code itself, and over its corner
// the picker that says what language it is in, shown while the block has the
// caret. The picker is the block's own control, never part of its text.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

const LANGUAGE_LABELS: Record<CodeLanguage, string> = {
  html: 'HTML',
  css: 'CSS',
  json: 'JSON',
  javascript: 'JavaScript',
  jsx: 'JSX',
  typescript: 'TypeScript',
  tsx: 'TSX'
}

let pickers = 0

class CodeBlockView implements NodeView {
  dom = document.createElement('div')
  contentDOM = document.createElement('code')
  private picker = document.createElement('select')

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined
  ) {
    this.dom.className = 'relative group/code bg-level-1'
    const controls = document.createElement('div')
    controls.setAttribute('contenteditable', 'false')
    const id = `code-language-${(pickers += 1)}`
    const label = document.createElement('label')
    label.className = 'sr-only'
    label.htmlFor = id
    label.textContent = 'Code language'
    this.picker.id = id
    this.picker.className =
      'absolute top-2 right-2 z-[1] text-style-caption text-ink-body bg-bg-shell-default bg-level-2 border border-solid border-border-divider rounded-sm px-1 py-0.5 opacity-0 pointer-events-none transition-opacity duration-150 group-focus-within/code:opacity-100 group-focus-within/code:pointer-events-auto'
    this.picker.append(new Option('Plain text', ''))
    for (const language of CodeLanguageSchema.options) {
      this.picker.append(new Option(LANGUAGE_LABELS[language], language))
    }
    this.picker.addEventListener('change', () => {
      const position = this.getPos()
      if (position === undefined) return
      const language = this.picker.value || null
      this.view.dispatch(this.view.state.tr.setNodeMarkup(position, null, { language }))
    })
    controls.append(label, this.picker)
    const pre = document.createElement('pre')
    pre.className =
      'text-style-code bg-bg-sheet rounded-md p-8 overflow-x-auto text-ink-body whitespace-pre'
    pre.append(this.contentDOM)
    this.dom.append(controls, pre)
    this.picker.value = node.attrs.language ?? ''
  }

  update(node: Node): boolean {
    if (node.type !== nodes.code_block) return false
    this.picker.value = node.attrs.language ?? ''
    return true
  }

  // A press on the picker is the picker's own, not a click into the note.
  stopEvent(event: Event): boolean {
    return event.target === this.picker
  }

  ignoreMutation(mutation: { target: globalThis.Node }): boolean {
    return !this.contentDOM.contains(mutation.target) && mutation.target !== this.contentDOM
  }
}

export function codeBlocks(): Plugin {
  return new Plugin({
    props: {
      nodeViews: {
        code_block: (node, view, getPos) => new CodeBlockView(node, view, getPos)
      }
    }
  })
}
