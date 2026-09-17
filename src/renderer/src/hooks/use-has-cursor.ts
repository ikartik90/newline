import { useEffect, useState } from 'react'

/**
 * There is a cursor on this device — a mouse or a trackpad, not a finger.
 *
 * Inlined from kartik.to's `data/media-queries.ts` (its other queries drive a
 * bottom-sheet layout the desktop app does not have). Hover chrome and
 * keyboard-shortcut hints are an offer to a visitor who has the hardware to
 * take them up, and are noise on a touch-first device where there is no pointer
 * to reveal them with and no key to press. A stylesheet asking the same question
 * must use this exact string so the two cannot drift.
 */
export const HAS_CURSOR_QUERY = '(hover: hover) and (pointer: fine)'

/**
 * Whether this device has a cursor — a mouse or a trackpad, not a finger.
 *
 * Almost every affordance that splits on it can be drawn by CSS alone and
 * should be: a rule costs nothing and cannot be a commit behind. This exists
 * for the ones a stylesheet cannot answer — whether a field takes focus the
 * moment a dialog opens, whether a control is in the tree to be tabbed to at
 * all.
 *
 * Starts at `false` and corrects itself a commit later: the first render has
 * no device to ask yet, and touch is the safer of the two starting answers —
 * a keyboard hint that appears is a smaller lie than an autofocus that has
 * already opened a keyboard.
 */
export function useHasCursor(): boolean {
  const [hasCursor, setHasCursor] = useState(false)

  useEffect(() => {
    const query = window.matchMedia?.(HAS_CURSOR_QUERY)
    if (!query) return
    // The deliberate one-commit-later correction described above: this syncs to
    // the device, which is not a render-derived value.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasCursor(query.matches)
    // Live rather than read once — a tablet with a keyboard case attached
    // mid-session is the same device answering differently.
    const handleChange = (event: MediaQueryListEvent) => setHasCursor(event.matches)
    query.addEventListener?.('change', handleChange)
    return () => query.removeEventListener?.('change', handleChange)
  }, [])

  return hasCursor
}
