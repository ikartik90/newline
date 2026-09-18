import { useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'

/** The wrapper the IPC bridge puts around a message from main, cut off for the reader. */
const IPC_PREFIX = /^Error invoking remote method '[^']*': /

function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export default function AuthScreen() {
  const { signInWithGoogle, cancelGoogleSignIn } = useAuth()
  const [error, setError] = useState('')
  /** The browser has the sign-in; the screen waits for it, or for Cancel. */
  const [googlePending, setGooglePending] = useState(false)

  const handleGoogleSignIn = async () => {
    setError('')
    setGooglePending(true)
    try {
      // Resolves false on a cancellation, which is nothing to report.
      await signInWithGoogle()
    } catch (err) {
      setError((err as Error).message.replace(IPC_PREFIX, ''))
    } finally {
      setGooglePending(false)
    }
  }

  const handleCancelGoogleSignIn = () => {
    // Main ends the attempt; the pending sign-in above then settles and the button returns.
    void cancelGoogleSignIn()
  }

  return (
    <div className="h-screen flex items-center justify-center bg-canvas text-fg">
      <div className="w-full max-w-sm px-8 flex flex-col items-center text-center">
        <h1 className="text-style-title text-fg-title">Newline</h1>
        <p className="text-style-body-sm text-fg-body/50">A minimal place for your thoughts.</p>

        <div className="mt-8 min-h-10 flex items-center justify-center">
          {googlePending ? (
            <div role="status" className="flex items-center gap-3 text-style-body-sm text-fg-body">
              <span>Finish signing in in your browser…</span>
              <Button variant="link" onClick={handleCancelGoogleSignIn}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button onClick={handleGoogleSignIn}>
              <GoogleLogo />
              <Button.Text>Continue with Google</Button.Text>
            </Button>
          )}
        </div>

        {error && (
          <p role="alert" className="mt-4 text-style-caption text-red-500">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
