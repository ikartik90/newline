import { useEffect } from 'react'

/**
 * Keeps AppKit's sidebar glass, which main lays under the page on macOS, as
 * wide as the sidebar: on mount, on every resize or collapse, and on a zoom,
 * which leaves the CSS width alone but changes it in points.
 *
 * `minWidth` is the width the sidebar is opening to. The glass takes it at
 * once, rather than growing with the rail: the note pane's solid canvas hides
 * whatever of it the rail has not reached yet, so the sidebar never wipes in.
 */
export function useSidebarGlass(element: HTMLElement | null, minWidth = 0): void {
  useEffect(() => {
    if (!element || window.api.platform !== 'darwin') return
    const send = (): void =>
      window.api.window.setSidebarWidth(Math.max(element.getBoundingClientRect().width, minWidth))
    send()
    const observer = new ResizeObserver(send)
    observer.observe(element)
    window.addEventListener('resize', send)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', send)
    }
  }, [element, minWidth])
}

/**
 * Keeps AppKit's inspector glass, which main lays at the window's right edge
 * on macOS, as wide as the Gemma rail while it is open, and takes it away
 * once the rail closes.
 */
export function useRailGlass(element: HTMLElement | null): void {
  useEffect(() => {
    if (!element || window.api.platform !== 'darwin') return
    const { setRailWidth } = window.api.window
    const send = (): void => setRailWidth(element.getBoundingClientRect().width)
    send()
    const observer = new ResizeObserver(send)
    observer.observe(element)
    window.addEventListener('resize', send)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', send)
      setRailWidth(0)
    }
  }, [element])
}
