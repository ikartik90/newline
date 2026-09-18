import { useEffect } from 'react'
import { useAuthStore } from '@/store/auth'

/**
 * Who is signed in, as main knows it. A view on the auth store: every caller
 * sees the same user, and the first one mounted asks main for the session.
 */
export function useAuth() {
  const user = useAuthStore((state) => state.user)
  const loading = useAuthStore((state) => state.loading)
  const signInWithGoogle = useAuthStore((state) => state.signInWithGoogle)
  const cancelGoogleSignIn = useAuthStore((state) => state.cancelGoogleSignIn)
  const logout = useAuthStore((state) => state.logout)

  useEffect(() => {
    void useAuthStore.getState().load()
  }, [])

  return {
    user,
    loading,
    signInWithGoogle,
    cancelGoogleSignIn,
    logout
  }
}
