import type { BrowserWindowConstructorOptions } from 'electron'

/** The part of electron-liquid-glass the window uses. */
export interface Glass {
  isGlassSupported(): boolean
  addView(handle: Buffer, options?: Record<string, never>): number
  unstable_setVariant(id: number, variant: number): void
  GlassMaterialVariant: { sidebar: number }
}

/**
 * On macOS 26 and later the window is clear, and the native Liquid Glass laid
 * behind the page (`applyGlass`) shows wherever the page paints nothing — the
 * sidebar and the top bar (`html[data-frosted]` in main.css). Vibrancy must not
 * be set as well: it would cover the glass. Older macOS keeps the sidebar
 * vibrancy. Elsewhere Electron's default is white, which flashes on launch and
 * shows through while resizing in dark mode; these are the two `--bg-canvas`
 * values.
 */
export function glassWindowOptions(
  platform: NodeJS.Platform,
  glass: Glass,
  dark: boolean
): BrowserWindowConstructorOptions {
  if (platform !== 'darwin') return { backgroundColor: dark ? '#1f2123' : '#eef2f6' }
  return glass.isGlassSupported() ? { transparent: true } : { vibrancy: 'sidebar' }
}

/**
 * Lays an `NSGlassEffectView` behind the page, in the sidebar material Finder's
 * sidebar is drawn in. Laying it again replaces the last one, so it is safe on
 * every load. The variant is set through a private API, the only way to it.
 */
export function applyGlass(glass: Glass, handle: Buffer): void {
  if (!glass.isGlassSupported()) return
  const id = glass.addView(handle, {})
  glass.unstable_setVariant(id, glass.GlassMaterialVariant.sidebar)
}
