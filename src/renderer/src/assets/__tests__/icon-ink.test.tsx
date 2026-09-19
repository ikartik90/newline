import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import SettingsIcon from '@/assets/icons/settings.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import InfoIcon from '@/assets/icons/info.svg'

// ---------------------------------------------------------------------------
// Icons are authored white and must reach the DOM as `currentColor`, so each
// one takes the ink of the control it sits in. SVGR's `replaceAttrValues` is an
// exact string match, and the icons say `white` rather than `#fff` — so a map
// covering only the hex spellings left 317 of 318 attributes painting pure
// white: invisible on the light canvas, and unable to follow hover or the
// pressed accent in either theme. See electron.vite.config.
// ---------------------------------------------------------------------------

// Vite reads the sources; the renderer's tsconfig has no Node types.
const ICON_SOURCES = import.meta.glob('../icons/*.svg', {
  query: '?raw',
  import: 'default',
  eager: true
}) as Record<string, string>

describe('icon ink', () => {
  it.each([
    ['settings', SettingsIcon],
    ['trash', TrashIcon],
    ['info', InfoIcon]
  ])('%s paints with currentColor, never a literal colour', (_name, Icon) => {
    const { container } = render(<Icon />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()

    for (const el of svg!.querySelectorAll('*')) {
      for (const attr of ['stroke', 'fill'] as const) {
        const value = el.getAttribute(attr)
        if (value === null || value === 'none') continue
        expect(value).toBe('currentColor')
      }
    }
  })

  it('has no icon whose colour spelling the transform would not replace', () => {
    const mapped = new Set(['white', '#fff', '#ffffff', 'currentColor', 'none'])
    const offenders: string[] = []

    for (const [path, source] of Object.entries(ICON_SOURCES)) {
      for (const [, value] of source.matchAll(/(?:stroke|fill)="([^"]*)"/g)) {
        if (!mapped.has(value)) offenders.push(`${path}: ${value}`)
      }
    }

    expect(offenders).toEqual([])
  })
})
