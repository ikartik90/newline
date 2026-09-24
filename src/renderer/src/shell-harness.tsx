import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { v4 as uuid } from 'uuid'
import {
  documentPlainText,
  EMPTY_DOCUMENT,
  parseDocument,
  serializeDocument
} from '@shared/domain/document'
import App from './App'
import './assets/main.css'

// ---------------------------------------------------------------------------
// A dev-only page for looking at the whole shell — the sidebar, the command
// menu, the dialogs — in a plain browser, without Electron and without signing
// in: `npm run dev`, then open http://localhost:5173/shell-harness.html. The
// Electron bridge is stood in for by an in-memory one: a signed-in user, a
// dozen notes, a search that matches words anywhere in a note, and a sync that
// always says yes. Not part of the build (only index.html is), so nothing here
// ships. `harness.html` is the editor alone.
// ---------------------------------------------------------------------------

const HOUR = 3_600_000
const DAY = 24 * HOUR

function paragraphs(...lines: string[]) {
  return serializeDocument({
    type: 'doc',
    content: lines.map((text) => ({ type: 'paragraph', children: [{ type: 'text', text }] }))
  })
}

function seed(title: string, body: string, tags: string[], age: number): Note {
  const now = Date.now()
  return {
    id: uuid(),
    title,
    body,
    plainText: documentPlainText(parseDocument(body)),
    tags,
    createdAt: now - age - DAY,
    updatedAt: now - age,
    lastSyncedAt: now - age,
    isDeleted: false
  }
}

const notes: Note[] = [
  seed('Groceries', paragraphs('Milk, eggs, bread, coffee beans.'), ['home'], 5 * 60_000),
  seed(
    'Reading list',
    paragraphs('Piranesi. The Overstory. A Pattern Language.'),
    ['books'],
    2 * HOUR
  ),
  seed('Sprint retro', paragraphs('What went well: the sync rewrite landed.'), ['work'], 6 * HOUR),
  seed('', paragraphs('An untitled thought about swiping rows aside.'), [], 9 * HOUR),
  seed('Trip to Kyoto', paragraphs('Fushimi Inari at dawn, then Arashiyama.'), ['travel'], DAY),
  seed(
    'Recipe: dal',
    paragraphs('Toor dal, turmeric, a tempering of cumin.'),
    ['home', 'food'],
    2 * DAY
  ),
  seed(
    'Interview notes',
    paragraphs('Strong on systems design, weaker on frontend.'),
    ['work'],
    3 * DAY
  ),
  seed('Garden plan', paragraphs('Tomatoes along the south wall.'), ['home'], 5 * DAY),
  seed('Talk outline', paragraphs('Local-first, and what it costs.'), ['work', 'writing'], 8 * DAY),
  seed('Quotes', paragraphs('Simplicity is prerequisite for reliability.'), ['writing'], 12 * DAY),
  seed('Bike maintenance', paragraphs('Chain wax every 300km.'), ['home'], 20 * DAY),
  seed('Ideas', paragraphs('A command menu. Swipe to delete.'), [], 45 * DAY)
]

const matches = (note: Note, term: string) =>
  [note.title, note.plainText, ...note.tags].some((field) => field.toLowerCase().includes(term))

const live = () => notes.filter((note) => !note.isDeleted)

Object.defineProperty(window, 'api', {
  value: {
    platform: 'darwin',
    notes: {
      list: async () => live().map((note) => ({ ...note })),
      search: async (query: string) => {
        const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
        return live()
          .filter((note) => terms.every((term) => matches(note, term)))
          .map((note) => ({ ...note }))
      },
      get: async (id: string) => live().find((note) => note.id === id) ?? null,
      create: async (title = '', body = serializeDocument(EMPTY_DOCUMENT)) => {
        const note = seed(title, body, [], 0)
        notes.unshift(note)
        return { ...note }
      },
      update: async (id: string, fields: { title?: string; body?: string; tags?: string[] }) => {
        const note = notes.find((n) => n.id === id)
        if (!note) return null
        if (fields.title !== undefined) note.title = fields.title
        if (fields.body !== undefined) {
          note.body = fields.body
          note.plainText = documentPlainText(parseDocument(fields.body))
        }
        if (fields.tags !== undefined) note.tags = fields.tags
        note.updatedAt = Date.now()
        return { ...note }
      },
      delete: async (id: string) => {
        const note = notes.find((n) => n.id === id)
        if (note) note.isDeleted = true
      }
    },
    theme: {
      setSource: async () => {}
    },
    sync: {
      now: async () => ({ pushed: 0, pulled: 0, ok: true }),
      pushNote: async () => true,
      status: async () => ({ pendingCount: 0, failedCount: 0, lastSyncedAt: Date.now() }),
      onChanged: () => () => {}
    },
    meta: {
      set: async () => {},
      get: async () => null
    },
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
    },
    auth: {
      googleSignIn: async () => ({ user: { id: 'harness', email: 'harness@example.com' } }),
      cancelSignIn: async () => {},
      current: async () => ({ id: 'harness', email: 'harness@example.com' }),
      signOut: async () => {}
    }
  },
  configurable: true
})

// In Electron the window itself is frosted glass and the page is clear over
// it (index.html marks `data-frosted`). A browser has no glass, so the
// harness stands a wallpaper behind the page and frosts the shell with CSS —
// a stand-in for the look, not the effect.
document.documentElement.dataset.frosted = ''
document.documentElement.dataset.frostPreview = ''
const preview = document.createElement('style')
preview.textContent = `
  html[data-frost-preview] body {
    background:
      radial-gradient(at 15% 20%, #ffab6f 0, transparent 45%),
      radial-gradient(at 85% 10%, #ff4d97 0, transparent 40%),
      radial-gradient(at 70% 80%, #4f7bff 0, transparent 50%),
      linear-gradient(160deg, #f5c7a9 0%, #c7a6ff 50%, #1f4fbf 100%);
    background-attachment: fixed;
  }
  html[data-frost-preview] #root > div {
    background: color-mix(in srgb, var(--bg-surface) 55%, transparent);
    backdrop-filter: blur(48px) saturate(1.6);
    -webkit-backdrop-filter: blur(48px) saturate(1.6);
  }
`
document.head.append(preview)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
