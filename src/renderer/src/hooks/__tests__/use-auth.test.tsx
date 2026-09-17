// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAuth } from '../useAuth'

// ---------------------------------------------------------------------------
// The hook between the sign-in screen and the two things a sign-in touches:
// the main process over `window.api.auth`, and Firebase. Both are stand-ins.
// ---------------------------------------------------------------------------

const firebase = vi.hoisted(() => ({
  onAuthStateChanged: vi.fn(() => () => {}),
  signInWithCredential: vi.fn(async () => {}),
  signInWithEmailAndPassword: vi.fn(async () => {}),
  createUserWithEmailAndPassword: vi.fn(async () => {}),
  signOut: vi.fn(async () => {}),
  GoogleAuthProvider: { credential: vi.fn((idToken: string) => ({ idToken })) }
}))
vi.mock('firebase/auth', () => firebase)
vi.mock('@/lib/firebase', () => ({ auth: { name: 'firebase-auth' } }))

const api = {
  googleSignIn: vi.fn(),
  cancelSignIn: vi.fn(async () => {}),
  current: vi.fn(async () => null),
  signOut: vi.fn(async () => {})
}

beforeEach(() => {
  vi.clearAllMocks()
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

describe('useAuth.signInWithGoogle', () => {
  it('asks main with no arguments, then signs into Firebase with the ID token it returns', async () => {
    api.googleSignIn.mockResolvedValueOnce({
      idToken: 'google-id-token',
      user: { id: 'u-1', email: 'me@example.com' }
    })
    const { result } = renderHook(() => useAuth())

    let outcome: boolean | undefined
    await act(async () => {
      outcome = await result.current.signInWithGoogle()
    })

    expect(api.googleSignIn).toHaveBeenCalledTimes(1)
    expect(api.googleSignIn).toHaveBeenCalledWith()
    expect(firebase.GoogleAuthProvider.credential).toHaveBeenCalledWith('google-id-token')
    expect(firebase.signInWithCredential).toHaveBeenCalledWith(
      { name: 'firebase-auth' },
      { idToken: 'google-id-token' }
    )
    expect(outcome).toBe(true)
  })

  it('resolves false, leaving Firebase alone, when main reports a cancellation', async () => {
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
    expect(firebase.signInWithCredential).not.toHaveBeenCalled()
  })

  it('passes every other failure on', async () => {
    api.googleSignIn.mockRejectedValueOnce(new Error('API request failed: invalid_code (401)'))
    const { result } = renderHook(() => useAuth())
    await expect(result.current.signInWithGoogle()).rejects.toThrow('invalid_code')
    expect(firebase.signInWithCredential).not.toHaveBeenCalled()
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
