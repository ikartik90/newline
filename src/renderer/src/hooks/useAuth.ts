import { useState, useEffect, useCallback } from 'react'
import { isSignInCancelled, type AuthUser } from '@shared/domain/auth'

/**
 * Who is signed in, as main knows it. The session lives in the main process
 * (`window.api.auth`); this hook only mirrors the user it reports and asks
 * it to sign in or out.
 */
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let stale = false
    window.api.auth.current().then(
      (current) => {
        if (stale) return
        setUser(current)
        setLoading(false)
      },
      (error) => {
        console.warn('[auth] could not read the session:', error)
        if (!stale) setLoading(false)
      }
    )
    return () => {
      stale = true
    }
  }, [])

  /**
   * Main runs the sign-in in the user's browser and establishes the Worker
   * session. Resolves `true` once signed in and `false` when the sign-in was
   * cancelled — by the user in the browser, or by `cancelGoogleSignIn` —
   * which is not a failure.
   */
  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    let signedIn: AuthUser
    try {
      ;({ user: signedIn } = await window.api.auth.googleSignIn())
    } catch (error) {
      if (isSignInCancelled(error)) return false
      throw error
    }
    setUser(signedIn)
    return true
  }, [])

  /** End the sign-in under way, if any; its `signInWithGoogle` then resolves `false`. */
  const cancelGoogleSignIn = useCallback(async () => {
    await window.api.auth.cancelSignIn()
  }, [])

  const logout = useCallback(async () => {
    await window.api.auth.signOut()
    setUser(null)
  }, [])

  return {
    user,
    loading,
    signInWithGoogle,
    cancelGoogleSignIn,
    logout
  }
}
