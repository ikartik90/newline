// ---------------------------------------------------------------------------
// How a note is named and dated wherever it is listed — the sidebar's rows and
// the command menu's — so the two never disagree about what a note is called.
// ---------------------------------------------------------------------------

const TITLE_LENGTH = 40

/** What a list calls a note: its title, else its first line, else Untitled. */
export function noteDisplayTitle(note: Pick<Note, 'title' | 'plainText'>): string {
  if (note.title.trim()) return note.title.trim()
  const firstLine = (note.plainText ?? '').split('\n').find((line) => line.trim())
  return firstLine ? firstLine.trim().slice(0, TITLE_LENGTH) : 'Untitled'
}

/** How long ago `ms` was, in the largest unit that fits; a date past a month. */
export function formatRelativeTime(ms: number): string {
  const diff = Date.now() - ms
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ms).toLocaleDateString()
}
