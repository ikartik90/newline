import { create } from 'zustand'
import { isSignInCancelled, type AuthUser } from '@shared/domain/auth'

// ---------------------------------------------------------------------------
// Who is signed in, as main knows it, held once for the whole renderer. The
// session itself lives in the main process behind `window.api.auth`; this
// store mirrors the user it reports and asks it to sign in or out. One store
// rather than hook state, because the sign-in screen and the app shell
// subscribe separately and a sign-in made through one must reach the other.
// ---------------------------------------------------------------------------

interface AuthStore {
  user: AuthUser | null
  /** True until main has answered `current()` once. */
  loading: boolean
  /** Whether main has been asked yet: one ask serves every subscriber. */
  loadStarted: boolean

  /** Ask main who is signed in, once; later calls are no-ops. */
  load: () => Promise<void>
  /**
   * Main runs the sign-in in the user's browser and establishes the Worker
   * session. Resolves `true` once signed in and `false` when the sign-in was
   * cancelled — by the user in the browser, or by `cancelGoogleSignIn` —
   * which is not a failure.
   */
  signInWithGoogle: () => Promise<boolean>
  /** End the sign-in under way, if any; its `signInWithGoogle` then resolves `false`. */
  cancelGoogleSignIn: () => Promise<void>
  logout: () => Promise<void>
}

const initialState = { user: null, loading: true, loadStarted: false }

export const useAuthStore = create<AuthStore>((set, get) => ({
  ...initialState,

  load: async () => {
    if (get().loadStarted) return
    set({ loadStarted: true })
    try {
      const user = await window.api.auth.current()
      set({ user, loading: false })
    } catch (error) {
      console.warn('[auth] could not read the session:', error)
      set({ loading: false })
    }
  },

  signInWithGoogle: async () => {
    let user: AuthUser
    try {
      ;({ user } = await window.api.auth.googleSignIn())
    } catch (error) {
      if (isSignInCancelled(error)) return false
      throw error
    }
    set({ user, loading: false })
    return true
  },

  cancelGoogleSignIn: () => window.api.auth.cancelSignIn(),

  logout: async () => {
    await window.api.auth.signOut()
    set({ user: null })
  }
}))

/** Back to before anyone asked main: for tests, which share the module. */
export function resetAuthStore(): void {
  useAuthStore.setState(initialState)
}
