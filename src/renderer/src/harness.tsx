import { StrictMode, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { mdxDestination } from '@shared/mdx/dialect'
import { MdxNoteEditor, type MdxNoteSnapshot } from '@/prose/note-editor'
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

const SAMPLE = `<BlockStyle size="sm" color="highlight">
  Chapter one
</BlockStyle>

## A subheading

Body text with **bold**, *italic*, \`code\`, a [link](https://example.com), a <mark>highlight</mark> and a <Sidenote note="A margin note beside the prose.">sidenote</Sidenote>.

<BlockStyle align="center">
  A line set to the centre.
</BlockStyle>

1. First numbered item
2. Second numbered item

- [x] A task that is done
- [ ] A task still to do
- A plain bullet

> A quote worth keeping.
>
> Someone, somewhere

Revenue

<BlockStyle color="highlight">
  ## $377k
</BlockStyle>

in the first year

\`\`\`typescript
const answer: number = 42
console.log(answer)
\`\`\`

---

![](${mdxDestination(PIXEL)} "A picture with a caption")

Type / on an empty line for the menu.
`

// The Electron bridge, as much of it as the editor reaches for.
Object.defineProperty(window, 'api', {
  value: {
    platform: 'darwin',
    frosted: true,
    theme: {
      setSource: async () => {}
    },
    media: {
      // The library knows the sample picture's shape, as it knows an upload's.
      list: async () => [
        {
          key: 'sample',
          url: PIXEL,
          filename: 'sample.svg',
          contentType: 'image/svg+xml',
          size: PIXEL.length,
          width: 1600,
          height: 900
        }
      ],
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
  const [snapshot, setSnapshot] = useState<MdxNoteSnapshot | null>(null)
  return (
    <div className="h-screen flex flex-col bg-bg-canvas text-ink-body">
      <div className="h-12 flex items-center px-4 text-style-caption text-ink-body/50 shrink-0">
        Harness · last change:{' '}
        {snapshot ? `${snapshot.mdx.split('\n').length} lines of MDX` : 'none yet'}
        <button
          type="button"
          onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
          className="ml-auto h-7 px-2 rounded-sm bg-bg-button-secondary-default text-ink-body hover:bg-bg-button-secondary-hover"
        >
          {effectiveTheme === 'dark' ? 'Light theme' : 'Dark theme'}
        </button>
      </div>
      <main className="flex-1 overflow-y-auto px-(--size-note-inset) pt-8 pb-20">
        <article>
          <MdxNoteEditor
            noteId="harness"
            initialTitle="Harness note"
            initialMdx={SAMPLE}
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
