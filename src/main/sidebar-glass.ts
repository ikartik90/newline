import { join } from 'node:path'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

/** The sidebar-glass add-on (native/sidebar-glass.mm, built by scripts/build-native.mjs). */
export interface SidebarGlassAddon {
  isSupported(): boolean
  /** Lays AppKit's sidebar `width` points wide under the page; under a point takes it away. */
  show(handle: Buffer, width: number): boolean
}

/** Loads the built add-on from out/native/, beside this bundle's out/main/. */
export function requireSidebarGlass(): SidebarGlassAddon {
  const native = { exports: {} as SidebarGlassAddon }
  process.dlopen(native, join(__dirname, '../native/sidebar-glass.node'))
  return native.exports
}

/** The add-on, where this Mac has AppKit's sidebar glass to lay under the page. */
export function loadSidebarGlass(
  platform: NodeJS.Platform,
  load: () => SidebarGlassAddon
): SidebarGlassAddon | null {
  if (platform !== 'darwin') return null
  try {
    const glass = load()
    return glass.isSupported() ? glass : null
  } catch {
    return null
  }
}

/**
 * With AppKit's glass the window keeps its own ground and the page is clear,
 * so the glass laid at the bottom of the window shows wherever the page paints
 * nothing: under the sidebar. A Mac without it gets the sidebar vibrancy over
 * the whole window instead. Elsewhere Electron's default is white, which
 * flashes on launch and shows through while resizing in dark mode; these are
 * the two `--bg-canvas` values.
 */
export function glassWindowOptions(
  platform: NodeJS.Platform,
  glass: SidebarGlassAddon | null,
  dark: boolean
): BrowserWindowConstructorOptions {
  if (platform !== 'darwin') return { backgroundColor: dark ? '#1f2123' : '#eef2f6' }
  return glass ? { backgroundColor: '#00000000' } : { vibrancy: 'sidebar' }
}

/** Lays the glass under a sidebar `cssWidth` CSS pixels wide, in points at the page's zoom. */
export function showSidebarGlass(
  glass: SidebarGlassAddon | null,
  window: Pick<BrowserWindow, 'getNativeWindowHandle'> & {
    webContents: Pick<BrowserWindow['webContents'], 'getZoomFactor'>
  },
  cssWidth: number
): void {
  if (!glass || typeof cssWidth !== 'number' || !Number.isFinite(cssWidth) || cssWidth < 0) return
  glass.show(window.getNativeWindowHandle(), cssWidth * window.webContents.getZoomFactor())
}
