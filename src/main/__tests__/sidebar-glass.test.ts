import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  glassWindowOptions,
  isFrostedWindow,
  loadSidebarGlass,
  showRailGlass,
  showSidebarGlass,
  type SidebarGlassAddon
} from '../sidebar-glass'

const addon = (supported: boolean): SidebarGlassAddon => ({
  isSupported: () => supported,
  show: vi.fn(() => true),
  showRail: vi.fn(() => true),
  panelGlass: vi.fn(() => true),
  floatPanel: vi.fn(() => true),
  windowGlass: vi.fn(() => true)
})

describe('loadSidebarGlass', () => {
  it('loads nothing off macOS', () => {
    const load = vi.fn(() => addon(true))
    expect(loadSidebarGlass('win32', load)).toBeNull()
    expect(load).not.toHaveBeenCalled()
  })

  it('answers the add-on where macOS has AppKit’s sidebar glass', () => {
    const glass = addon(true)
    expect(loadSidebarGlass('darwin', () => glass)).toBe(glass)
  })

  it('answers nothing where the glass is not supported, or the add-on will not load', () => {
    expect(loadSidebarGlass('darwin', () => addon(false))).toBeNull()
    expect(
      loadSidebarGlass('darwin', () => {
        throw new Error('dlopen failed')
      })
    ).toBeNull()
  })
})

// os.release() as each answers it.
const WINDOWS_11_22H2 = '10.0.22621'
const WINDOWS_11_21H2 = '10.0.22000'
const WINDOWS_10 = '10.0.19045'
const MAC = '25.0.0'

describe('isFrostedWindow', () => {
  it('is glass on every Mac: AppKit’s, or the sidebar vibrancy', () => {
    expect(isFrostedWindow('darwin', MAC)).toBe(true)
  })

  it('is acrylic on Windows 11 from 22H2, the first to draw it behind a page', () => {
    expect(isFrostedWindow('win32', WINDOWS_11_22H2)).toBe(true)
    expect(isFrostedWindow('win32', WINDOWS_11_21H2)).toBe(false)
    expect(isFrostedWindow('win32', WINDOWS_10)).toBe(false)
  })

  it('is solid where the OS has no blur to show through', () => {
    expect(isFrostedWindow('linux', '6.8.0')).toBe(false)
  })
})

describe('glassWindowOptions', () => {
  it('keeps the page clear over AppKit’s glass, with no vibrancy over it', () => {
    expect(glassWindowOptions('darwin', addon(true), false, MAC)).toEqual({
      backgroundColor: '#00000000'
    })
  })

  it('falls back to the sidebar vibrancy on a Mac without the glass', () => {
    expect(glassWindowOptions('darwin', null, false, MAC)).toEqual({ vibrancy: 'sidebar' })
  })

  it('falls back to acrylic on Windows 11, the page clear over it', () => {
    expect(glassWindowOptions('win32', null, false, WINDOWS_11_22H2)).toEqual({
      backgroundMaterial: 'acrylic',
      backgroundColor: '#00000000'
    })
  })

  it('paints the canvas elsewhere, in the theme’s own shade', () => {
    expect(glassWindowOptions('win32', null, true, WINDOWS_10)).toEqual({
      backgroundColor: '#1f2123'
    })
    expect(glassWindowOptions('linux', null, false, '6.8.0')).toEqual({
      backgroundColor: '#eef2f6'
    })
  })
})

describe('showSidebarGlass', () => {
  const handle = Buffer.from([1])
  const window = (zoom: number) => ({
    getNativeWindowHandle: () => handle,
    webContents: { getZoomFactor: () => zoom }
  })

  it('lays the glass as wide as the sidebar, in points at the page’s zoom', () => {
    const glass = addon(true)
    showSidebarGlass(glass, window(1.25), 256)
    expect(glass.show).toHaveBeenCalledWith(handle, 320)
  })

  it('takes the glass away under a collapsed sidebar', () => {
    const glass = addon(true)
    showSidebarGlass(glass, window(1), 0)
    expect(glass.show).toHaveBeenCalledWith(handle, 0)
  })

  it('ignores a width that is not one', () => {
    const glass = addon(true)
    for (const width of [Number.NaN, -1, Infinity, '256' as unknown as number]) {
      showSidebarGlass(glass, window(1), width)
    }
    expect(glass.show).not.toHaveBeenCalled()
  })

  it('does nothing without the add-on', () => {
    expect(() => showSidebarGlass(null, window(1), 256)).not.toThrow()
  })
})

describe('showRailGlass', () => {
  const handle = Buffer.from([1])
  const window = (zoom: number) => ({
    getNativeWindowHandle: () => handle,
    webContents: { getZoomFactor: () => zoom }
  })

  it('lays the glass as wide as the Gemma rail, in points at the page’s zoom', () => {
    const glass = addon(true)
    showRailGlass(glass, window(1.25), 320)
    expect(glass.showRail).toHaveBeenCalledWith(handle, 400)
  })

  it('takes the glass away once the rail is closed', () => {
    const glass = addon(true)
    showRailGlass(glass, window(1), 0)
    expect(glass.showRail).toHaveBeenCalledWith(handle, 0)
  })

  it('ignores a width that is not one', () => {
    const glass = addon(true)
    for (const width of [Number.NaN, -1, Infinity, '320' as unknown as number]) {
      showRailGlass(glass, window(1), width)
    }
    expect(glass.showRail).not.toHaveBeenCalled()
  })

  it('does nothing without the add-on', () => {
    expect(() => showRailGlass(null, window(1), 320)).not.toThrow()
  })
})

const built = join(__dirname, '../../../out/native/sidebar-glass.node')

describe.skipIf(process.platform !== 'darwin' || !existsSync(built))('the built add-on', () => {
  const load = () => {
    const native = { exports: {} as SidebarGlassAddon }
    process.dlopen(native, built)
    return native.exports
  }

  it('answers whether this Mac has the glass', () => {
    expect(typeof load().isSupported()).toBe('boolean')
  })

  it('refuses a handle that is not a window’s', () => {
    expect(load().show(Buffer.alloc(8), 256)).toBe(false)
    expect(load().show('handle' as unknown as Buffer, 256)).toBe(false)
    expect(load().showRail(Buffer.alloc(8), 320)).toBe(false)
  })
})
