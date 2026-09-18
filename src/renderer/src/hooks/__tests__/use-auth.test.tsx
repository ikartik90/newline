// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthUser } from '@shared/domain/auth'
import { resetAuthStore } from '@/store/auth'
import { useAuth } from '../useAuth'

// ---------------------------------------------------------------------------
// The hook between the sign-in screen and the main process, which holds the
// session behind `window.api.auth`. Main is a stand-in.
// ---------------------------------------------------------------------------

const me: AuthUser = { id: 'u-1', email: 'me@example.com' }

const api = {
  googleSignIn: vi.fn<() => Promise<{ user: AuthUser }>>(),
  cancelSignIn: vi.fn(async () => {}),
  current: vi.fn<() => Promise<AuthUser | null>>(async () => null),
  signOut: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
  resetAuthStore()
  api.current.mockResolvedValue(null)
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin', auth: api },
    writable: true,
    configurable: true
  })
})

afterEach(() => {
  Object.defineProperty(window, 'api', {
    value: { platform: 'darwin' },
    writable: true,
    configurable: true
  })
})

describe('useAuth on mount', () => {
  it('is loading until main answers, then holds the user main has', async () => {
    api.current.mockResolvedValueOnce(me)
    const { result } = renderHook(() => useAuth())
    expect(result.current.loading).toBe(true)
    expect(result.current.user).toBeNull()

    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toEqual(me)
    expect(api.current).toHaveBeenCalledTimes(1)
  })

  it('holds no user when main has no session', async () => {
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })

  it('stops loading, with no user, when main cannot answer', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    api.current.mockRejectedValueOnce(new Error('no database'))
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.loading).toBe(false))
    expect(result.current.user).toBeNull()
  })
})

describe('useAuth.signInWithGoogle', () => {
  it('asks main with no arguments and takes the user it answers with', async () => {
    api.googleSignIn.mockResolvedValueOnce({ user: me })
    const { result } = renderHook(() => useAuth())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.signInWithGoogle()
    })

    expect(api.googleSignIn).toHaveBeenCalledTimes(1)
    expect(api.googleSignIn).toHaveBeenCalledWith()
    expect(outcome).toBe(true)
    expect(result.current.user).toEqual(me)
  })

  it('resolves false, signing nobody in, when main reports a cancellation', async () => {
    api.googleSignIn.mockRejectedValueOnce(
      new Error(
        "Error invoking remote method 'auth:google': SignInCancelledError: Sign-in was cancelled"
      )
    )
    const { result } = renderHook(() => useAuth())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.signInWithGoogle()
    })

    expect(outcome).toBe(false)
    expect(result.current.user).toBeNull()
  })

  it('passes every other failure on', async () => {
    api.googleSignIn.mockRejectedValueOnce(new Error('API request failed: invalid_code (401)'))
    const { result } = renderHook(() => useAuth())
    await expect(result.current.signInWithGoogle()).rejects.toThrow('invalid_code')
    expect(result.current.user).toBeNull()
  })
})

describe('useAuth.cancelGoogleSignIn', () => {
  it('asks main to end the sign-in under way', async () => {
    const { result } = renderHook(() => useAuth())
    await act(async () => {
      await result.current.cancelGoogleSignIn()
    })
    expect(api.cancelSignIn).toHaveBeenCalledTimes(1)
  })
})

describe('useAuth is one state for every subscriber', () => {
  // The sign-in screen and the app shell call the hook separately; a sign-in
  // made through one has to reach the other, or the shell never leaves the
  // sign-in screen.
  it('shows a sign-in made through another subscriber, asking main only once', async () => {
    api.googleSignIn.mockResolvedValueOnce({ user: me })
    const screen = renderHook(() => useAuth())
    const shell = renderHook(() => useAuth())
    await waitFor(() => expect(shell.result.current.loading).toBe(false))
    expect(api.current).toHaveBeenCalledTimes(1)

    await act(async () => {
      await screen.result.current.signInWithGoogle()
    })

    expect(shell.result.current.user).toEqual(me)
    expect(screen.result.current.user).toEqual(me)
  })

  it('shows a sign-out made through another subscriber', async () => {
    api.current.mockResolvedValueOnce(me)
    const shell = renderHook(() => useAuth())
    const header = renderHook(() => useAuth())
    await waitFor(() => expect(shell.result.current.user).toEqual(me))

    await act(async () => {
      await header.result.current.logout()
    })

    expect(shell.result.current.user).toBeNull()
  })

  it('keeps the user for a subscriber mounted after the sign-in', async () => {
    api.googleSignIn.mockResolvedValueOnce({ user: me })
    const screen = renderHook(() => useAuth())
    await act(async () => {
      await screen.result.current.signInWithGoogle()
    })

    const late = renderHook(() => useAuth())
    expect(late.result.current.user).toEqual(me)
    expect(late.result.current.loading).toBe(false)
  })
})

describe('useAuth.logout', () => {
  it('asks main to end the session, then holds no user', async () => {
    api.current.mockResolvedValueOnce(me)
    const { result } = renderHook(() => useAuth())
    await waitFor(() => expect(result.current.user).toEqual(me))

    await act(async () => {
      await result.current.logout()
    })

    expect(api.signOut).toHaveBeenCalledTimes(1)
    expect(result.current.user).toBeNull()
  })
})
