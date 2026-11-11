import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  glassWindowOptions,
  loadSidebarGlass,
  showSidebarGlass,
  type SidebarGlassAddon
} from '../sidebar-glass'

const addon = (supported: boolean): SidebarGlassAddon => ({
  isSupported: () => supported,
  show: vi.fn(() => true)
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

describe('glassWindowOptions', () => {
  it('keeps the page clear over AppKit’s glass, with no vibrancy over it', () => {
    expect(glassWindowOptions('darwin', addon(true), false)).toEqual({
      backgroundColor: '#00000000'
    })
  })

  it('falls back to the sidebar vibrancy on a Mac without the glass', () => {
    expect(glassWindowOptions('darwin', null, false)).toEqual({ vibrancy: 'sidebar' })
  })

  it('paints the canvas elsewhere, in the theme’s own shade', () => {
    expect(glassWindowOptions('win32', null, true)).toEqual({ backgroundColor: '#1f2123' })
    expect(glassWindowOptions('linux', null, false)).toEqual({ backgroundColor: '#eef2f6' })
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
  })
})
