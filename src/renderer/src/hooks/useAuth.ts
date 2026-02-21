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
import { auth } from '@/lib/firebase'

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ?? ''
const AUTH_DOMAIN = import.meta.env.VITE_FIREBASE_AUTH_DOMAIN ?? ''

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

  const signInWithGoogle = useCallback(async () => {
    const idToken = await window.api.auth.googleSignIn(GOOGLE_CLIENT_ID, AUTH_DOMAIN)
    const credential = GoogleAuthProvider.credential(idToken)
    await signInWithCredential(auth, credential)
  }, [])

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
  }, [])

  const signUpWithEmail = useCallback(async (email: string, password: string) => {
    await createUserWithEmailAndPassword(auth, email, password)
  }, [])

  const logout = useCallback(async () => {
    await signOut(auth)
  }, [])

  return { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, logout }
}
