import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useShortcutLabel } from '../use-shortcut-label'

/** Claim the field the platform detection reads first; `afterEach` hands it back. */
function stubPlatform(platform: string) {
  Object.defineProperty(navigator, 'userAgentData', {
    value: { platform },
    configurable: true
  })
}

afterEach(() => {
  delete (navigator as { userAgentData?: unknown }).userAgentData
})

describe('useShortcutLabel', () => {
  it('writes the shortcut with ⌘ on Apple hardware', () => {
    stubPlatform('macOS')
    const { result } = renderHook(() => useShortcutLabel('K'))
    expect(result.current).toBe('⌘K')
  })

  it('writes it with Ctrl everywhere else', () => {
    stubPlatform('Windows')
    const { result } = renderHook(() => useShortcutLabel('K'))
    expect(result.current).toBe('Ctrl K')
  })

  it('follows the key it is asked about', () => {
    stubPlatform('macOS')
    const { result, rerender } = renderHook(({ key }) => useShortcutLabel(key), {
      initialProps: { key: 'K' }
    })
    expect(result.current).toBe('⌘K')
    rerender({ key: 'P' })
    expect(result.current).toBe('⌘P')
  })
})
