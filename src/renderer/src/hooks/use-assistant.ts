import { useCallback, useEffect, useRef, useState } from 'react'
import type { AssistantMessage, AssistantModelStatus } from '@shared/domain/assistant'

// ---------------------------------------------------------------------------
// The renderer's side of the note assistant. Main owns the model and keeps
// the conversations; these hooks mirror its status and one note's turns, and
// follow a reply as it streams in.
// ---------------------------------------------------------------------------

export function useAssistantModel() {
  const [status, setStatus] = useState<AssistantModelStatus | null>(null)

  useEffect(() => {
    let live = true
    const unsubscribe = window.api.assistant.onStatus(setStatus)
    void window.api.assistant.status().then((s) => {
      if (live) setStatus(s)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const download = useCallback(() => void window.api.assistant.download(), [])
  const cancel = useCallback(() => void window.api.assistant.cancelDownload(), [])
  return { status, download, cancel }
}

/** A reply on its way: the turn just asked, and what has come back so far. */
export interface PendingReply {
  requestId: string
  prompt: string
  text: string
}

export function useAssistantChat(noteId: string | null) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [pending, setPending] = useState<PendingReply | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The note on screen now: a reply that lands after a switch is not shown.
  const noteRef = useRef(noteId)
  noteRef.current = noteId

  const reload = useCallback(async (id: string) => {
    const turns = await window.api.assistant.messages(id)
    if (noteRef.current === id) setMessages(turns)
  }, [])

  useEffect(() => {
    setMessages([])
    setPending(null)
    setError(null)
    if (noteId) void reload(noteId)
  }, [noteId, reload])

  useEffect(
    () =>
      window.api.assistant.onChunk(({ requestId, text }) => {
        setPending((p) => (p && p.requestId === requestId ? { ...p, text: p.text + text } : p))
      }),
    []
  )

  const send = useCallback(
    async (prompt: string) => {
      const text = prompt.trim()
      if (!noteId || !text || pending) return
      const requestId = crypto.randomUUID()
      setError(null)
      setPending({ requestId, prompt: text, text: '' })
      try {
        await window.api.assistant.send(noteId, text, requestId)
      } catch (e) {
        if (noteRef.current === noteId) {
          setError(e instanceof Error ? e.message : 'Gemma could not answer.')
        }
      } finally {
        await reload(noteId)
        if (noteRef.current === noteId) {
          setPending((p) => (p?.requestId === requestId ? null : p))
        }
      }
    },
    [noteId, pending, reload]
  )

  const stop = useCallback(() => {
    if (pending) void window.api.assistant.stop(pending.requestId)
  }, [pending])

  const clear = useCallback(async () => {
    if (!noteId) return
    await window.api.assistant.clear(noteId)
    await reload(noteId)
  }, [noteId, reload])

  return { messages, pending, error, send, stop, clear }
}
