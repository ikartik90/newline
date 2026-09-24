import { useEffect, useState } from 'react'

/**
 * The notes that answer `query`, from main: every note for an empty query,
 * else the full-text search over titles, tags and text. Answers land out of
 * order over IPC, so one that arrives after the query has moved on is dropped
 * rather than shown over the newer one.
 */
export function useNoteSearch(query: string): Note[] {
  const [notes, setNotes] = useState<Note[]>([])
  const trimmed = query.trim()

  useEffect(() => {
    let live = true
    const request = trimmed ? window.api.notes.search(trimmed) : window.api.notes.list()
    void request.then((result) => {
      if (live) setNotes(result)
    })
    return () => {
      live = false
    }
  }, [trimmed])

  return notes
}
