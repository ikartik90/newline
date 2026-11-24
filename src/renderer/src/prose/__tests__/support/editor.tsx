import { act, render } from '@testing-library/react'
import type { EditorView } from 'prosemirror-view'
import { vi } from 'vitest'
import { ProseEditor } from '../../prose-editor'

// What a test of the editor needs to stand it up in jsdom and drive it.

/** jsdom lays nothing out and has no clipboard event: stand both in. Call from `beforeAll`. */
export function standInLayout(): void {
  const nowhere = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => nowhere as DOMRect
  vi.stubGlobal('ClipboardEvent', class extends Event {})
}

export function mount(mdx = '') {
  const onChange = vi.fn<(mdx: string) => void>()
  let view!: EditorView
  const { container } = render(
    <ProseEditor mdx={mdx} onChange={onChange} onReady={(ready) => (view = ready)} />
  )
  const written = (): string => onChange.mock.calls.at(-1)?.[0] ?? ''
  return { view, container, onChange, written }
}

/** Type as a keyboard does, a letter at a time, so the typing rules see it. */
export function type(view: EditorView, text: string): void {
  act(() => {
    for (const letter of text) {
      const { from, to } = view.state.selection
      const insert = () => view.state.tr.insertText(letter, from, to)
      const handled = view.someProp('handleTextInput', (handle) =>
        handle(view, from, to, letter, insert)
      )
      if (!handled) view.dispatch(insert())
    }
  })
}

export function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  act(() => {
    view.someProp('handleKeyDown', (handle) => handle(view, event))
  })
}

export const lines = (...rows: string[]): string => rows.join('\n') + '\n'

// jsdom is no Mac, so the editor's Mod key is Ctrl there; on a Mac it is Cmd.
export const MOD: KeyboardEventInit = { ctrlKey: true }
