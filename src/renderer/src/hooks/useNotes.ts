import { useState, useEffect, useCallback, useRef } from 'react'

export function useNotes() {
  const [notes, setNotes] = useState<Note[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refresh = useCallback(async () => {
    const result = searchQuery.trim()
      ? await window.api.notes.search(searchQuery)
      : await window.api.notes.list()
    setNotes(result)
  }, [searchQuery])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createNote = useCallback(async () => {
    const note = await window.api.notes.create('', '# ')
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

  const activeNote = notes.find((n) => n.id === activeId) ?? null

  return {
    notes,
    activeNote,
    activeId,
    setActiveId,
    searchQuery,
    setSearchQuery,
    createNote,
    updateNote,
    deleteNote,
    refresh
  }
}
