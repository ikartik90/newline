import { useSyncExternalStore } from 'react'
import { shortcutLabel } from '@/utils/keyboard-shortcut'

/** The keyboard cannot change under a running app — nothing to subscribe to. */
function subscribe(): () => void {
  return () => {}
}

/**
 * A shortcut written for the keyboard it will be typed on — `⌘K` here, `Ctrl K`
 * on a PC. Read through `useSyncExternalStore` so a render that has no keyboard
 * to ask (the fallback snapshot) settles on the ⌘ form and is corrected by a
 * re-render rather than a mismatch.
 */
export function useShortcutLabel(key: string): string {
  return useSyncExternalStore(
    subscribe,
    () => shortcutLabel(key),
    () => shortcutLabel(key, true)
  )
}
