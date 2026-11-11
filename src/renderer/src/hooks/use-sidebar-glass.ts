import { useEffect } from 'react'

/**
 * Keeps AppKit's sidebar glass, which main lays under the page on macOS, as
 * wide as the sidebar: on mount, on every resize or collapse, and on a zoom,
 * which leaves the CSS width alone but changes it in points.
 */
export function useSidebarGlass(element: HTMLElement | null): void {
  useEffect(() => {
    if (!element || window.api.platform !== 'darwin') return
    const send = (): void =>
      window.api.window.setSidebarWidth(element.getBoundingClientRect().width)
    send()
    const observer = new ResizeObserver(send)
    observer.observe(element)
    window.addEventListener('resize', send)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', send)
    }
  }, [element])
}
