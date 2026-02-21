import { Extension } from '@tiptap/react'
import { Suggestion } from '@tiptap/suggestion'
import type { Editor, Range } from '@tiptap/react'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import tippy, { type Instance as TippyInstance } from 'tippy.js'
import SlashMenu, { type SlashMenuRef, slashMenuItems } from '../components/SlashMenu'

const slashPluginKey = new PluginKey('slash-command')

const SlashCommand = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        pluginKey: slashPluginKey,
        startOfLine: true,
        allow: ({ editor, state, range }: { editor: Editor; state: unknown; range: Range }) => {
          const $from = (state as { doc: { resolve: (pos: number) => { parentOffset: number } } }).doc.resolve(range.from)
          const textBefore = $from.parentOffset > 0
            ? (state as { doc: { textBetween: (a: number, b: number) => string } }).doc.textBetween(range.from - $from.parentOffset, range.from)
            : ''

          if (textBefore.endsWith('\\')) return false

          const isStartOfLine = textBefore.trim() === ''
          return isStartOfLine && editor.isEditable
        },
        items: ({ query }: { query: string }) =>
          slashMenuItems.filter(
            (item) =>
              item.title.toLowerCase().includes(query.toLowerCase()) ||
              item.description.toLowerCase().includes(query.toLowerCase())
          ),
        render: () => {
          let component: ReactRenderer<SlashMenuRef> | null = null
          let popup: TippyInstance[] | null = null

          return {
            onStart: (props: { editor: Editor; range: Range; query: string; clientRect?: (() => DOMRect | null) | null }) => {
              component = new ReactRenderer(SlashMenu, {
                props,
                editor: props.editor
              })

              if (!props.clientRect) return

              popup = tippy('body', {
                getReferenceClientRect: props.clientRect as () => DOMRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: 'manual',
                placement: 'bottom-start'
              })
            },
            onUpdate: (props: { editor: Editor; range: Range; query: string; clientRect?: (() => DOMRect | null) | null }) => {
              component?.updateProps(props)
              if (popup?.[0] && props.clientRect) {
                popup[0].setProps({
                  getReferenceClientRect: props.clientRect as () => DOMRect
                })
              }
            },
            onKeyDown: (props: { event: KeyboardEvent }) => {
              if (props.event.key === 'Escape') {
                popup?.[0]?.hide()
                return true
              }
              return component?.ref?.onKeyDown(props) ?? false
            },
            onExit: () => {
              popup?.[0]?.destroy()
              component?.destroy()
            }
          }
        }
      }
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion
      })
    ]
  }
})

export default SlashCommand
