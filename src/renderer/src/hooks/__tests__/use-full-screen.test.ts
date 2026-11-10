import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useFullScreen } from '../use-full-screen'

const originalApi = window.api
let listeners: Set<(fullScreen: boolean) => void>
let isFullScreen: ReturnType<typeof vi.fn>

beforeEach(() => {
  listeners = new Set()
  isFullScreen = vi.fn(async () => false)
  Object.defineProperty(window, 'api', {
    value: {
      platform: 'darwin',
      window: {
        isFullScreen,
        onFullScreenChange: (listener: (fullScreen: boolean) => void) => {
          listeners.add(listener)
          return () => listeners.delete(listener)
        }
      }
    },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  Object.defineProperty(window, 'api', { value: originalApi, writable: true, configurable: true })
})

describe('useFullScreen', () => {
  it('asks main whether the window is already in full screen', async () => {
    isFullScreen.mockResolvedValue(true)
    const { result } = renderHook(() => useFullScreen())
    await waitFor(() => expect(result.current).toBe(true))
  })

  it('follows the window in and out of full screen, and stops listening on unmount', async () => {
    const { result, unmount } = renderHook(() => useFullScreen())
    await waitFor(() => expect(isFullScreen).toHaveBeenCalled())
    act(() => listeners.forEach((listener) => listener(true)))
    expect(result.current).toBe(true)
    act(() => listeners.forEach((listener) => listener(false)))
    expect(result.current).toBe(false)
    unmount()
    expect(listeners.size).toBe(0)
  })

  it('lets a change that lands first win over the answer to the first ask', async () => {
    let answer: (value: boolean) => void = () => {}
    isFullScreen.mockReturnValue(new Promise<boolean>((resolve) => (answer = resolve)))
    const { result } = renderHook(() => useFullScreen())
    act(() => listeners.forEach((listener) => listener(true)))
    await act(async () => answer(false))
    expect(result.current).toBe(true)
  })
})
