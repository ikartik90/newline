import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ProseEditor } from '@/prose/prose-editor'
import './assets/main.css'

// ---------------------------------------------------------------------------
// A dev-only page for the ProseMirror note editor while it is being built:
// `npm run dev`, then open http://localhost:5173/prose-harness.html. The note
// is on the left and the MDX it is saved as on the right, live. Not part of
// the build (only index.html is), so nothing here ships.
// ---------------------------------------------------------------------------

const PICTURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFAB6F"/><stop offset="1" stop-color="#FF4D97"/></linearGradient></defs><rect width="1600" height="900" fill="url(#g)"/></svg>'
  )

// The dialog a picture is picked from asks Electron for the library: here it
// has an empty one, and nothing can be uploaded.
Object.defineProperty(window, 'api', {
  value: {
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

const SAMPLE = `<BlockStyle size="sm" color="highlight">
  Field notes
</BlockStyle>

## A subheading

Prose with **bold**, *italic*, <u>underline</u>, ~~struck~~, <mark>highlight</mark>, \`code\`, a [link](https://example.com/) and a <Sidenote note="Beside the prose.">margin note</Sidenote>.

1. First number

   A line under the first

2. Second number

- A bullet
- Another

  - One inside it

> Quoted words
>
> Someone

<BlockStyle color="highlight">
  ## $377k
</BlockStyle>

\`\`\`typescript
const answer: number = 42
\`\`\`

![A sunset](${PICTURE} "A picture with its caption")

---

Type here: \`# \` starts a heading, \`- \` a list, \`> \` a quote.
`

function Harness() {
  // The app's own theme hook asks Electron; this page has only the class.
  const [dark, setDark] = useState(true)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])
  const [mdx, setMdx] = useState(SAMPLE)
  return (
    <div className="h-screen flex flex-col bg-bg-canvas text-ink-body">
      <div className="h-12 flex items-center px-4 text-style-caption text-ink-body/50 shrink-0">
        ProseMirror harness · the note, and the MDX it is saved as
        <button
          type="button"
          onClick={() => setDark(!dark)}
          className="ml-auto h-7 px-2 rounded-sm bg-bg-button-secondary-default text-ink-body hover:bg-bg-button-secondary-hover"
        >
          {dark ? 'Light theme' : 'Dark theme'}
        </button>
      </div>
      <div className="flex-1 min-h-0 flex">
        <main className="flex-1 min-w-0 overflow-y-auto px-(--size-note-inset) pt-8 pb-20">
          <article>
            <ProseEditor mdx={SAMPLE} onChange={setMdx} />
          </article>
        </main>
        <aside className="w-[420px] shrink-0 overflow-auto border-l border-border-divider p-4">
          <pre aria-label="MDX" className="text-style-code text-ink-body whitespace-pre-wrap">
            {mdx}
          </pre>
        </aside>
      </div>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Harness />
  </StrictMode>
)
