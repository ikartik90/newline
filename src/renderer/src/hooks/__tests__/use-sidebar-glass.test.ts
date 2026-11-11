import { renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useSidebarGlass } from '../use-sidebar-glass'

const originalApi = window.api
const OriginalResizeObserver = globalThis.ResizeObserver
let setSidebarWidth: ReturnType<typeof vi.fn>
let observers: { callback: () => void; observed: Element[]; disconnected: boolean }[]

const sidebar = (width: number) => {
  const element = document.createElement('aside')
  element.getBoundingClientRect = () => ({ width }) as DOMRect
  return element
}

beforeEach(() => {
  setSidebarWidth = vi.fn()
  observers = []
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin', window: { setSidebarWidth } },
    writable: true,
    configurable: true
  })
  globalThis.ResizeObserver = class {
    private entry
    constructor(callback: () => void) {
      this.entry = { callback, observed: [] as Element[], disconnected: false }
      observers.push(this.entry)
    }
    observe(element: Element) {
      this.entry.observed.push(element)
    }
    unobserve() {}
    disconnect() {
      this.entry.disconnected = true
    }
  } as unknown as typeof ResizeObserver
})

afterEach(() => {
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
  globalThis.ResizeObserver = OriginalResizeObserver
})

describe('useSidebarGlass', () => {
  it('tells main how wide the sidebar is as soon as it is mounted', () => {
    const element = sidebar(256)
    renderHook(() => useSidebarGlass(element))
    expect(setSidebarWidth).toHaveBeenCalledWith(256)
    expect(observers[0].observed).toEqual([element])
  })

  it('tells main again whenever the sidebar is resized or collapsed', () => {
    let width = 256
    const element = document.createElement('aside')
    element.getBoundingClientRect = () => ({ width }) as DOMRect
    renderHook(() => useSidebarGlass(element))
    width = 300
    observers[0].callback()
    width = 0
    observers[0].callback()
    expect(setSidebarWidth.mock.calls.map(([w]) => w)).toEqual([256, 300, 0])
  })

  it('tells main again when the page is zoomed, which changes the width in points', () => {
    renderHook(() => useSidebarGlass(sidebar(256)))
    window.dispatchEvent(new Event('resize'))
    expect(setSidebarWidth).toHaveBeenCalledTimes(2)
  })

  it('stops watching when unmounted', () => {
    const { unmount } = renderHook(() => useSidebarGlass(sidebar(256)))
    unmount()
    window.dispatchEvent(new Event('resize'))
    expect(observers[0].disconnected).toBe(true)
    expect(setSidebarWidth).toHaveBeenCalledTimes(1)
  })

  it('waits for the sidebar to be mounted', () => {
    const element = sidebar(256)
    const { rerender } = renderHook(({ el }) => useSidebarGlass(el), {
      initialProps: { el: null as HTMLElement | null }
    })
    expect(setSidebarWidth).not.toHaveBeenCalled()
    rerender({ el: element })
    expect(setSidebarWidth).toHaveBeenCalledWith(256)
  })

  it('stays quiet off macOS, where nothing lies under the sidebar', () => {
    window.api.platform = 'win32'
    renderHook(() => useSidebarGlass(sidebar(256)))
    expect(setSidebarWidth).not.toHaveBeenCalled()
  })
})
