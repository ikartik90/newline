import { useState, useEffect, useCallback } from 'react'

type Theme = 'light' | 'dark' | 'system'

const SYSTEM_DARK = '(prefers-color-scheme: dark)'

/**
 * The chosen theme (`system` until the user picks one, remembered in
 * localStorage) and the one in force, which follows the OS while the choice
 * is `system`. Both are live state, so the toggle that offers "the other one"
 * re-renders when the OS switches underneath it.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(() => {
    return (localStorage.getItem('theme') as Theme) ?? 'system'
  })
  const [systemDark, setSystemDark] = useState(() => window.matchMedia(SYSTEM_DARK).matches)

  useEffect(() => {
    const mq = window.matchMedia(SYSTEM_DARK)
    const handler = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    setSystemDark(mq.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])

  const effectiveTheme: 'light' | 'dark' =
    theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.classList.toggle('dark', effectiveTheme === 'dark')
  }, [effectiveTheme])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('theme', t)
  }, [])

  return { theme, effectiveTheme, setTheme }
}
