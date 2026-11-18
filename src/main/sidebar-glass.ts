import { join } from 'node:path'
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

/** The sidebar-glass add-on (native/sidebar-glass.mm, built by scripts/build-native.mjs). */
export interface SidebarGlassAddon {
  isSupported(): boolean
  /** Lays AppKit's sidebar `width` points wide under the page; under a point takes it away. */
  show(handle: Buffer, width: number): boolean
  /**
   * Lays AppKit's inspector `width` points wide at the window's right edge,
   * under the page's Gemma rail; under a point takes it away.
   */
  showRail(handle: Buffer, width: number): boolean
  /**
   * Fills a clear window with Liquid Glass cornered at `radius` points, under
   * its page, filled with the popover material at opacity `fill`: 0 is bare
   * glass, 1 as solid as a popover. Called again, it sets the fill. The window
   * never becomes main, so the window it floats over stays lit, is shaped to
   * the glass's corner, and keeps a titled window's shadow without its rims.
   */
  panelGlass(handle: Buffer, radius: number, fill: number): boolean
  /**
   * Keeps a panel from becoming the main window, so the window it floats over
   * stays lit while it takes the keys, and up while another app has them.
   */
  floatPanel(handle: Buffer): boolean
  /** Lays the sidebar's glass over the whole window, the sidebar's own hidden under it, or takes it away. */
  windowGlass(handle: Buffer, on: boolean): boolean
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

/** The flag main hands a window that is see-through glass under its page. */
export const FROSTED_WINDOW_ARG = '--frosted-window'

/** Windows 11 22H2, the first build to draw acrylic behind a window's page. */
const ACRYLIC_BUILD = 22621

/**
 * Whether the window is the OS's own blur under a clear page: AppKit's glass
 * or the sidebar vibrancy on a Mac, acrylic on Windows 11. `release` is
 * os.release(), whose third part is a Windows build.
 */
export function isFrostedWindow(platform: NodeJS.Platform, release: string): boolean {
  if (platform === 'darwin') return true
  if (platform !== 'win32') return false
  return Number(release.split('.')[2]) >= ACRYLIC_BUILD
}

/**
 * With AppKit's glass the window keeps its own ground and the page is clear,
 * so the glass laid at the bottom of the window shows wherever the page paints
 * nothing: under the sidebar. A Mac without it gets the sidebar vibrancy over
 * the whole window instead, and Windows 11 acrylic: the OS's own blur either
 * way. Elsewhere Electron's default is white, which flashes on launch and
 * shows through while resizing in dark mode; these are the two
 * `--bg-canvas` values.
 */
export function glassWindowOptions(
  platform: NodeJS.Platform,
  glass: SidebarGlassAddon | null,
  dark: boolean,
  release: string
): BrowserWindowConstructorOptions {
  if (platform === 'darwin') {
    return glass ? { backgroundColor: '#00000000' } : { vibrancy: 'sidebar' }
  }
  if (isFrostedWindow(platform, release)) {
    return { backgroundMaterial: 'acrylic', backgroundColor: '#00000000' }
  }
  return { backgroundColor: dark ? '#1f2123' : '#eef2f6' }
}

type GlassWindow = Pick<BrowserWindow, 'getNativeWindowHandle'> & {
  webContents: Pick<BrowserWindow['webContents'], 'getZoomFactor'>
}

/** `cssWidth` in points at the page's zoom, or null when it is not a width. */
function points(window: GlassWindow, cssWidth: number): number | null {
  if (typeof cssWidth !== 'number' || !Number.isFinite(cssWidth) || cssWidth < 0) return null
  return cssWidth * window.webContents.getZoomFactor()
}

/** Lays the glass under a sidebar `cssWidth` CSS pixels wide, in points at the page's zoom. */
export function showSidebarGlass(
  glass: SidebarGlassAddon | null,
  window: GlassWindow,
  cssWidth: number
): void {
  const width = points(window, cssWidth)
  if (glass && width !== null) glass.show(window.getNativeWindowHandle(), width)
}

/** Lays the glass under the Gemma rail, `cssWidth` CSS pixels wide at the window's right edge. */
export function showRailGlass(
  glass: SidebarGlassAddon | null,
  window: GlassWindow,
  cssWidth: number
): void {
  const width = points(window, cssWidth)
  if (glass && width !== null) glass.showRail(window.getNativeWindowHandle(), width)
}
