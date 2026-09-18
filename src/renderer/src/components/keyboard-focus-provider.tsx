import { useKeyboardFocus } from '@/hooks/use-keyboard-focus'

/** Mounts the keyboard-focus tracker once, at the root; renders nothing. */
export function KeyboardFocusProvider() {
  useKeyboardFocus()
  return null
}
