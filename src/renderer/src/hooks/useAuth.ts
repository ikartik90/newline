import { useState, useEffect, useCallback } from 'react'
import {
  onAuthStateChanged,
  signInWithCredential,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  GoogleAuthProvider,
  type User
} from 'firebase/auth'
import { isSignInCancelled } from '@shared/domain/auth'
import { auth } from '@/lib/firebase'

export function useAuth() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  /**
   * Main runs the sign-in in the user's browser and establishes the Worker
   * session; the ID token it hands back signs into Firebase. Resolves `true`
   * once signed in and `false` when the sign-in was cancelled — by the user
   * in the browser, or by `cancelGoogleSignIn` — which is not a failure.
   */
  const signInWithGoogle = useCallback(async (): Promise<boolean> => {
    let idToken: string
    try {
      ;({ idToken } = await window.api.auth.googleSignIn())
    } catch (error) {
      if (isSignInCancelled(error)) return false
      throw error
    }
    const credential = GoogleAuthProvider.credential(idToken)
    await signInWithCredential(auth, credential)
    return true
  }, [])

  /** End the sign-in under way, if any; its `signInWithGoogle` then resolves `false`. */
  const cancelGoogleSignIn = useCallback(async () => {
    await window.api.auth.cancelSignIn()
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }, [])

  const logout = useCallback(async () => {
    await window.api.auth.signOut()
    await signOut(auth)
  }, [])

  return {
    user,
    loading,
    signInWithGoogle,
    cancelGoogleSignIn,
    signInWithEmail,
    signUpWithEmail,
    logout
  }
}
