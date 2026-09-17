// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AuthScreen from '../AuthScreen'

// ---------------------------------------------------------------------------
// The sign-in screen over a stand-in for `useAuth`: what it shows while the
// browser holds the sign-in, and how it takes a cancel or a failure.
// ---------------------------------------------------------------------------

const hook = vi.hoisted(() => ({
  signInWithGoogle: vi.fn<() => Promise<boolean>>(),
  cancelGoogleSignIn: vi.fn(async () => {}),
  signInWithEmail: vi.fn(async () => {}),
  signUpWithEmail: vi.fn(async () => {})
}))
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => hook }))

/** A sign-in the test finishes by hand, the way the browser would. */
function pendingSignIn(): { finish: (outcome: boolean) => void; fail: (error: Error) => void } {
  let finish!: (outcome: boolean) => void
  let fail!: (error: Error) => void
  hook.signInWithGoogle.mockReturnValueOnce(
    new Promise<boolean>((resolve, reject) => {
      finish = resolve
      fail = reject
    })
  )
  return { finish, fail }
}

const googleButton = () => screen.queryByRole('button', { name: /continue with google/i })
const cancelButton = () => screen.queryByRole('button', { name: /cancel/i })
const browserLine = () => screen.queryByText(/finish signing in in your browser/i)

beforeEach(() => {
  vi.clearAllMocks()
})

describe('AuthScreen', () => {
  it('offers Google and the email form at rest', () => {
    render(<AuthScreen />)
    expect(googleButton()).toBeTruthy()
    expect(screen.getByPlaceholderText('Email')).toBeTruthy()
    expect(screen.getByPlaceholderText('Password')).toBeTruthy()
    expect(browserLine()).toBeNull()
    expect(cancelButton()).toBeNull()
  })

  it('swaps the Google button for the browser line and a Cancel while the sign-in is pending', async () => {
    const signIn = pendingSignIn()
    render(<AuthScreen />)

    await userEvent.click(googleButton()!)
    expect(hook.signInWithGoogle).toHaveBeenCalledTimes(1)
    expect(googleButton()).toBeNull()
    expect(browserLine()).toBeTruthy()
    expect(cancelButton()).toBeTruthy()

    await act(async () => signIn.finish(true))
    expect(googleButton()).toBeTruthy()
    expect(browserLine()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('holds the email form while the browser has the sign-in', async () => {
    pendingSignIn()
    render(<AuthScreen />)
    await userEvent.click(googleButton()!)
    expect((screen.getByRole('button', { name: 'Sign in' }) as HTMLButtonElement).disabled).toBe(
      true
    )
  })

  it('Cancel asks the hook to end the sign-in, and a cancellation shows no error', async () => {
    const signIn = pendingSignIn()
    render(<AuthScreen />)
    await userEvent.click(googleButton()!)

    await userEvent.click(cancelButton()!)
    expect(hook.cancelGoogleSignIn).toHaveBeenCalledTimes(1)

    await act(async () => signIn.finish(false))
    expect(googleButton()).toBeTruthy()
    expect(cancelButton()).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('shows why a sign-in failed and offers Google again', async () => {
    const signIn = pendingSignIn()
    render(<AuthScreen />)
    await userEvent.click(googleButton()!)

    await act(async () => signIn.fail(new Error('API request failed: invalid_code (401)')))
    expect(screen.getByRole('alert').textContent).toContain('invalid_code')
    expect(googleButton()).toBeTruthy()
    expect(cancelButton()).toBeNull()
  })

  it('clears an earlier error when Google is tried again', async () => {
    const first = pendingSignIn()
    render(<AuthScreen />)
    await userEvent.click(googleButton()!)
    await act(async () => first.fail(new Error('Boom')))
    expect(screen.getByRole('alert')).toBeTruthy()

    pendingSignIn()
    await userEvent.click(googleButton()!)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
