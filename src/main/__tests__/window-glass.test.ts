import { describe, expect, it, vi } from 'vitest'
import { applyGlass, glassWindowOptions, type Glass } from '../window-glass'

const glass = (supported: boolean): Glass => ({
  isGlassSupported: () => supported,
  addView: vi.fn(() => 7),
  unstable_setVariant: vi.fn(),
  GlassMaterialVariant: { sidebar: 16 }
})

describe('glassWindowOptions', () => {
  it('leaves a macOS window clear for the native Liquid Glass, with no vibrancy over it', () => {
    expect(glassWindowOptions('darwin', glass(true), false)).toEqual({ transparent: true })
  })

  it('falls back to the sidebar vibrancy where macOS has no Liquid Glass', () => {
    expect(glassWindowOptions('darwin', glass(false), false)).toEqual({ vibrancy: 'sidebar' })
  })

  it('paints the canvas elsewhere, in the theme’s own shade', () => {
    expect(glassWindowOptions('win32', glass(false), true)).toEqual({ backgroundColor: '#1f2123' })
    expect(glassWindowOptions('linux', glass(false), false)).toEqual({
      backgroundColor: '#eef2f6'
    })
  })
})

describe('applyGlass', () => {
  const handle = Buffer.from([1])

  it('lays the native sidebar glass behind the page', () => {
    const g = glass(true)
    applyGlass(g, handle)
    expect(g.addView).toHaveBeenCalledWith(handle, {})
    expect(g.unstable_setVariant).toHaveBeenCalledWith(7, 16)
  })

  it('does nothing where there is no Liquid Glass', () => {
    const g = glass(false)
    applyGlass(g, handle)
    expect(g.addView).not.toHaveBeenCalled()
  })
})
