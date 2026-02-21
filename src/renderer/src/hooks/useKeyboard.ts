import { useEffect } from 'react'

interface KeyboardActions {
  onNewNote: () => void
  onSearch: () => void
  onToggleSidebar: () => void
}

export function useKeyboard({ onNewNote, onSearch, onToggleSidebar }: KeyboardActions) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'n') {
        e.preventDefault()
        onNewNote()
      }

      if (mod && e.key === 'f') {
        e.preventDefault()
        onSearch()
      }

      if (mod && e.key === '\\') {
        e.preventDefault()
        onToggleSidebar()
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onNewNote, onSearch, onToggleSidebar])
}
