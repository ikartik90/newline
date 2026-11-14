import { useSyncExternalStore } from 'react'

// ---------------------------------------------------------------------------
// The window's own glass, for a dialog to stand on as the glass palette does.
// Where AppKit glasses the window (macOS 27 and later), a dialog holds the
// glass while it is open: main lays it over the whole window and the shell
// fades all it holds, so only the dialog stands over the glass. Nested dialogs
// share one hold.
// ---------------------------------------------------------------------------

let holds = 0
// The bridge's call that laid the glass, which lifts it too.
let laidBy: ((on: boolean) => void) | undefined
const listeners = new Set<() => void>()

/** Whether the window has a glass of its own to stand a dialog on. */
export function hasWindowGlass(): boolean {
  return typeof window.api?.window?.setGlass === 'function'
}

/** Stands something on the window's glass; the answer gives it back. */
export function holdWindowGlass(): () => void {
  holds += 1
  if (holds === 1) {
    laidBy = window.api?.window?.setGlass
    laidBy?.(true)
    listeners.forEach((listener) => listener())
  }
  let released = false
  return () => {
    if (released) return
    released = true
    holds -= 1
    if (holds > 0) return
    laidBy?.(false)
    laidBy = undefined
    listeners.forEach((listener) => listener())
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** Whether anything stands on the window's glass now. */
export function useWindowGlassHeld(): boolean {
  return useSyncExternalStore(subscribe, () => holds > 0)
}
