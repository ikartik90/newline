import { useCallback, useEffect, useRef, useState } from 'react'
import {
  AssistantEffortSchema,
  DEFAULT_EFFORT,
  type AssistantEffort,
  type AssistantMessage,
  type AssistantModelCopy,
  type AssistantModelStatus,
  type AssistantUsage
} from '@shared/domain/assistant'

// ---------------------------------------------------------------------------
// The renderer's side of the note assistant. Main owns the model and keeps
// the conversations; these hooks mirror its status and one note's turns, and
// follow a reply as it streams in.
// ---------------------------------------------------------------------------

const IPC_PREFIX = /^Error invoking remote method '[^']*': (?:\w*Error: )?/

/** A main-side error's own words, without the wrapping Electron gives it over IPC. */
function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message.replace(IPC_PREFIX, '') : fallback
}

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

  const cancel = useCallback(() => void window.api.assistant.cancelDownload(), [])
  return { status, cancel }
}

const EFFORT_KEY = 'assistantEffort'

function storedEffort(): AssistantEffort {
  const parsed = AssistantEffortSchema.safeParse(localStorage.getItem(EFFORT_KEY))
  return parsed.success ? parsed.data : DEFAULT_EFFORT
}

/** How hard Gemma thinks, remembered on this device for every note. */
export function useAssistantEffort(): [AssistantEffort, (effort: AssistantEffort) => void] {
  const [effort, setEffort] = useState(storedEffort)
  const choose = useCallback((next: AssistantEffort) => {
    localStorage.setItem(EFFORT_KEY, next)
    setEffort(next)
  }, [])
  return [effort, choose]
}

/** A reply on its way: the turn just asked, and what has come back so far. */
export interface PendingReply {
  requestId: string
  prompt: string
  text: string
}

export function useAssistantChat(noteId: string | null) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [usage, setUsage] = useState<AssistantUsage | null>(null)
  const [pending, setPending] = useState<PendingReply | null>(null)
  const [error, setError] = useState<string | null>(null)
  // The note on screen now: a reply that lands after a switch is not shown.
  const noteRef = useRef(noteId)
  noteRef.current = noteId

  const refreshUsage = useCallback(async () => {
    const id = noteRef.current
    if (!id) return
    const counted = await window.api.assistant.usage(id)
    if (noteRef.current === id) setUsage(counted)
  }, [])

  const reload = useCallback(
    async (id: string) => {
      const turns = await window.api.assistant.messages(id)
      if (noteRef.current === id) setMessages(turns)
      await refreshUsage()
      return turns
    },
    [refreshUsage]
  )

  useEffect(() => {
    setMessages([])
    setUsage(null)
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

  /**
   * Ask about the note. Resolves to whether main kept the prompt: false when it
   * failed, or was stopped while the model was still downloading.
   */
  const send = useCallback(
    async (prompt: string, effort: AssistantEffort): Promise<boolean> => {
      const text = prompt.trim()
      if (!noteId || !text || pending) return false
      const requestId = crypto.randomUUID()
      const before = messages.length
      setError(null)
      setPending({ requestId, prompt: text, text: '' })
      try {
        await window.api.assistant.send(noteId, text, requestId, effort)
      } catch (e) {
        if (noteRef.current === noteId) setError(errorMessage(e, 'Gemma could not answer.'))
      }
      const turns = await reload(noteId)
      if (noteRef.current === noteId) {
        setPending((p) => (p?.requestId === requestId ? null : p))
      }
      return turns.length > before
    },
    [noteId, pending, messages.length, reload]
  )

  const stop = useCallback(() => {
    if (pending) void window.api.assistant.stop(pending.requestId)
  }, [pending])

  return { messages, usage, pending, error, send, stop, refreshUsage }
}

/** The copies of the model on this machine, listed while Settings shows them. */
export function useAssistantModels(shown: boolean) {
  const [copies, setCopies] = useState<AssistantModelCopy[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setCopies(await window.api.assistant.models())
  }, [])

  useEffect(() => {
    if (!shown) return
    setError(null)
    void reload()
  }, [shown, reload])

  const remove = useCallback(
    async (path: string) => {
      setError(null)
      try {
        await window.api.assistant.deleteModel(path)
      } catch (e) {
        setError(errorMessage(e, 'The model could not be deleted.'))
      }
      await reload()
    },
    [reload]
  )

  return { copies, error, remove }
}
