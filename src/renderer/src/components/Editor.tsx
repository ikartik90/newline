import { useEffect, useCallback, useRef } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import SlashCommand from '@/lib/slash-extension'
import { htmlToMarkdown, markdownToHtml } from '@/lib/markdown'

interface EditorProps {
  note: Note
  onUpdate: (fields: { body: string; title?: string }) => void
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      resolve(result.split(',')[1])
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function getExtension(file: File): string {
  const mime = file.type
  const map: Record<string, string> = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg'
  }
  return map[mime] ?? 'png'
}

export default function NoteEditor({ note, onUpdate }: EditorProps) {
  const titleRef = useRef<HTMLInputElement>(null)
  const skipNextUpdate = useRef(false)
  const noteIdRef = useRef(note.id)
  noteIdRef.current = note.id

  const handleImageInsert = useCallback(
    async (file: File, editor: ReturnType<typeof useEditor>) => {
      if (!editor) return

      const base64 = await fileToBase64(file)
      const ext = getExtension(file)
      const filename = await window.api.images.save(base64, ext, noteIdRef.current)
      const localUrl = `local://${filename}`

      editor.chain().focus().setImage({ src: localUrl }).run()
    },
    []
  )

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        codeBlock: false
      }),
      Placeholder.configure({
        placeholder: 'Start writing, or type / for commands…'
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({ openOnClick: false }),
      Image,
      SlashCommand
    ],
    content: markdownToHtml(note.body),
    onUpdate: ({ editor: ed }) => {
      if (skipNextUpdate.current) {
        skipNextUpdate.current = false
        return
      }
      const md = htmlToMarkdown(ed.getHTML())
      onUpdate({ body: md })
    },
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral dark:prose-invert max-w-none outline-none min-h-[calc(100vh-8rem)] px-1'
      },
      handleDrop: (view, event) => {
        const files = event.dataTransfer?.files
        if (files?.length) {
          for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
              event.preventDefault()
              handleImageInsert(file, editor)
              return true
            }
          }
        }
        return false
      },
      handlePaste: (view, event) => {
        const items = event.clipboardData?.items
        if (items) {
          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              event.preventDefault()
              const file = item.getAsFile()
              if (file) handleImageInsert(file, editor)
              return true
            }
          }
        }
        return false
      }
    }
  })

  useEffect(() => {
    if (!editor) return
    const currentMd = htmlToMarkdown(editor.getHTML())
    if (currentMd !== note.body) {
      skipNextUpdate.current = true
      editor.commands.setContent(markdownToHtml(note.body))
    }
  }, [note.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (titleRef.current) {
      titleRef.current.value = note.title
    }
  }, [note.id, note.title])

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onUpdate({ body: note.body, title: e.target.value })
    },
    [note.body, onUpdate]
  )

  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        editor?.commands.focus('start')
      }
    },
    [editor]
  )

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto py-12 px-6">
        <input
          ref={titleRef}
          defaultValue={note.title}
          onChange={handleTitleChange}
          onKeyDown={handleTitleKeyDown}
          placeholder="Untitled"
          className="w-full text-3xl font-bold bg-transparent border-none outline-none placeholder:text-neutral-300 dark:placeholder:text-neutral-700 mb-4 text-neutral-900 dark:text-neutral-100"
        />
        <EditorContent editor={editor} />
      </div>
    </div>
  )
}
