import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { Document } from '@shared/domain/document'
import { ArticleEditor, type EditorSnapshot } from '@/components/article-editor'
import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'
import { useInputModality } from '@/hooks/use-input-modality'
import { useTheme } from '@/hooks/useTheme'
import './assets/main.css'

// ---------------------------------------------------------------------------
// A dev-only page for looking at the editor in a plain browser, outside the
// Electron shell and without signing in: `npm run dev`, then open
// http://localhost:5173/harness.html. Not part of the build (only index.html
// is), so nothing here ships.
// ---------------------------------------------------------------------------

const PIXEL =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFAB6F"/><stop offset="1" stop-color="#FF4D97"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>'
  )

const SAMPLE: Document = {
  type: 'doc',
  content: [
    {
      type: 'heading',
      level: 2,
      caption: 'Chapter one',
      children: [{ type: 'text', text: 'A subheading' }]
    },
    {
      type: 'paragraph',
      children: [
        { type: 'text', text: 'Body text with ' },
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ', ' },
        { type: 'text', text: 'italic', marks: [{ type: 'italic' }] },
        { type: 'text', text: ', ' },
        { type: 'text', text: 'code', marks: [{ type: 'code' }] },
        { type: 'text', text: ', a ' },
        { type: 'text', text: 'link', marks: [{ type: 'link', href: 'https://example.com' }] },
        { type: 'text', text: ', a ' },
        { type: 'text', text: 'highlight', marks: [{ type: 'highlight' }] },
        { type: 'text', text: ' and a ' },
        {
          type: 'text',
          text: 'sidenote',
          marks: [{ type: 'sidenote', id: 'sn-1', text: 'A margin note beside the prose.' }]
        },
        { type: 'text', text: '.' }
      ]
    },
    { type: 'list_item', children: [{ type: 'text', text: 'First numbered item' }] },
    { type: 'list_item', children: [{ type: 'text', text: 'Second numbered item' }] },
    { type: 'bullet_list_item', marker: 'check', children: [{ type: 'text', text: 'Done' }] },
    { type: 'bullet_list_item', children: [{ type: 'text', text: 'A plain bullet' }] },
    {
      type: 'blockquote',
      caption: 'Someone, somewhere',
      children: [{ type: 'text', text: 'A quote worth keeping.' }]
    },
    {
      type: 'metric',
      caption: 'Revenue',
      children: [{ type: 'text', text: '$377k' }],
      subtext: 'in the first year'
    },
    {
      type: 'code_block',
      language: 'typescript',
      children: [{ type: 'text', text: 'const answer: number = 42\nconsole.log(answer)' }]
    },
    { type: 'horizontal_rule' },
    {
      type: 'media',
      kind: 'image',
      src: PIXEL,
      width: 1600,
      height: 900,
      caption: 'A picture with a caption'
    },
    {
      type: 'link_card',
      config: {
        content: { title: 'Newline', meta: 'Project' },
        link: { kind: 'external', href: 'https://example.com' }
      }
    },
    {
      type: 'paragraph',
      children: [{ type: 'text', text: 'Type / on an empty line for the menu.' }]
    }
  ]
}

// The Electron bridge, as much of it as the editor reaches for.
Object.defineProperty(window, 'api', {
  value: {
    platform: 'darwin',
    media: {
      list: async () => [],
      upload: async () => {
        throw new Error('No uploads in the harness')
      },
      updateAlt: async () => {
        throw new Error('No library in the harness')
      },
      rename: async () => {
        throw new Error('No library in the harness')
      },
      delete: async () => {},
      uploadPoster: async () => null,
      flushPending: async () => 0
    }
  },
  configurable: true
})

function Harness() {
  useKeyboardFocus()
  useInputModality()
  // The harness is the documented way to look at the editor, so it has to be
  // able to show either theme — it followed neither the OS nor a choice.
  const { effectiveTheme, setTheme } = useTheme()
  const [snapshot, setSnapshot] = useState<EditorSnapshot | null>(null)
  return (
    <div className="h-screen flex flex-col bg-canvas text-fg">
      <div className="h-12 flex items-center px-4 text-style-caption text-fg-body/50 shrink-0">
        Harness · last change:{' '}
        {snapshot ? `${snapshot.document.content.length} blocks` : 'none yet'}
        <button
          type="button"
          onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
          className="ml-auto h-7 px-2 rounded-sm bg-field text-field-fg hover:bg-field-hover"
        >
          {effectiveTheme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </div>
      <main className="flex-1 overflow-y-auto px-5 pt-8 pb-20">
        <article>
          <ArticleEditor
            noteId="harness"
            initialTitle="Harness note"
            initialDocument={SAMPLE}
            onChange={setSnapshot}
          />
        </article>
      </main>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
