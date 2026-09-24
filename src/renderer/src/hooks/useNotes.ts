import { useState, useEffect, useCallback, useRef } from 'react'
import { EMPTY_DOCUMENT, serializeDocument } from '@shared/domain/document'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    setNotes(await window.api.notes.list())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createNote = useCallback(async () => {
    const note = await window.api.notes.create('', serializeDocument(EMPTY_DOCUMENT))
    await refresh()
    setActiveId(note.id)
    return note
  }, [refresh])

  const updateNote = useCallback(
    async (
      id: string,
      fields: { title?: string; body?: string; tags?: string[] }
    ): Promise<Note | null> => {
      setNotes((prev) =>
        prev.map((n) =>
          n.id === id
            ? {
                ...n,
                ...(fields.title !== undefined && { title: fields.title }),
                ...(fields.body !== undefined && { body: fields.body }),
                ...(fields.tags !== undefined && { tags: fields.tags }),
                updatedAt: Date.now()
              }
            : n
        )
      )

      const result = await window.api.notes.update(id, fields)

      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current)
      refreshTimerRef.current = setTimeout(refresh, 3000)

      return result
    },
    [refresh]
  )

  const deleteNote = useCallback(
    async (id: string) => {
      await window.api.notes.delete(id)
      if (activeId === id) {
        setActiveId(null)
      }
      await refresh()
    },
    [activeId, refresh]
  )

  /**
   * Open a note picked from outside the list — the command menu. `activeNote`
   * is read from the list, so a note the list has not caught up with yet is
   * put in it at once rather than opening onto nothing.
   */
  const openNote = useCallback((note: Note) => {
    setNotes((prev) => (prev.some((n) => n.id === note.id) ? prev : [note, ...prev]))
    setActiveId(note.id)
  }, [])

  const activeNote = notes.find((n) => n.id === activeId) ?? null

  return {
    notes,
    activeNote,
    activeId,
    setActiveId,
    openNote,
    createNote,
    updateNote,
    deleteNote,
    refresh
  }
}
