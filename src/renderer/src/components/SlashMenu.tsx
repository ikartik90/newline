import { useState, useEffect, useCallback, useRef, useImperativeHandle, forwardRef } from 'react'
import type { Editor, Range } from '@tiptap/react'

export interface SlashMenuItem {
  title: string
  description: string
  command: (editor: Editor, range: Range) => void
}

const ITEMS: SlashMenuItem[] = [
  {
    title: 'Heading 1',
    description: 'Large heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 1 }).run()
  },
  {
    title: 'Heading 2',
    description: 'Medium heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 2 }).run()
  },
  {
    title: 'Heading 3',
    description: 'Small heading',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setNode('heading', { level: 3 }).run()
  },
  {
    title: 'Bullet List',
    description: 'Unordered list',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run()
  },
  {
    title: 'Numbered List',
    description: 'Ordered list',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run()
  },
  {
    title: 'Task List',
    description: 'Checkbox list',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run()
  },
  {
    title: 'Quote',
    description: 'Block quote',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run()
  },
  {
    title: 'Code Block',
    description: 'Fenced code',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run()
  },
  {
    title: 'Divider',
    description: 'Horizontal rule',
    command: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run()
  }
]

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface SlashMenuProps {
  editor: Editor
  range: Range
  query: string
}

const SlashMenu = forwardRef<SlashMenuRef, SlashMenuProps>(({ editor, range, query }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = ITEMS.filter(
    (item) =>
      item.title.toLowerCase().includes(query.toLowerCase()) ||
      item.description.toLowerCase().includes(query.toLowerCase())
  )

  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const selectItem = useCallback(
    (index: number) => {
      const item = filtered[index]
      if (item) {
        item.command(editor, range)
      }
    },
    [editor, range, filtered]
  )

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: { event: KeyboardEvent }) => {
      if (event.key === 'ArrowUp') {
        setSelectedIndex((i) => (i + filtered.length - 1) % filtered.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex((i) => (i + 1) % filtered.length)
        return true
      }
      if (event.key === 'Enter') {
        selectItem(selectedIndex)
        return true
      }
      return false
    }
  }))

  if (filtered.length === 0) return null

  return (
    <div
      ref={containerRef}
      className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 rounded-lg shadow-lg py-1 w-56 max-h-64 overflow-y-auto z-50"
    >
      {filtered.map((item, index) => (
        <button
          key={item.title}
          onClick={() => selectItem(index)}
          className={`w-full text-left px-3 py-1.5 flex flex-col transition-colors ${
            index === selectedIndex
              ? 'bg-neutral-100 dark:bg-neutral-800'
              : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <span className="text-sm font-medium text-neutral-800 dark:text-neutral-200">
            {item.title}
          </span>
          <span className="text-xs text-neutral-400 dark:text-neutral-500">
            {item.description}
          </span>
        </button>
      ))}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'

export default SlashMenu
export { ITEMS as slashMenuItems }
